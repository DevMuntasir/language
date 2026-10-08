import type { Pool, PoolClient } from 'pg';
import type { Role, RoomPolicy } from '@mirotalk/contracts';

export interface RoomRecord {
  id: string;
  status: 'active' | 'ended';
  policy: RoomPolicy;
  createdAt: string;
  endedAt: string | null;
}

const DEFAULT_POLICY: RoomPolicy = {
  maxParticipants: 50,
  waitingRoom: false,
  locked: false,
  joinLocked: false,
  e2ee: false,
  transcriptionAllowed: false,
  liveTranslationAllowed: false,
};

export class RoomRepository {
  constructor(private readonly pool: Pool) {}

  async create(roomId: string, actorId: string, policy: Partial<RoomPolicy>): Promise<RoomRecord> {
    const normalized = { ...DEFAULT_POLICY, ...policy };
    const result = await this.pool.query(
      `INSERT INTO rooms (id, created_by, policy)
       VALUES ($1, $2, $3::jsonb)
       RETURNING id, status, policy, created_at, ended_at`,
      [roomId, actorId, JSON.stringify(normalized)],
    );
    return mapRoom(result.rows[0]);
  }

  async get(roomId: string): Promise<RoomRecord | null> {
    const result = await this.pool.query(
      'SELECT id, status, policy, created_at, ended_at FROM rooms WHERE id = $1',
      [roomId],
    );
    return result.rowCount ? mapRoom(result.rows[0]) : null;
  }

  async createSession(input: { id: string; roomId: string; actorId: string; role: Role }): Promise<void> {
    await this.pool.query(
      `INSERT INTO room_sessions (id, room_id, actor_id, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO NOTHING`,
      [input.id, input.roomId, input.actorId, input.role],
    );
  }

  async endSession(sessionId: string): Promise<void> {
    await this.pool.query(
      'UPDATE room_sessions SET left_at = COALESCE(left_at, now()) WHERE id = $1',
      [sessionId],
    );
  }

  async applyAction(roomId: string, action: string, actorId: string, role: Role): Promise<RoomRecord | null> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const current = await client.query('SELECT * FROM rooms WHERE id = $1 FOR UPDATE', [roomId]);
      if (!current.rowCount) {
        await client.query('ROLLBACK');
        return null;
      }
      const policy = { ...DEFAULT_POLICY, ...(current.rows[0].policy as Partial<RoomPolicy>) };
      if (action === 'lock') policy.locked = true;
      if (action === 'unlock') policy.locked = false;
      if (action === 'join-lock') policy.joinLocked = true;
      if (action === 'join-unlock') policy.joinLocked = false;
      const endedAt = action === 'end' ? new Date().toISOString() : null;
      const updated = await client.query(
        `UPDATE rooms SET policy = $2::jsonb,
          status = CASE WHEN $3::timestamptz IS NULL THEN status ELSE 'ended' END,
          ended_at = COALESCE($3::timestamptz, ended_at), updated_at = now()
         WHERE id = $1 RETURNING id, status, policy, created_at, ended_at`,
        [roomId, JSON.stringify(policy), endedAt],
      );
      await writeAudit(client, actorId, roomId, role, `room.${action}`);
      await client.query('COMMIT');
      return mapRoom(updated.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async stats(): Promise<{ totalRooms: number; activeRooms: number }> {
    const result = await this.pool.query(
      `SELECT count(*)::int AS total_rooms,
              count(*) FILTER (WHERE status = 'active')::int AS active_rooms
       FROM rooms`,
    );
    return { totalRooms: result.rows[0].total_rooms, activeRooms: result.rows[0].active_rooms };
  }

  async createWebhook(input: { id: string; url: string; encryptedSecret: string; events: string[] }): Promise<void> {
    await this.pool.query(
      `INSERT INTO webhook_subscriptions (id, url, signing_secret_ciphertext, events)
       VALUES ($1, $2, $3, $4)`,
      [input.id, input.url, input.encryptedSecret, input.events],
    );
  }
}

async function writeAudit(client: PoolClient, actorId: string, roomId: string, role: Role, action: string) {
  await client.query(
    'INSERT INTO audit_events (actor_id, room_id, actor_role, action) VALUES ($1, $2, $3, $4)',
    [actorId, roomId, role, action],
  );
}

function mapRoom(row: Record<string, unknown>): RoomRecord {
  return {
    id: String(row.id),
    status: row.status as RoomRecord['status'],
    policy: { ...DEFAULT_POLICY, ...(row.policy as Partial<RoomPolicy>) },
    createdAt: new Date(row.created_at as string).toISOString(),
    endedAt: row.ended_at ? new Date(row.ended_at as string).toISOString() : null,
  };
}
