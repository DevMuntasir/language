import type {
  CreateRoomBody,
  JoinRoomBody,
  RoomPolicy,
  Role,
  TranslationLanguage,
  TranslationSessionResponse,
} from '@mirotalk/contracts';

const API_BASE = import.meta.env.VITE_CONTROL_URL ?? '';

export interface JoinCredentials {
  roomId: string;
  actorId: string;
  sessionId: string;
  role: Role;
  policy: RoomPolicy;
  controlToken: string;
  livekit: { url: string; token: string };
}

export async function createRoom(body: CreateRoomBody) {
  return request<{
    room: { id: string; policy: RoomPolicy };
    controlToken: string;
    joinUrl: string;
  }>('/api/v2/rooms', { method: 'POST', body: JSON.stringify(body) });
}

export async function getRoomStatus(roomId: string) {
  return request<{
    id: string;
    status: 'active' | 'ended';
    policy: RoomPolicy;
    participantCount: number;
    atCapacity: boolean;
  }>(`/api/v2/rooms/${encodeURIComponent(roomId)}/status`);
}

export async function joinRoom(roomId: string, body: JoinRoomBody, existingToken?: string) {
  return request<JoinCredentials>(`/api/v2/rooms/${encodeURIComponent(roomId)}/join-token`, {
    method: 'POST',
    body: JSON.stringify(body),
    ...(existingToken ? { headers: { Authorization: `Bearer ${existingToken}` } } : {}),
  });
}

export async function createTranslationSession(
  roomId: string,
  controlToken: string,
  input: { targetLanguage: TranslationLanguage; sourceParticipantIdentity: string; consent: true },
) {
  return request<TranslationSessionResponse>(
    `/api/v2/rooms/${encodeURIComponent(roomId)}/translation/sessions`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${controlToken}` },
      body: JSON.stringify(input),
    },
  );
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });
  const body = (await response.json()) as T & { message?: string };
  if (!response.ok) throw new Error(body.message ?? `Request failed (${response.status})`);
  return body;
}
