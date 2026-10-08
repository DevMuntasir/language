import { Static, Type } from '@sinclair/typebox';

export const RoleSchema = Type.Union([
  Type.Literal('host'),
  Type.Literal('moderator'),
  Type.Literal('participant'),
  Type.Literal('viewer'),
]);
export type Role = Static<typeof RoleSchema>;

export const RoomPolicySchema = Type.Object({
  maxParticipants: Type.Integer({ minimum: 2, maximum: 50, default: 50 }),
  waitingRoom: Type.Boolean({ default: false }),
  locked: Type.Boolean({ default: false }),
  joinLocked: Type.Boolean({ default: false }),
  e2ee: Type.Boolean({ default: false }),
  transcriptionAllowed: Type.Boolean({ default: false }),
  liveTranslationAllowed: Type.Boolean({ default: false }),
});
export type RoomPolicy = Static<typeof RoomPolicySchema>;

export const CreateRoomBodySchema = Type.Object({
  roomId: Type.Optional(Type.String({ minLength: 3, maxLength: 80, pattern: '^[a-zA-Z0-9_-]+$' })),
  displayName: Type.String({ minLength: 1, maxLength: 80 }),
  policy: Type.Optional(Type.Partial(RoomPolicySchema)),
});
export type CreateRoomBody = Static<typeof CreateRoomBodySchema>;

export const JoinRoomBodySchema = Type.Object({
  displayName: Type.String({ minLength: 1, maxLength: 80 }),
  role: Type.Optional(Type.Union([Type.Literal('participant'), Type.Literal('viewer')])),
});
export type JoinRoomBody = Static<typeof JoinRoomBodySchema>;

export const TranslationLanguageSchema = Type.Union([Type.Literal('bn'), Type.Literal('en')]);
export type TranslationLanguage = Static<typeof TranslationLanguageSchema>;

export const TranslationSessionBodySchema = Type.Object({
  targetLanguage: TranslationLanguageSchema,
  sourceParticipantIdentity: Type.String({ minLength: 1, maxLength: 128 }),
  consent: Type.Literal(true),
});
export type TranslationSessionBody = Static<typeof TranslationSessionBodySchema>;

export const TranslationSessionResponseSchema = Type.Union([
  Type.Object({
    mode: Type.Literal('browser-realtime'),
    value: Type.String({ minLength: 1 }),
    expiresAt: Type.Optional(Type.Integer()),
  }),
  Type.Object({
    mode: Type.Literal('agent'),
    dispatchId: Type.String({ minLength: 1 }),
  }),
]);
export type TranslationSessionResponse = Static<typeof TranslationSessionResponseSchema>;

export const RoomActionBodySchema = Type.Object({
  action: Type.Union([
    Type.Literal('lock'),
    Type.Literal('unlock'),
    Type.Literal('join-lock'),
    Type.Literal('join-unlock'),
    Type.Literal('end'),
  ]),
});
export type RoomActionBody = Static<typeof RoomActionBodySchema>;

export const WebhookSubscriptionBodySchema = Type.Object({
  url: Type.String({ minLength: 12, maxLength: 2048, pattern: '^https://' }),
  events: Type.Array(
    Type.Union([
      Type.Literal('room.started'),
      Type.Literal('room.ended'),
      Type.Literal('participant.joined'),
      Type.Literal('participant.left'),
      Type.Literal('transcription.completed'),
    ]),
    { minItems: 1, maxItems: 5, uniqueItems: true },
  ),
});
export type WebhookSubscriptionBody = Static<typeof WebhookSubscriptionBodySchema>;

export const ErrorResponseSchema = Type.Object({
  code: Type.String(),
  message: Type.String(),
  requestId: Type.String(),
  details: Type.Optional(Type.Unknown()),
});
export type ErrorResponse = Static<typeof ErrorResponseSchema>;

export interface EventEnvelope<T = unknown> {
  eventId: string;
  roomId: string;
  sessionId: string;
  actorId: string;
  sequence: number;
  occurredAt: string;
  payload: T;
}

export interface ParticipantPresence {
  sessionId: string;
  actorId: string;
  displayName: string;
  role: Role;
  joinedAt: string;
}

export interface RoomSnapshot {
  roomId: string;
  sequence: number;
  participants: ParticipantPresence[];
  operations: EventEnvelope[];
}

export interface ControlTokenClaims {
  sub: string;
  sessionId: string;
  roomId: string;
  displayName: string;
  role: Role;
}
