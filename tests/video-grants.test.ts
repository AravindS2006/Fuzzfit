import { describe, expect, it } from 'vitest';
import { AccessToken, TokenVerifier } from 'livekit-server-sdk';
import { classVideoGrant } from '../src/lib/video-grants';
import { existingVideoRoomName, newVideoRoomName } from '../src/lib/room-identity';

describe('class meeting publication permissions', () => {
  it('keeps migrated live sessions in their original room and starts new sessions under Geez Squad', () => {
    const legacy = existingVideoRoomName({ id: 'test-class', videoRoomName: null });
    expect(legacy).toBe('fuzzfit-test-class');
    expect(classVideoGrant('test-class', false, legacy).room).toBe(legacy);
    const created = newVideoRoomName('new-class');
    expect(existingVideoRoomName({ id: 'new-class', videoRoomName: created })).toBe(
      'geez-squad-new-class',
    );
  });
  const key = 'test-key';
  const secret = 'test-secret-for-signed-token-verification';

  async function permissions(isCoach: boolean) {
    const token = new AccessToken(key, secret, { identity: 'test-user', ttl: '5m' });
    token.addGrant(classVideoGrant('test-class', isCoach));
    return (await new TokenVerifier(key, secret).verify(await token.toJwt())).video!;
  }

  it('lets the class coach present video and optional tab audio', async () => {
    const grant = await permissions(true);
    expect(grant.canPublishSources).toEqual([
      'camera',
      'microphone',
      'screen_share',
      'screen_share_audio',
    ]);
    expect(grant.room).toBe('geez-squad-test-class');
  });

  it('keeps trainees limited to their camera and microphone', async () => {
    const grant = await permissions(false);
    expect(grant.canPublishSources).toEqual(['camera', 'microphone']);
    expect(grant.canPublishSources).not.toContain('screen_share');
    expect(grant.canPublishSources).not.toContain('screen_share_audio');
    expect(grant.canSubscribe).toBe(true);
  });

  it.each([true, false])(
    'gives no room administration, recording or metadata grant (coach=%s)',
    async (isCoach) => {
      const grant = await permissions(isCoach);
      expect(grant.roomAdmin).not.toBe(true);
      expect(grant.roomRecord).not.toBe(true);
      expect(grant.canPublishData).toBe(false);
      expect(grant.canUpdateOwnMetadata).toBe(false);
    },
  );
});
