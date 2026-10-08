import { useEffect } from 'react';
import { io } from 'socket.io-client';
import type { EventEnvelope, ParticipantPresence, RoomSnapshot } from '@mirotalk/contracts';
import { useMeetingStore } from '../state/meeting';

export function useControlSocket(token: string | null) {
  const applySnapshot = useMeetingStore((state) => state.applySnapshot);
  const participantJoined = useMeetingStore((state) => state.participantJoined);
  const participantLeft = useMeetingStore((state) => state.participantLeft);

  useEffect(() => {
    if (!token) return;
    const socket = io(import.meta.env.VITE_CONTROL_URL ?? window.location.origin, {
      path: '/control/socket.io',
      transports: ['websocket'],
      auth: { token },
    });
    socket.on('connect', () => {
      socket.emit('room:join', { lastSequence: useMeetingStore.getState().sequence });
    });
    socket.on('room:snapshot', (snapshot: RoomSnapshot) => applySnapshot(snapshot));
    socket.on('participant:joined', (event: EventEnvelope<ParticipantPresence>) =>
      participantJoined(event.payload, event.sequence),
    );
    socket.on('participant:left', (event: EventEnvelope<{ sessionId: string }>) =>
      participantLeft(event.payload.sessionId, event.sequence),
    );
    return () => {
      socket.disconnect();
    };
  }, [token, applySnapshot, participantJoined, participantLeft]);
}
