import { AccessToken, AgentDispatchClient, RoomServiceClient, type VideoGrant } from 'livekit-server-sdk';
import type { Role } from '@mirotalk/contracts';

export class LiveKitService {
  private readonly rooms: RoomServiceClient;
  private readonly agents: AgentDispatchClient;

  constructor(
    private readonly url: string,
    private readonly apiKey: string,
    private readonly apiSecret: string,
  ) {
    this.rooms = new RoomServiceClient(url.replace(/^ws/, 'http'), apiKey, apiSecret);
    this.agents = new AgentDispatchClient(url.replace(/^ws/, 'http'), apiKey, apiSecret);
  }

  async ensureRoom(roomId: string, maxParticipants: number): Promise<void> {
    const existing = await this.rooms.listRooms([roomId]);
    if (!existing.length) await this.rooms.createRoom({ name: roomId, maxParticipants, emptyTimeout: 300 });
  }

  async issueJoinToken(input: {
    roomId: string;
    actorId: string;
    displayName: string;
    role: Role;
  }): Promise<string> {
    const canPublish = input.role !== 'viewer';
    const grant: VideoGrant = {
      room: input.roomId,
      roomJoin: true,
      canPublish,
      canSubscribe: true,
      canPublishData: true,
      roomAdmin: input.role === 'host' || input.role === 'moderator',
    };
    const token = new AccessToken(this.apiKey, this.apiSecret, {
      identity: input.actorId,
      name: input.displayName,
      ttl: '1h',
      metadata: JSON.stringify({ role: input.role }),
    });
    token.addGrant(grant);
    return token.toJwt();
  }

  async hasParticipant(roomId: string, identity: string): Promise<boolean> {
    const participants = await this.rooms.listParticipants(roomId);
    return participants.some((participant) => participant.identity === identity);
  }

  async dispatchTranslator(roomId: string, agentName: string, metadata: object): Promise<string> {
    const dispatch = await this.agents.createDispatch(roomId, agentName, {
      metadata: JSON.stringify(metadata),
    });
    return dispatch.id;
  }
}
