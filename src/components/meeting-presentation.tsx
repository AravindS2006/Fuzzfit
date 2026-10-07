'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { MonitorUp, ScreenShareOff } from 'lucide-react';
import type { Room, Track } from 'livekit-client';

const shareSource = 'screen_share' as Track.Source;
const shareEvents = [
  'trackPublished',
  'trackSubscribed',
  'trackUnpublished',
  'trackUnsubscribed',
  'trackMuted',
  'trackUnmuted',
  'localTrackPublished',
  'localTrackUnpublished',
  'participantConnected',
  'participantDisconnected',
  'disconnected',
  'reconnected',
] as const;

type SharedScreen = { track: Track; name: string };
type ShareState = { localSharing: boolean; screen: SharedScreen | null };

function useScreenShare(room: Room | null) {
  const [state, setState] = useState<ShareState>({ localSharing: false, screen: null });

  useEffect(() => {
    if (!room) {
      setState({ localSharing: false, screen: null });
      return;
    }
    const update = () => {
      let screen: SharedScreen | null = null;
      let localSharing = false;
      if (room.state === 'connected') {
        for (const participant of [room.localParticipant, ...room.remoteParticipants.values()]) {
          const publication = participant.getTrackPublication(shareSource);
          const track = publication?.track;
          if (!publication?.isMuted && track?.mediaStreamTrack.readyState === 'live') {
            if (participant.isLocal) localSharing = true;
            screen ??= { track, name: participant.name || 'Coach' };
          }
        }
      }
      setState((previous) =>
        previous.localSharing === localSharing &&
        previous.screen?.track === screen?.track &&
        previous.screen?.name === screen?.name
          ? previous
          : { localSharing, screen },
      );
    };
    shareEvents.forEach((event) => room.on(event, update));
    update();
    return () => {
      shareEvents.forEach((event) => room.off(event, update));
    };
  }, [room]);

  return state;
}

export function ScreenShareButton({
  room,
  connected,
  onError,
}: {
  room: Room | null;
  connected: boolean;
  onError: (message: string) => void;
}) {
  const { localSharing } = useScreenShare(room);
  const [supported, setSupported] = useState(false);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(false);
  const pending = useRef(false);
  const helpId = useId();

  useEffect(() => {
    mounted.current = true;
    setSupported(typeof navigator.mediaDevices?.getDisplayMedia === 'function');
    return () => {
      mounted.current = false;
    };
  }, []);

  async function toggle() {
    if (!room || !connected || !supported || pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      await room.localParticipant.setScreenShareEnabled(
        !room.localParticipant.isScreenShareEnabled,
        {
          audio: true,
          selfBrowserSurface: 'exclude',
          contentHint: 'motion',
          resolution: { width: 1280, height: 720, frameRate: 24 },
        },
      );
    } catch (error) {
      if (!mounted.current) return;
      const name = error instanceof Error ? error.name : '';
      onError(
        name === 'NotAllowedError'
          ? 'Screen sharing was cancelled or blocked. Choose a screen, window or tab to present.'
          : name === 'NotSupportedError'
            ? 'Screen sharing is unavailable in this browser. Use a desktop browser to present.'
            : 'Could not share your screen. Try again from a supported desktop browser.',
      );
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <div className="share-screen-control">
      <button
        type="button"
        className="button outline full"
        onClick={toggle}
        disabled={!connected || !supported || busy}
        aria-pressed={localSharing}
        aria-describedby={helpId}
      >
        {localSharing ? <ScreenShareOff size={18} /> : <MonitorUp size={18} />}
        {busy ? 'Updating presentation…' : localSharing ? 'Stop presenting' : 'Present screen'}
      </button>
      <p id={helpId} className="microcopy">
        {!supported
          ? 'Screen presentation needs a supported desktop browser.'
          : !connected
            ? 'Join live video to present an exercise demonstration.'
            : 'Choose a window or tab. Trainees stay visible while you present.'}
      </p>
    </div>
  );
}

export function Presentation({
  room,
  onActive,
}: {
  room: Room | null;
  onActive: (active: boolean) => void;
}) {
  const { screen } = useScreenShare(room);
  const video = useRef<HTMLVideoElement>(null);
  const active = Boolean(screen);
  const track = screen?.track;

  useEffect(() => {
    onActive(active);
  }, [active, onActive]);

  useEffect(() => {
    const element = video.current;
    if (!track || !element) return;
    // Audio is attached separately by the meeting's remote audio renderer.
    element.muted = true;
    track.attach(element);
    return () => {
      track.detach(element);
      element.srcObject = null;
    };
  }, [track]);

  if (!screen) return null;
  return (
    <section className="meeting-presentation" aria-label="Coach presentation">
      <div className="presentation-header">
        <MonitorUp size={16} />
        <span>{screen.name} is presenting</span>
      </div>
      <video
        ref={video}
        className="presentation-video"
        autoPlay
        playsInline
        muted
        aria-label={`${screen.name}'s shared screen`}
      />
    </section>
  );
}
