import { useEffect, useMemo, useState } from 'react';
import { AudioTrack, useTracks } from '@livekit/components-react';
import { RemoteAudioTrack, Track } from 'livekit-client';
import type { TranslationLanguage } from '@mirotalk/contracts';
import type { JoinCredentials } from '../api/client';
import { createTranslationSession } from '../api/client';
import { useRealtimeTranslation } from '../media/useRealtimeTranslation';

interface MeetingInterpreterProps {
  enabled: boolean;
  targetLanguage: TranslationLanguage;
  credentials: JoinCredentials;
}

type TrackItem = ReturnType<typeof useTracks>[number];
type SubscribedTrack = TrackItem & { publication: NonNullable<TrackItem['publication']> };

export function MeetingInterpreter(props: MeetingInterpreterProps) {
  const tracks = useTracks([Track.Source.Microphone, Track.Source.ScreenShareAudio], {
    onlySubscribed: true,
  });
  const remoteTracks = tracks.filter(
    (reference): reference is SubscribedTrack => Boolean(reference.publication) && !reference.participant.isLocal,
  );
  return (
    <>
      {remoteTracks.map((reference) => {
        const key = `${reference.participant.identity}:${reference.source}`;
        if (reference.source !== Track.Source.Microphone) return <AudioTrack key={key} trackRef={reference} />;
        return <InterpretedTrack key={key} trackRef={reference} {...props} />;
      })}
    </>
  );
}

function InterpretedTrack({
  trackRef,
  enabled,
  targetLanguage,
  credentials,
}: MeetingInterpreterProps & { trackRef: SubscribedTrack }) {
  const metadata = useMemo(() => parseMetadata(trackRef.participant.metadata), [trackRef.participant.metadata]);
  const isMyTranslator =
    metadata.kind === 'translator' &&
    metadata.requesterIdentity === credentials.actorId &&
    metadata.targetLanguage === targetLanguage;
  const isTranslator = metadata.kind === 'translator';
  const mediaTrack = trackRef.publication.track;
  const sourceTrack = mediaTrack instanceof RemoteAudioTrack ? mediaTrack.mediaStreamTrack : undefined;
  const directEnabled = enabled && targetLanguage === 'en' && !isTranslator;
  const translation = useRealtimeTranslation({
    enabled: directEnabled,
    roomId: credentials.roomId,
    controlToken: credentials.controlToken,
    sourceParticipantIdentity: trackRef.participant.identity,
    sourceTrack,
  });

  useEffect(() => {
    if (!enabled || targetLanguage !== 'bn' || isTranslator) return;
    void createTranslationSession(credentials.roomId, credentials.controlToken, {
      targetLanguage: 'bn',
      sourceParticipantIdentity: trackRef.participant.identity,
      consent: true,
    }).catch(() => undefined);
  }, [credentials.controlToken, credentials.roomId, enabled, isTranslator, targetLanguage, trackRef.participant.identity]);

  const hiddenForeignTranslator = isTranslator && !isMyTranslator;
  const originalVolume = enabled && !isTranslator ? 0.18 : 1;
  return (
    <>
      <AudioTrack trackRef={trackRef} volume={hiddenForeignTranslator ? 0 : originalVolume} />
      {directEnabled && (
        <section className="translation-caption" aria-live="polite">
          <div className="translation-caption__title">
            English interpreter · {translation.state}
          </div>
          {translation.sourceTranscript && <small>{translation.sourceTranscript}</small>}
          {translation.translatedTranscript && <strong>{translation.translatedTranscript}</strong>}
          {!translation.sourceTranscript && !translation.translatedTranscript && !translation.error && (
            <small>
              {translation.state === 'connecting'
                ? 'Connecting to interpreter…'
                : 'Listening — ask the remote participant to speak Bangla.'}
            </small>
          )}
          {translation.error && <span>{translation.error}</span>}
        </section>
      )}
    </>
  );
}

function parseMetadata(raw?: string): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}
