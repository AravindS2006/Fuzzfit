import { TrackSource, type VideoGrant } from 'livekit-server-sdk';

export function classVideoGrant(classId: string, isCoach: boolean): VideoGrant {
  return {
    roomJoin: true,
    room: `fuzzfit-${classId}`,
    canPublish: true,
    canSubscribe: true,
    canPublishData: false,
    canPublishSources: [
      TrackSource.CAMERA,
      TrackSource.MICROPHONE,
      ...(isCoach ? [TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO] : []),
    ],
    canUpdateOwnMetadata: false,
  };
}
