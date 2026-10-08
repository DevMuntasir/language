import { useEffect, useState } from 'react';
import { createTranslationSession } from '../api/client';

export type TranslationState = 'idle' | 'connecting' | 'listening' | 'unavailable';

interface TranscriptEvent {
  type?: string;
  delta?: string;
  message?: string;
  error?: { message?: string };
}

export function useRealtimeTranslation(input: {
  enabled: boolean;
  roomId: string;
  controlToken: string;
  sourceParticipantIdentity: string;
  sourceTrack: MediaStreamTrack | undefined;
}) {
  const [state, setState] = useState<TranslationState>('idle');
  const [sourceTranscript, setSourceTranscript] = useState('');
  const [translatedTranscript, setTranslatedTranscript] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!input.enabled || !input.sourceTrack) {
      setState('idle');
      return;
    }
    const controller = new AbortController();
    const peer = new RTCPeerConnection();
    const connectionTimeout = window.setTimeout(() => {
      if (peer.connectionState !== 'connected') {
        setError('Interpreter connection timed out. Rejoin the meeting and try again.');
        setState('unavailable');
      }
    }, 15_000);
    const translatedAudio = new Audio();
    translatedAudio.autoplay = true;
    translatedAudio.volume = 1;

    async function connect() {
      setState('connecting');
      setError('');
      setSourceTranscript('');
      setTranslatedTranscript('');
      try {
        const secret = await createTranslationSession(input.roomId, input.controlToken, {
          targetLanguage: 'en',
          sourceParticipantIdentity: input.sourceParticipantIdentity,
          consent: true,
        });
        if (secret.mode !== 'browser-realtime') throw new Error('Unexpected interpreter mode');
        if (controller.signal.aborted) return;

        const sourceStream = new MediaStream([input.sourceTrack!]);
        peer.addTrack(input.sourceTrack!, sourceStream);
        peer.ontrack = ({ track, streams }) => {
          translatedAudio.srcObject = streams[0] ?? new MediaStream([track]);
          void translatedAudio.play().catch(() => undefined);
        };
        peer.onconnectionstatechange = () => {
          if (peer.connectionState === 'connected') setState('listening');
          if (['failed', 'disconnected'].includes(peer.connectionState)) setState('unavailable');
        };
        const events = peer.createDataChannel('oai-events');
        events.onopen = () => setState('listening');
        events.onerror = () => {
          setError('Interpreter event channel failed');
          setState('unavailable');
        };
        events.onmessage = ({ data }) => {
          try {
            const event = JSON.parse(String(data)) as TranscriptEvent;
            if (event.type === 'session.input_transcript.delta' && event.delta) {
              setSourceTranscript((current) => appendTranscript(current, event.delta!));
            }
            if (event.type === 'session.output_transcript.delta' && event.delta) {
              setTranslatedTranscript((current) => appendTranscript(current, event.delta!));
            }
            if (event.type === 'error') throw new Error(event.error?.message ?? event.message ?? 'Translation failed');
          } catch (cause) {
            if (cause instanceof SyntaxError) return;
            setError(cause instanceof Error ? cause.message : 'Translation failed');
            setState('unavailable');
          }
        };

        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        const response = await fetch('https://api.openai.com/v1/realtime/translations/calls', {
          method: 'POST',
          headers: { Authorization: `Bearer ${secret.value}`, 'Content-Type': 'application/sdp' },
          body: offer.sdp ?? '',
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Interpreter connection failed (${response.status})`);
        await peer.setRemoteDescription({ type: 'answer', sdp: await response.text() });
      } catch (cause) {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : 'Translation failed');
        setState('unavailable');
      }
    }

    void connect();
    return () => {
      controller.abort();
      window.clearTimeout(connectionTimeout);
      peer.close();
      translatedAudio.pause();
      translatedAudio.srcObject = null;
    };
  }, [
    input.controlToken,
    input.enabled,
    input.roomId,
    input.sourceParticipantIdentity,
    input.sourceTrack,
  ]);

  return { state, sourceTranscript, translatedTranscript, error };
}

function appendTranscript(current: string, delta: string): string {
  const next = `${current}${delta}`;
  return next.length > 600 ? next.slice(-600) : next;
}
