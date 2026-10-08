import { useMeetingStore } from '../state/meeting';

export function ParticipantSidebar() {
  // Zustand selectors must return a stable reference while the store is
  // unchanged. Creating an array inside the selector makes React 19's
  // external-store snapshot change on every read and causes error #185.
  const participantsById = useMeetingStore((state) => state.participants);
  const participants = Object.values(participantsById);
  return (
    <aside className="participants" aria-label="Participants">
      <h2>Participants <span>{participants.length}</span></h2>
      <ul>
        {participants.map((participant) => (
          <li key={participant.sessionId}>
            <span className="avatar" aria-hidden="true">{participant.displayName.slice(0, 1).toUpperCase()}</span>
            <span>{participant.displayName}</span>
            <small>{participant.role}</small>
          </li>
        ))}
      </ul>
    </aside>
  );
}
