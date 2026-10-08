import { ExternalE2EEKeyProvider, Room } from 'livekit-client';

export async function createMeetingRoom(encodedKey: string | null): Promise<Room> {
  const base = { adaptiveStream: true, dynacast: true } as const;
  if (!encodedKey) return new Room(base);

  const keyProvider = new ExternalE2EEKeyProvider();
  await keyProvider.setKey(encodedKey);
  const worker = new Worker(new URL('livekit-client/e2ee-worker', import.meta.url));
  return new Room({ ...base, e2ee: { keyProvider, worker } });
}

export function generateE2eeKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return toBase64Url(bytes);
}

export function e2eeKeyFromFragment(): string | null {
  return new URLSearchParams(window.location.hash.slice(1)).get('key');
}

function toBase64Url(value: Uint8Array): string {
  let binary = '';
  value.forEach((byte) => (binary += String.fromCharCode(byte)));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
