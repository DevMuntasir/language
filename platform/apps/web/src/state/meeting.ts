import { create } from 'zustand';
import type { ParticipantPresence, RoomSnapshot } from '@mirotalk/contracts';
import type { JoinCredentials } from '../api/client';

interface MeetingState {
  credentials: JoinCredentials | null;
  participants: Record<string, ParticipantPresence>;
  sequence: number;
  setCredentials: (credentials: JoinCredentials) => void;
  applySnapshot: (snapshot: RoomSnapshot) => void;
  participantJoined: (participant: ParticipantPresence, sequence: number) => void;
  participantLeft: (sessionId: string, sequence: number) => void;
  reset: () => void;
}

export const useMeetingStore = create<MeetingState>((set) => ({
  credentials: null,
  participants: {},
  sequence: 0,
  setCredentials: (credentials) => set({ credentials }),
  applySnapshot: (snapshot) =>
    set({
      sequence: snapshot.sequence,
      participants: Object.fromEntries(snapshot.participants.map((participant) => [participant.sessionId, participant])),
    }),
  participantJoined: (participant, sequence) =>
    set((state) => ({
      sequence: Math.max(sequence, state.sequence),
      participants: { ...state.participants, [participant.sessionId]: participant },
    })),
  participantLeft: (sessionId, sequence) =>
    set((state) => {
      const participants = { ...state.participants };
      delete participants[sessionId];
      return { participants, sequence: Math.max(sequence, state.sequence) };
    }),
  reset: () => set({ credentials: null, participants: {}, sequence: 0 }),
}));
