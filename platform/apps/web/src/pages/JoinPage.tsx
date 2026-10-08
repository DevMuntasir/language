import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import {
  ControlBar,
  LayoutContextProvider,
  LiveKitRoom,
  StartAudio,
} from '@livekit/components-react';
import type { RoomPolicy, TranslationLanguage } from '@mirotalk/contracts';
import { Room } from 'livekit-client';
import { getRoomStatus, joinRoom } from '../api/client';
import { createMeetingRoom, e2eeKeyFromFragment } from '../media/e2ee';
import { useMeetingStore } from '../state/meeting';
import { useControlSocket } from '../realtime/useControlSocket';
import { MeetingGrid } from '../components/MeetingGrid';
import { ParticipantSidebar } from '../components/ParticipantSidebar';
import { MeetingErrorBoundary } from '../components/MeetingErrorBoundary';
import { MeetingInterpreter } from '../components/MeetingInterpreter';

export function JoinPage() {
  const { roomId = '' } = useParams();
  const location = useLocation();
  const [displayName, setDisplayName] = useState((location.state as { displayName?: string } | null)?.displayName ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [room, setRoom] = useState<Room | null>(null);
  const [roomReady, setRoomReady] = useState(false);
  const [meetingError, setMeetingError] = useState('');
  const [policy, setPolicy] = useState<RoomPolicy | null>(null);
  const [translationEnabled, setTranslationEnabled] = useState(false);
  const [targetLanguage, setTargetLanguage] = useState<TranslationLanguage>('en');
  const credentials = useMeetingStore((state) => state.credentials);
  const setCredentials = useMeetingStore((state) => state.setCredentials);
  const reset = useMeetingStore((state) => state.reset);
  const e2eeKey = useMemo(() => e2eeKeyFromFragment(), []);

  useEffect(() => {
    if (!e2eeKey) {
      setRoomReady(true);
      return () => reset();
    }
    void createMeetingRoom(e2eeKey)
      .then((encryptedRoom) => {
        setRoom(encryptedRoom);
        setRoomReady(true);
      })
      .catch((cause) => setError(String(cause)));
    return () => {
      reset();
      setRoom((current) => {
        void current?.disconnect();
        return null;
      });
    };
  }, [e2eeKey, reset]);

  useControlSocket(credentials?.controlToken ?? null);

  useEffect(() => {
    if (credentials) return;
    void getRoomStatus(roomId)
      .then((status) => setPolicy(status.policy))
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load room'));
  }, [credentials, roomId]);

  async function onJoin(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const status = await getRoomStatus(roomId);
      setPolicy(status.policy);
      if (status.policy.e2ee && !e2eeKey) throw new Error('This room requires its complete encrypted invite link.');
      if (!status.policy.e2ee && e2eeKey) throw new Error('This room is not configured for end-to-end encryption.');
      const hostToken = sessionStorage.getItem(`mirotalk:host:${roomId}`) ?? undefined;
      const joined = await joinRoom(roomId, { displayName }, hostToken);
      sessionStorage.setItem(`mirotalk:session:${roomId}`, joined.controlToken);
      setCredentials(joined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not join room');
    } finally {
      setBusy(false);
    }
  }

  if (!credentials || !roomReady) {
    return (
      <main className="prejoin">
        <form className="join-card" onSubmit={onJoin}>
          <p className="eyebrow">ROOM</p>
          <h1>{roomId}</h1>
          <label>
            Your name
            <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={80} required />
          </label>
          {e2eeKey && <p className="security-note">End-to-end encryption is enabled for this room.</p>}
          {policy?.liveTranslationAllowed && !policy.e2ee && (
            <fieldset className="translation-options">
              <legend>Live interpreter</legend>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={translationEnabled}
                  onChange={(event) => setTranslationEnabled(event.target.checked)}
                />
                I consent to AI processing remote speech for live translation
              </label>
              {translationEnabled && (
                <label>
                  I want to hear
                  <select value={targetLanguage} onChange={(event) => setTargetLanguage(event.target.value as TranslationLanguage)}>
                    <option value="en">English — realtime voice</option>
                    <option value="bn">বাংলা — interpreter voice</option>
                  </select>
                </label>
              )}
              <p className="privacy-note">Original audio stays audible at low volume for context.</p>
            </fieldset>
          )}
          {error && <p className="error" role="alert">{error}</p>}
          <button className="primary" disabled={busy || !roomReady}>{busy ? 'Joining…' : 'Join meeting'}</button>
        </form>
      </main>
    );
  }

  const roomConfiguration = room
    ? { room }
    : { options: { adaptiveStream: true, dynacast: true } };

  return (
    <MeetingErrorBoundary>
      <LiveKitRoom
        {...roomConfiguration}
        token={credentials.livekit.token}
        serverUrl={credentials.livekit.url}
        connect
        onError={(cause) => setMeetingError(cause.message)}
        onEncryptionError={(cause) => setMeetingError(cause.message)}
      >
        <LayoutContextProvider>
          <main className="meeting-shell" data-lk-theme="default">
            <header>
              {/* <strong>MiroTalk</strong> */}
              <span>{roomId}</span>
              {credentials.policy.e2ee && <span className="secure">E2EE</span>}
              {translationEnabled && <span className="interpreter-badge">AI {targetLanguage === 'bn' ? 'বাংলা' : 'English'}</span>}
            </header>
            {meetingError && <div className="meeting-error" role="alert">{meetingError}</div>}
            <MeetingGrid />
            <ParticipantSidebar />
            <footer><ControlBar controls={{ chat: true, screenShare: true, leave: true }} /></footer>
            <MeetingInterpreter
              enabled={translationEnabled}
              targetLanguage={targetLanguage}
              credentials={credentials}
            />
            <StartAudio label="Enable meeting audio" />
          </main>
        </LayoutContextProvider>
      </LiveKitRoom>
    </MeetingErrorBoundary>
  );
}
