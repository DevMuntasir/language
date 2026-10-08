import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { createRoom } from '../api/client';
import { generateE2eeKey } from '../media/e2ee';

export function HomePage() {
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState('');
  const [roomId, setRoomId] = useState('');
  const [e2ee, setE2ee] = useState(false);
  const [liveTranslation, setLiveTranslation] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await createRoom({
        ...(roomId ? { roomId } : {}),
        displayName,
        policy: { e2ee, liveTranslationAllowed: liveTranslation && !e2ee },
      });
      sessionStorage.setItem(`mirotalk:host:${result.room.id}`, result.controlToken);
      const fragment = e2ee ? `#key=${generateE2eeKey()}` : '';
      navigate(`/join/${encodeURIComponent(result.room.id)}${fragment}`, { state: { displayName } });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create room');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="landing">
      <section className="hero">
        <p className="eyebrow">MIROTALK NEXT</p>
        <h1>Fast, private meetings that scale.</h1>
        <p>Create a secure browser-based video room with no installation.</p>
      </section>
      <form className="join-card" onSubmit={onCreate}>
        <h2>Start a meeting</h2>
        <label>
          Your name
          <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={80} required />
        </label>
        <label>
          Room name <small>(optional)</small>
          <input
            value={roomId}
            onChange={(event) => setRoomId(event.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
            minLength={3}
            maxLength={80}
          />
        </label>
        <label className="check-row">
          <input
            type="checkbox"
            checked={e2ee}
            onChange={(event) => {
              setE2ee(event.target.checked);
              if (event.target.checked) setLiveTranslation(false);
            }}
          />
          End-to-end encrypted room
        </label>
        <label className="check-row">
          <input
            type="checkbox"
            checked={liveTranslation}
            disabled={e2ee}
            onChange={(event) => setLiveTranslation(event.target.checked)}
          />
          Allow AI live interpretation (Bangla ↔ English)
        </label>
        {liveTranslation && (
          <p className="privacy-note">Participants must opt in. Interpreter audio is processed by configured AI providers.</p>
        )}
        {error && <p className="error" role="alert">{error}</p>}
        <button className="primary" disabled={busy}>{busy ? 'Creating…' : 'Create room'}</button>
      </form>
    </main>
  );
}
