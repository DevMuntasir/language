import { Value } from '@sinclair/typebox/value';
import { CreateRoomBodySchema, RoomPolicySchema } from './index.js';

describe('public contracts', () => {
  it('accepts the supported production room policy', () => {
    expect(
      Value.Check(RoomPolicySchema, {
        maxParticipants: 50,
        waitingRoom: false,
        locked: false,
        joinLocked: false,
        e2ee: true,
        transcriptionAllowed: false,
        liveTranslationAllowed: false,
      }),
    ).toBe(true);
  });

  it('rejects unsafe room identifiers and participant limits', () => {
    expect(Value.Check(CreateRoomBodySchema, { roomId: '../other-room', displayName: 'Guest' })).toBe(false);
    expect(
      Value.Check(RoomPolicySchema, {
        maxParticipants: 51,
        waitingRoom: false,
        locked: false,
        joinLocked: false,
        e2ee: false,
        transcriptionAllowed: false,
        liveTranslationAllowed: false,
      }),
    ).toBe(false);
  });
});
