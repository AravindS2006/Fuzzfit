'use client';
import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  ArrowLeft,
  ArrowUpRight,
  Video,
  VideoOff,
  Mic,
  MicOff,
  Hand,
  Pause,
  Play,
  Send,
  Users,
  Check,
  X,
  MessageSquare,
  ShieldCheck,
  LogOut,
  Volume2,
  CheckCircle2,
  Settings2,
  SwitchCamera,
  Maximize,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import type { Room, Participant, Track } from 'livekit-client';
import type { Analysis } from '@/lib/pose-engine';
import type { ClassView, MessageView, Person, WorkspaceData } from '@/lib/types';
import { apiCommand, fetchJson } from '@/lib/client';
import { exercises, exerciseName } from '@/lib/catalog';
import { isHoldExercise } from '@/lib/exercise-profiles';
import { Avatar, EmptyState, Modal } from './ui';
import { Presentation, ScreenShareButton } from './meeting-presentation';
import { VideoDevices, type DevicePreferences } from './video-devices';
const CameraAnalyzer = dynamic(() => import('./camera-analyzer').then((m) => m.CameraAnalyzer), {
  ssr: false,
});
type LiveState = {
  status: string;
  exercise: ClassView['exercise'];
  revision: number;
  paused: boolean;
  startedAt: string | null;
  participants: ClassView['participants'];
  messages: MessageView[];
};
type CoachVideoLayout = { size: 'small' | 'medium' | 'large'; minimized: boolean };
const coachVideoPreferenceKey = 'fuzzfit:coach-video-layout:v1';
export function Studio({
  initialClass,
  user,
  demo,
  services,
  onExit,
  onDemoControl,
}: {
  initialClass?: ClassView;
  user: Person;
  demo: boolean;
  services: WorkspaceData['services'];
  onExit: () => void;
  onDemoControl?: (c: Record<string, unknown>) => Promise<Record<string, unknown>>;
}) {
  const [item, setItem] = useState(initialClass),
    [hydrated, setHydrated] = useState(false),
    [messages, setMessages] = useState<MessageView[]>([]),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [connected, setConnected] = useState(false),
    [connecting, setConnecting] = useState(false),
    [consent, setConsent] = useState(false),
    [showConsent, setShowConsent] = useState(false),
    [remote, setRemote] = useState<Participant[]>([]),
    [stream, setStream] = useState<MediaStream | null>(null),
    [mic, setMic] = useState(false),
    [camera, setCamera] = useState(false),
    [focus, setFocus] = useState<string | null>(null),
    [draft, setDraft] = useState(''),
    [cue, setCue] = useState(''),
    [ending, setEnding] = useState(false),
    [seconds, setSeconds] = useState(0),
    [connectionState, setConnectionState] = useState('Not connected'),
    [analysisWarning, setAnalysisWarning] = useState('');
  const [devicesOpen, setDevicesOpen] = useState(false);
  const [coachToolsOpen, setCoachToolsOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [presenting, setPresenting] = useState(false);
  const [coachVideoLayout, setCoachVideoLayout] = useState<CoachVideoLayout>({
    size: 'small',
    minimized: false,
  });
  const coachVideoSizeRef = useRef<HTMLSelectElement>(null);
  const enlargeCoachVideoRef = useRef<HTMLButtonElement>(null);
  const meetingRef = useRef<HTMLDivElement>(null);
  const [preferences, setPreferences] = useState<DevicePreferences>({
    cameraId: '',
    microphoneId: '',
    cameraOn: true,
    microphoneOn: false,
  });
  const [deviceBusy, setDeviceBusy] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [showClassmates, setShowClassmates] = useState(false);
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const room = useRef<Room | null>(null),
    current = useRef(item),
    latestAnalysis = useRef<{ value: Analysis; at: number } | null>(null),
    lastShared = useRef(0),
    metricBusy = useRef(false),
    mounted = useRef(true),
    joinGeneration = useRef(0);
  const coach = user.id === item?.coachId;
  current.current = item;
  useEffect(() => {
    mounted.current = true;
    try {
      const saved = JSON.parse(localStorage.getItem(coachVideoPreferenceKey) || 'null');
      if (
        saved &&
        ['small', 'medium', 'large'].includes(saved.size) &&
        typeof saved.minimized === 'boolean'
      )
        setCoachVideoLayout({ size: saved.size, minimized: saved.minimized });
    } catch {
      // The meeting remains usable when device storage is unavailable.
    }
    setHydrated(true);
    return () => {
      mounted.current = false;
      joinGeneration.current++;
      void room.current?.disconnect();
      room.current = null;
    };
  }, []);
  useEffect(() => {
    if (demo || !item?.id) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    let failures = 0;
    async function poll() {
      try {
        const state = await fetchJson<LiveState>(`/api/classes/${initialClass!.id}`);
        if (!active) return;
        failures = 0;
        setItem((p) => (p ? { ...p, ...state } : p));
        setMessages(state.messages);
        if (state.status === 'completed' || state.status === 'cancelled') {
          void room.current?.disconnect();
          setConnected(false);
          setStream(null);
        }
        setAnalysisWarning('');
      } catch {
        if (active) {
          failures++;
          setAnalysisWarning('Session updates are delayed. Reconnecting…');
        }
      }
      if (active) timer = setTimeout(poll, Math.min(15000, 3000 * (failures + 1)));
    }
    void poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [demo, initialClass?.id]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (current.current?.startedAt)
        setSeconds(
          Math.max(0, Math.floor((Date.now() - +new Date(current.current.startedAt)) / 1000)),
        );
    }, 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    latestAnalysis.current = null;
    lastShared.current = 0;
  }, [item?.revision, item?.exercise]);
  useEffect(() => {
    if (demo || coach) return;
    const timer = setInterval(async () => {
      const snapshot = latestAnalysis.current,
        c = current.current;
      if (
        !snapshot ||
        !c ||
        c.status !== 'live' ||
        c.paused ||
        !connected ||
        !consent ||
        metricBusy.current ||
        Date.now() - lastShared.current < 2800
      )
        return;
      const a =
        Date.now() - snapshot.at < 2000
          ? snapshot.value
          : {
              ...snapshot.value,
              score: null,
              confidence: 0,
              phase: 'tracking unavailable',
              cue: 'Camera analysis is unavailable. Re-enable your camera.',
            };
      metricBusy.current = true;
      lastShared.current = Date.now();
      try {
        await fetchJson('/api/metrics', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            classId: c.id,
            exercise: c.exercise,
            revision: c.revision,
            reps: a.reps,
            holdSeconds: a.holdSeconds,
            score: a.score,
            confidence: a.confidence,
            phase: a.phase,
            cue: a.cue,
          }),
        });
        setAnalysisWarning('');
      } catch (err) {
        setAnalysisWarning(
          err instanceof Error ? `Summary sharing: ${err.message}` : 'Summary sharing is delayed.',
        );
      } finally {
        metricBusy.current = false;
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [demo, coach, connected, consent]);
  async function control(control: string, exercise?: string) {
    if (!item) return;
    setBusy(true);
    setError('');
    try {
      if (demo) {
        await onDemoControl?.({ action: 'classControl', id: item.id, control, exercise });
        setItem((c) =>
          c
            ? {
                ...c,
                status: control === 'start' ? 'live' : control === 'end' ? 'completed' : c.status,
                paused: control === 'pause' ? true : control === 'resume' ? false : c.paused,
                exercise: (exercise as ClassView['exercise']) || c.exercise,
                revision: control === 'exercise' ? c.revision + 1 : c.revision,
                startedAt: control === 'start' ? new Date().toISOString() : c.startedAt,
              }
            : c,
        );
      } else {
        await apiCommand({ action: 'classControl', id: item.id, control, exercise });
        const s = await fetchJson<LiveState>(`/api/classes/${item.id}`);
        setItem((c) => (c ? { ...c, ...s } : c));
      }
      if (control === 'end') {
        await room.current?.disconnect();
        setConnected(false);
        setStream(null);
        setEnding(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Please retry.');
    } finally {
      setBusy(false);
    }
  }
  async function connect() {
    if (!item || demo) return;
    setShowConsent(false);
    setConnecting(true);
    setError('');
    const run = ++joinGeneration.current;
    try {
      await apiCommand({ action: 'consent', id: item.id, consent: true });
      setConsent(true);
      const credentials = await fetchJson<{ token: string; url: string }>('/api/video/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classId: item.id }),
      });
      const { Room, RoomEvent, Track, VideoPresets } = await import('livekit-client');
      const instance = new Room({
        adaptiveStream: true,
        dynacast: true,
        videoCaptureDefaults: {
          resolution: { width: 640, height: 480, frameRate: 24 },
          deviceId: preferences.cameraId || undefined,
          facingMode: facing,
        },
        audioCaptureDefaults: {
          deviceId: preferences.microphoneId || undefined,
          echoCancellation: true,
          noiseSuppression: true,
        },
        publishDefaults: { videoSimulcastLayers: [VideoPresets.h180] },
      });
      if (!mounted.current || joinGeneration.current !== run) {
        await instance.disconnect();
        return;
      }
      room.current = instance;
      const update = () => {
        if (mounted.current && room.current === instance) {
          setRemote([...instance.remoteParticipants.values()]);
          const track = instance.localParticipant.getTrackPublication(Track.Source.Camera)?.track;
          const mediaTrack = instance.localParticipant.isCameraEnabled
            ? track?.mediaStreamTrack
            : undefined;
          setStream((previous) =>
            mediaTrack
              ? previous?.getVideoTracks()[0] === mediaTrack
                ? previous
                : new MediaStream([mediaTrack])
              : null,
          );
          setCamera(instance.localParticipant.isCameraEnabled);
          setMic(instance.localParticipant.isMicrophoneEnabled);
        }
      };
      instance
        .on(RoomEvent.ParticipantConnected, update)
        .on(RoomEvent.ParticipantDisconnected, update)
        .on(RoomEvent.TrackSubscribed, update)
        .on(RoomEvent.TrackUnsubscribed, update)
        .on(RoomEvent.LocalTrackPublished, update)
        .on(RoomEvent.LocalTrackUnpublished, update)
        .on(RoomEvent.TrackMuted, update)
        .on(RoomEvent.TrackUnmuted, update);
      instance.on(RoomEvent.ActiveSpeakersChanged, update);
      instance.on(RoomEvent.ConnectionQualityChanged, update);
      instance.on(RoomEvent.AudioPlaybackStatusChanged, () => {
        if (mounted.current && room.current === instance)
          setAudioBlocked(!instance.canPlaybackAudio);
      });
      instance.on(RoomEvent.ConnectionStateChanged, (s) => {
        if (mounted.current && room.current === instance) setConnectionState(s);
      });
      instance.on(RoomEvent.Disconnected, () => {
        if (mounted.current && room.current === instance) {
          setConnected(false);
          setStream(null);
          setCamera(false);
          setMic(false);
        }
      });
      await instance.connect(credentials.url, credentials.token);
      if (!mounted.current || joinGeneration.current !== run) {
        await instance.disconnect();
        return;
      }
      setConnected(true);
      try {
        await instance.startAudio();
      } catch {
        setAudioBlocked(true);
      }
      await instance.localParticipant.setCameraEnabled(preferences.cameraOn);
      await instance.localParticipant.setMicrophoneEnabled(preferences.microphoneOn);
      setCamera(preferences.cameraOn);
      setMic(preferences.microphoneOn);
      update();
    } catch (err) {
      if (mounted.current) {
        setError(
          err instanceof Error ? err.message : 'Could not join video. Check permissions and retry.',
        );
        if (room.current?.state !== 'connected') {
          await room.current?.disconnect();
          room.current = null;
        }
      }
    } finally {
      if (mounted.current) setConnecting(false);
    }
  }
  async function toggleCamera() {
    if (!room.current || deviceBusy) return;
    setDeviceBusy(true);
    try {
      await room.current?.localParticipant.setCameraEnabled(!camera);
      setCamera(!camera);
      const { Track } = await import('livekit-client');
      const track = room.current?.localParticipant.getTrackPublication(Track.Source.Camera)?.track;
      const mediaTrack = !camera ? track?.mediaStreamTrack : undefined;
      setStream((previous) =>
        mediaTrack
          ? previous?.getVideoTracks()[0] === mediaTrack
            ? previous
            : new MediaStream([mediaTrack])
          : null,
      );
    } catch {
      setError('Camera could not be enabled. Check your browser permissions.');
    } finally {
      setDeviceBusy(false);
    }
  }
  async function toggleMic() {
    if (!room.current || deviceBusy) return;
    setDeviceBusy(true);
    try {
      await room.current?.localParticipant.setMicrophoneEnabled(!mic);
      setMic(!mic);
    } catch {
      setError('Microphone could not be enabled. Check your browser permissions.');
    } finally {
      setDeviceBusy(false);
    }
  }
  async function changeDevices(next: DevicePreferences) {
    if (!room.current || deviceBusy) return;
    setDeviceBusy(true);
    setError('');
    const instance = room.current;
    try {
      if (
        next.cameraId !== preferences.cameraId &&
        !(await instance.switchActiveDevice('videoinput', next.cameraId || 'default'))
      )
        throw new Error('This camera could not be selected.');
      if (
        next.microphoneId !== preferences.microphoneId &&
        !(await instance.switchActiveDevice('audioinput', next.microphoneId || 'default'))
      )
        throw new Error('This microphone could not be selected.');
      setPreferences(next);
      const { Track } = await import('livekit-client');
      const track = instance.localParticipant.getTrackPublication(Track.Source.Camera)?.track
        ?.mediaStreamTrack;
      setStream((previous) =>
        camera && track
          ? previous?.getVideoTracks()[0] === track
            ? previous
            : new MediaStream([track])
          : null,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Device could not be switched.');
    } finally {
      setDeviceBusy(false);
    }
  }
  async function flipCamera() {
    const instance = room.current;
    if (!instance || !camera || deviceBusy) return;
    setDeviceBusy(true);
    setError('');
    try {
      const { Track } = await import('livekit-client');
      const track = instance.localParticipant.getTrackPublication(Track.Source.Camera)?.videoTrack;
      if (!track) throw new Error('Turn on your camera first.');
      const next = facing === 'user' ? 'environment' : 'user';
      await track.restartTrack({ facingMode: next, deviceId: undefined });
      const actual = track.mediaStreamTrack.getSettings().facingMode;
      if (actual && actual !== next) throw new Error('The requested camera is unavailable.');
      setFacing(next);
      setPreferences((p) => ({ ...p, cameraId: '' }));
      setStream(new MediaStream([track.mediaStreamTrack]));
    } catch {
      setError('The other camera is unavailable. Choose a camera in Devices.');
    } finally {
      setDeviceBusy(false);
    }
  }
  async function send(text: string, kind = 'chat', recipientId?: string) {
    if (!item || !text.trim()) return;
    setError('');
    try {
      if (demo)
        setMessages((s) => [
          ...s,
          {
            id: crypto.randomUUID(),
            senderId: user.id,
            senderName: user.name,
            recipientId: recipientId || null,
            text: text.trim(),
            kind,
            createdAt: new Date().toISOString(),
          },
        ]);
      else {
        await apiCommand({ action: 'message', id: item.id, text, kind, recipientId });
        const s = await fetchJson<LiveState>(`/api/classes/${item.id}`);
        setMessages(s.messages);
      }
      if (kind === 'chat') setDraft('');
      else setCue('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Message could not be sent.');
    }
  }
  async function help(requested: boolean, target?: string) {
    if (!item) return;
    try {
      if (demo)
        setItem((c) =>
          c
            ? {
                ...c,
                participants: c.participants.map((p) =>
                  p.id === target ? { ...p, helpRequested: requested } : p,
                ),
              }
            : c,
        );
      else await apiCommand({ action: 'help', id: item.id, requested, userId: target });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Please retry.');
    }
  }
  async function muteParticipants(participantId?: string) {
    if (!item || deviceBusy) return;
    setDeviceBusy(true);
    setError('');
    try {
      await apiCommand({ action: 'muteParticipants', id: item.id, participantId });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Microphones could not be muted.');
    } finally {
      setDeviceBusy(false);
    }
  }
  function onAnalysis(a: Analysis) {
    latestAnalysis.current = { value: a, at: Date.now() };
  }
  function updateCoachVideoLayout(next: CoachVideoLayout) {
    setCoachVideoLayout(next);
    try {
      localStorage.setItem(coachVideoPreferenceKey, JSON.stringify(next));
    } catch {
      // Sizing still works without saving a device preference.
    }
  }
  if (!item)
    return (
      <EmptyState
        title="Your studio is ready to begin."
        text="Schedule a session or open one from your calendar."
        action={
          <button className="button lime" onClick={onExit}>
            Back to sessions
          </button>
        }
      />
    );
  const ended = item.status === 'completed' || item.status === 'cancelled';
  const focused = item.participants.find((p) => p.id === focus);
  const me = item.participants.find((p) => p.id === user.id);
  const coachParticipant = remote.find((p) => p.identity === item.coachId);
  const lastCue = [...messages]
    .reverse()
    .find((m) => m.kind === 'cue' && (!m.recipientId || m.recipientId === user.id));
  const count = item.participants.length + 1;
  const columns = count <= 2 ? 2 : count <= 4 ? 2 : 3;
  return (
    <div
      ref={meetingRef}
      className={`live-studio meeting-room ${coach ? 'coach-meeting' : 'trainee-meeting'}`}
      inert={!hydrated}
      aria-busy={!hydrated}
    >
      <header className="meeting-header">
        <button
          className="icon-button"
          aria-label="Back to sessions"
          onClick={async () => {
            joinGeneration.current++;
            await room.current?.disconnect();
            onExit();
          }}
        >
          <ArrowLeft size={21} />
        </button>
        <div className="meeting-title">
          <span>{demo ? 'ILLUSTRATIVE STUDIO PREVIEW' : 'FUZZFIT LIVE'}</span>
          <h1>{item.title}</h1>
        </div>
        <div className="meeting-presence">
          <span className={`meeting-status ${item.status === 'live' ? 'is-live' : ''}`}>
            <i />
            {item.paused ? 'Paused' : item.status}
          </span>
          <span>
            <Users size={15} />
            {item.participants.length} trainees
          </span>
          <time>
            {String(Math.floor(seconds / 60)).padStart(2, '0')}:
            {String(seconds % 60).padStart(2, '0')}
          </time>
        </div>
        <div className="meeting-movement">
          {coach ? (
            <select
              aria-label="Current exercise"
              value={item.exercise}
              disabled={busy || item.status !== 'live'}
              onChange={(e) => void control('exercise', e.target.value)}
            >
              {exercises.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          ) : (
            <strong>{exerciseName(item.exercise)}</strong>
          )}
        </div>
      </header>
      {error && (
        <p className="inline-error meeting-notice" role="alert">
          {error}
          <button aria-label="Dismiss error" onClick={() => setError('')}>
            <X size={16} />
          </button>
        </p>
      )}
      {analysisWarning && (
        <p className="inline-notice meeting-notice" role="status">
          {analysisWarning}
        </p>
      )}
      {audioBlocked && connected && (
        <p className="inline-notice meeting-notice" role="status">
          Class audio is paused by your browser.
          <button
            onClick={async () => {
              try {
                await room.current?.startAudio();
                setAudioBlocked(false);
              } catch {
                setAudioBlocked(true);
              }
            }}
          >
            Enable room audio
          </button>
        </p>
      )}
      {connected && connectionState !== 'connected' && (
        <p className="inline-notice meeting-notice" role="status">
          Reconnecting… wait for video and tracking to recover.
        </p>
      )}
      {ended ? (
        <div className="session-finished meeting-finished">
          <CheckCircle2 size={42} />
          <h2>{item.status === 'completed' ? 'Session complete' : 'Session cancelled'}</h2>
          <p>Tracked summaries are saved in Insights.</p>
          {coach && item.status === 'completed' && !demo && (
            <button className="button outline" disabled={busy} onClick={() => void control('end')}>
              Retry video room cleanup
            </button>
          )}
          <button className="button lime" onClick={onExit}>
            Back to my studio <ArrowUpRight size={17} />
          </button>
        </div>
      ) : (
        <>
          <div className={`meeting-stage ${presenting ? 'with-presentation' : ''}`}>
            <Presentation room={connected ? room.current : null} onActive={setPresenting} />
            {coach ? (
              <div
                className="participant-grid meeting-gallery"
                style={
                  {
                    '--gallery-columns': columns,
                    '--gallery-rows': Math.ceil(count / columns),
                    '--mobile-rows': Math.ceil(count / 2),
                  } as React.CSSProperties
                }
                role="group"
                aria-label="Class video gallery"
              >
                {item.participants.map((p, i) => {
                  const person = remote.find((r) => r.identity === p.id);
                  const fresh =
                    p.metric &&
                    p.metric.revision === item.revision &&
                    p.metric.exercise === item.exercise &&
                    !item.paused &&
                    Date.now() - +new Date(p.metric.updatedAt) < 12000;
                  return (
                    <button
                      key={p.id}
                      className={`participant-tile meeting-tile ${p.helpRequested ? 'needs-attention' : ''} ${person?.isSpeaking ? 'is-speaking' : ''} ${focus === p.id ? 'selected-trainee' : ''}`}
                      aria-label={`Focus ${p.name}${p.helpRequested ? ', help requested' : ''}`}
                      aria-pressed={focus === p.id}
                      onClick={() => setFocus(focus === p.id ? null : p.id)}
                    >
                      <div className="participant-feed">
                        {person ? (
                          <ParticipantVideo participant={person} />
                        ) : (
                          <div className="meeting-empty-video">
                            <Avatar name={p.name} index={i} />
                            <span>{demo ? 'Preview · camera off' : 'Waiting to join'}</span>
                          </div>
                        )}
                        <div className="meeting-tile-top">
                          {p.helpRequested && (
                            <span className="help-badge">
                              <Hand size={14} />
                              Help requested
                            </span>
                          )}
                          {person?.isSpeaking && <span className="speaking-badge">Speaking</span>}
                          {focus === p.id && <span className="selected-badge">Selected</span>}
                        </div>
                        <div className="meeting-tile-name">
                          <strong>{p.name}</strong>
                          {person?.isMicrophoneEnabled ? <Mic size={15} /> : <MicOff size={15} />}
                        </div>
                      </div>
                      <div className="participant-stats">
                        <span>
                          <strong>
                            {fresh
                              ? isHoldExercise(item.exercise)
                                ? `${p.metric!.holdSeconds}s`
                                : p.metric!.reps
                              : '—'}
                          </strong>{' '}
                          {isHoldExercise(item.exercise) ? 'hold' : 'reps'}
                        </span>
                        <span>
                          <strong>
                            {fresh && p.metric?.score != null ? Math.round(p.metric.score) : '—'}
                          </strong>{' '}
                          form /100
                        </span>
                        <span className="participant-state">
                          {fresh
                            ? p.metric!.phase
                            : item.paused
                              ? 'Paused'
                              : demo
                                ? 'Sample participant'
                                : 'No tracking'}
                        </span>
                      </div>
                      {fresh && p.metric?.cue && (
                        <span className="meeting-tile-cue">{p.metric.cue}</span>
                      )}
                    </button>
                  );
                })}
                <div
                  className={`meeting-tile coach-self-tile ${room.current?.localParticipant.isSpeaking ? 'is-speaking' : ''}`}
                >
                  <div className="participant-feed">
                    {connected && camera && room.current ? (
                      <ParticipantVideo participant={room.current.localParticipant} />
                    ) : (
                      <div className="meeting-empty-video">
                        <Avatar name={user.name} />
                        <span>
                          {demo
                            ? 'Preview · no live devices'
                            : connected
                              ? 'Camera off'
                              : 'Join video to coach your class'}
                        </span>
                      </div>
                    )}
                    <div className="meeting-tile-name">
                      <strong>
                        {user.name} <small>(You · Coach)</small>
                      </strong>
                      {mic ? <Mic size={15} /> : <MicOff size={15} />}
                    </div>
                  </div>
                  <div className="participant-stats coach-tile-caption">
                    <Video size={15} />
                    <span>Your demonstration is shared with everyone</span>
                  </div>
                </div>
              </div>
            ) : (
              <div
                className={`trainee-video-layout coach-video-${coachVideoLayout.size}${coachVideoLayout.minimized ? ' coach-video-minimized' : ''}`}
              >
                <div className="trainee-self-stage">
                  <CameraAnalyzer
                    exercise={item.exercise}
                    paused={item.paused || item.status !== 'live'}
                    revision={item.revision}
                    stream={stream}
                    block={item.workout?.find((b) => b.exercise === item.exercise)}
                    sessionCamera={!demo && services.video}
                    onEnableCamera={
                      item.status === 'live'
                        ? connected
                          ? () => void toggleCamera()
                          : () => setShowConsent(true)
                        : undefined
                    }
                    onAnalysis={connected ? onAnalysis : undefined}
                    initialReps={me?.metric?.revision === item.revision ? me.metric.reps : 0}
                    initialHoldSeconds={
                      me?.metric?.revision === item.revision ? me.metric.holdSeconds : 0
                    }
                  />
                </div>
                <div className="coach-stage meeting-tile" role="group" aria-label="Coach video">
                  <div className="coach-video-toolbar">
                    <strong title={item.coachName}>
                      {item.coachName} <small>Coach</small>
                    </strong>
                    <select
                      ref={coachVideoSizeRef}
                      aria-label="Coach video size"
                      value={coachVideoLayout.size}
                      hidden={coachVideoLayout.minimized || coachVideoLayout.size === 'small'}
                      onChange={(event) => {
                        const size = event.target.value as CoachVideoLayout['size'];
                        updateCoachVideoLayout({
                          ...coachVideoLayout,
                          size,
                        });
                        if (size === 'small')
                          requestAnimationFrame(() => enlargeCoachVideoRef.current?.focus());
                      }}
                    >
                      <option value="small">Small</option>
                      <option value="medium">Medium</option>
                      <option value="large">Large</option>
                    </select>
                    <button
                      ref={enlargeCoachVideoRef}
                      className="coach-video-toggle coach-video-enlarge"
                      aria-label="Enlarge coach video"
                      title="Enlarge coach video"
                      hidden={coachVideoLayout.minimized || coachVideoLayout.size !== 'small'}
                      onClick={() => {
                        updateCoachVideoLayout({ ...coachVideoLayout, size: 'medium' });
                        requestAnimationFrame(() => coachVideoSizeRef.current?.focus());
                      }}
                    >
                      <Maximize2 size={17} />
                    </button>
                    <button
                      className="coach-video-toggle"
                      aria-label={
                        coachVideoLayout.minimized ? 'Restore coach video' : 'Minimize coach video'
                      }
                      title={
                        coachVideoLayout.minimized ? 'Restore coach video' : 'Minimize coach video'
                      }
                      aria-expanded={!coachVideoLayout.minimized}
                      aria-controls="coach-video-feed"
                      onClick={() =>
                        updateCoachVideoLayout({
                          ...coachVideoLayout,
                          minimized: !coachVideoLayout.minimized,
                        })
                      }
                    >
                      {coachVideoLayout.minimized ? (
                        <Maximize2 size={17} />
                      ) : (
                        <Minimize2 size={17} />
                      )}
                    </button>
                  </div>
                  <div
                    id="coach-video-feed"
                    className="coach-primary-feed"
                    hidden={coachVideoLayout.minimized}
                  >
                    {coachParticipant ? (
                      <ParticipantVideo participant={coachParticipant} />
                    ) : (
                      <div className="meeting-empty-video">
                        <Avatar name={item.coachName} />
                        <span>
                          {connected ? 'Waiting for your coach' : 'Join to see and hear your coach'}
                        </span>
                      </div>
                    )}
                    <div className="meeting-tile-name">
                      <span>
                        {coachVideoLayout.size === 'small'
                          ? item.coachName
                          : coachParticipant?.isSpeaking
                            ? 'Speaking'
                            : 'Coach audio'}
                      </span>
                      {coachParticipant?.isMicrophoneEnabled ? (
                        <Mic size={15} />
                      ) : (
                        <MicOff size={15} />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
          {!coach && lastCue && (
            <div className="human-cue meeting-human-cue" role="status">
              <strong>{item.coachName}</strong>
              <p>{lastCue.text}</p>
            </div>
          )}
          <footer className="meeting-dock" aria-label="Meeting controls">
            <div className="meeting-call-buttons">
              <button
                className={`meeting-control ${!mic ? 'device-off' : ''}`}
                aria-label={mic ? 'Mute microphone' : 'Enable microphone'}
                aria-pressed={mic}
                disabled={!connected || deviceBusy}
                onClick={() => void toggleMic()}
              >
                {mic ? <Mic size={21} /> : <MicOff size={21} />}
                <span>Mic</span>
              </button>
              <button
                className={`meeting-control ${!camera ? 'device-off' : ''}`}
                aria-label={camera ? 'Disable video camera' : 'Enable video camera'}
                aria-pressed={camera}
                disabled={!connected || deviceBusy}
                onClick={() => void toggleCamera()}
              >
                {camera ? <Video size={21} /> : <VideoOff size={21} />}
                <span>Camera</span>
              </button>
              <button
                className="meeting-control"
                aria-label="More options"
                onClick={() => setDevicesOpen(true)}
              >
                <Settings2 size={21} />
                <span>Options</span>
              </button>
              <button
                className="meeting-control"
                aria-label="Chat"
                onClick={() => setChatOpen(true)}
              >
                <MessageSquare size={21} />
                <span>Chat{messages.length ? ` (${messages.length})` : ''}</span>
              </button>
              {coach ? (
                <button
                  className={`meeting-control ${item.participants.some((p) => p.helpRequested) ? 'has-help' : ''}`}
                  aria-label="Coach tools"
                  onClick={() => setCoachToolsOpen(true)}
                >
                  <Users size={21} />
                  <span>Coach tools</span>
                </button>
              ) : (
                <button
                  className={`meeting-control ${me?.helpRequested ? 'has-help' : ''}`}
                  aria-label={me?.helpRequested ? 'Cancel help request' : 'Ask my coach for help'}
                  aria-pressed={!!me?.helpRequested}
                  disabled={item.status !== 'live'}
                  onClick={() => void help(!me?.helpRequested)}
                >
                  <Hand size={21} />
                  <span>{me?.helpRequested ? 'Hand raised' : 'Raise hand'}</span>
                </button>
              )}
            </div>
            <div className="meeting-session-buttons">
              {coach && item.status === 'scheduled' && (
                <button
                  className="button lime"
                  disabled={busy}
                  onClick={() => void control('start')}
                >
                  <Play size={16} />
                  Start class
                </button>
              )}
              {coach && item.status === 'live' && (
                <button
                  className="button outline"
                  disabled={busy}
                  onClick={() => void control(item.paused ? 'resume' : 'pause')}
                >
                  {item.paused ? <Play size={17} /> : <Pause size={17} />}
                  <span>{item.paused ? 'Resume' : 'Pause class'}</span>
                </button>
              )}
              {!demo && !connected && item.status === 'live' && (
                <button
                  className="button lime meeting-join"
                  aria-label={connecting ? 'Connecting live video' : 'Join live video'}
                  disabled={connecting || !services.video}
                  onClick={() => setShowConsent(true)}
                >
                  <Video size={17} />
                  <span className="meeting-full-label">
                    {connecting ? 'Connecting…' : 'Join live video'}
                  </span>
                  <span className="meeting-mobile-label" aria-hidden="true">
                    {connecting ? '…' : 'Join'}
                  </span>
                </button>
              )}
              {connected && (
                <button
                  className="button meeting-leave"
                  aria-label="Leave video"
                  onClick={async () => {
                    joinGeneration.current++;
                    await room.current?.disconnect();
                    setConnected(false);
                    setStream(null);
                  }}
                >
                  <LogOut size={17} />
                  <span>Leave video</span>
                </button>
              )}
              {coach && item.status === 'live' && (
                <button className="button danger" onClick={() => setEnding(true)}>
                  End session
                </button>
              )}
            </div>
          </footer>
          {remote.map((p) => (
            <ParticipantAudio key={p.identity} participant={p} />
          ))}
        </>
      )}
      {coachToolsOpen && coach && (
        <Modal title="Coach tools" onClose={() => setCoachToolsOpen(false)}>
          <div className="form-stack">
            <label>
              Send guidance to
              <select
                aria-label="Cue recipient"
                value={focus || ''}
                onChange={(e) => setFocus(e.target.value || null)}
              >
                <option value="">Everyone in class</option>
                {item.participants.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.helpRequested ? ' · Help requested' : ''}
                  </option>
                ))}
              </select>
            </label>
            {focused?.metric && (
              <div className="coach-observation">
                <strong>{focused.name}</strong>
                <p>{focused.metric.cue}</p>
                <small>
                  {new Date(focused.metric.updatedAt).toLocaleTimeString()} · last reported feedback
                </small>
              </div>
            )}
            <form
              className="form-stack"
              onSubmit={(e) => {
                e.preventDefault();
                void send(cue, 'cue', focus || undefined);
              }}
            >
              <label htmlFor="coaching-cue">Coaching cue</label>
              <textarea
                id="coaching-cue"
                value={cue}
                onChange={(e) => setCue(e.target.value)}
                placeholder="Give one clear correction…"
                maxLength={600}
                rows={3}
              />
              <button className="button lime full" disabled={!cue.trim() || item.status !== 'live'}>
                <Send size={17} />
                Send {focus ? 'personal' : 'class'} cue
              </button>
            </form>
            {focused?.helpRequested && (
              <button className="button outline full" onClick={() => void help(false, focused.id)}>
                <Check size={17} />
                Mark help request addressed
              </button>
            )}
            {focused && connected && (
              <button
                className="button outline full"
                disabled={deviceBusy}
                onClick={() => void muteParticipants(focused.id)}
              >
                <MicOff size={17} />
                Mute {focused.name.split(' ')[0]}’s microphone
              </button>
            )}
            <button
              className="button outline full"
              disabled={!connected || deviceBusy}
              onClick={() => void muteParticipants()}
            >
              <MicOff size={17} />
              Mute trainee microphones
            </button>
            <p className="microcopy">
              Speak through your microphone to coach the whole class. Select a trainee to send a
              private text cue. Microphones can be muted; each trainee decides when to unmute.
            </p>
          </div>
        </Modal>
      )}
      {chatOpen && (
        <Modal title="Session conversation" onClose={() => setChatOpen(false)}>
          <section className="chat-panel meeting-chat">
            <div className="chat-messages" aria-live="polite">
              {!messages.length ? (
                <p className="microcopy">Send a message to the class.</p>
              ) : (
                messages.map((m) => (
                  <div
                    className={`message ${m.senderId === user.id ? 'mine' : ''} ${m.kind === 'cue' ? 'cue-message' : ''}`}
                    key={m.id}
                  >
                    <span>
                      {m.senderName}
                      {m.recipientId ? ' · Private' : ''}
                      {m.kind === 'cue' ? ' · Coach cue' : ''}
                    </span>
                    <p>{m.text}</p>
                    <time>
                      {new Date(m.createdAt).toLocaleTimeString(undefined, {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </time>
                  </div>
                ))
              )}
            </div>
            <form
              className="chat-input"
              onSubmit={(e) => {
                e.preventDefault();
                void send(draft);
              }}
            >
              <input
                aria-label="Session message"
                placeholder="Message your class…"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={600}
              />
              <button
                aria-label="Send session message"
                className="icon-button"
                disabled={!draft.trim() || item.status !== 'live'}
              >
                <Send size={18} />
              </button>
            </form>
          </section>
        </Modal>
      )}
      {devicesOpen && (
        <Modal title="Meeting options" onClose={() => setDevicesOpen(false)}>
          <div className="form-stack">
            {connected && (
              <fieldset disabled={deviceBusy}>
                <VideoDevices
                  preferences={preferences}
                  onChange={(next) => void changeDevices(next)}
                />
              </fieldset>
            )}
            <button
              className="button outline full"
              disabled={!connected || !camera || deviceBusy}
              onClick={() => void flipCamera()}
            >
              <SwitchCamera size={17} />
              Flip camera
            </button>
            <button
              className="button outline full"
              disabled={!connected}
              onClick={async () => {
                try {
                  await room.current?.startAudio();
                  setAudioBlocked(false);
                } catch {
                  setAudioBlocked(true);
                }
              }}
            >
              <Volume2 size={17} />
              Enable room audio
            </button>
            {coach && (
              <ScreenShareButton
                room={connected ? room.current : null}
                connected={connected}
                onError={setError}
              />
            )}
            <button
              className="button outline full"
              onClick={async () => {
                try {
                  if (!document.fullscreenElement) await meetingRef.current?.requestFullscreen();
                  else await document.exitFullscreen();
                } catch {
                  setError('Fullscreen is unavailable in this browser.');
                }
              }}
            >
              <Maximize size={17} />
              Fullscreen
            </button>
            {!coach && (
              <button
                className="button outline full"
                onClick={() => {
                  setDevicesOpen(false);
                  setShowClassmates(true);
                }}
              >
                <Users size={17} />
                Show classmates
              </button>
            )}
            <p className="microcopy">
              {demo
                ? 'Sample mode has no live participants. Try Camera practice to analyze your own movement.'
                : !services.video
                  ? 'Live video is unavailable. Your coach can enable it in studio configuration.'
                  : `Video connection: ${connectionState}. Camera analysis stays on your device. No class recording.`}
            </p>
          </div>
        </Modal>
      )}
      {showClassmates && !coach && (
        <Modal title="Classmates" onClose={() => setShowClassmates(false)}>
          <div className="classmate-gallery">
            {remote
              .filter((p) => p.identity !== item.coachId)
              .map((p) => (
                <div key={p.identity} className="classmate-feed">
                  <ParticipantVideo participant={p} />
                  <span>
                    {p.name || 'Classmate'} · {p.isMicrophoneEnabled ? 'Mic on' : 'Muted'}
                  </span>
                </div>
              ))}
            {!remote.some((p) => p.identity !== item.coachId) && (
              <p>No classmates have joined video yet.</p>
            )}
          </div>
        </Modal>
      )}
      {showConsent && (
        <Modal title="A shared space to move together." onClose={() => setShowConsent(false)}>
          <div className="form-stack">
            <VideoDevices preview preferences={preferences} onChange={setPreferences} />
            <p>
              Your enabled camera and microphone are shared with this class. Movement summaries are
              visible to you and your coach.
            </p>
            <div className="privacy-note">
              <ShieldCheck size={20} />
              <p>
                Camera analysis runs locally. Fuzzfit does not record the class. You can stop your
                devices or leave at any time.
              </p>
            </div>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              I agree to group video sharing and movement summary sharing.
            </label>
            <button
              className="button lime full"
              disabled={!consent || connecting}
              onClick={() => void connect()}
            >
              <Video size={17} />
              Join live video
            </button>
          </div>
        </Modal>
      )}
      {ending && (
        <Modal title="Wrap up this session?" onClose={() => setEnding(false)}>
          <p>
            End the class for everyone and close the video room. Tracked summaries stay in your
            studio history.
          </p>
          <div className="form-actions">
            <button className="button outline" onClick={() => setEnding(false)}>
              Keep training
            </button>
            <button className="button danger" disabled={busy} onClick={() => void control('end')}>
              {busy ? 'Ending…' : 'End session for everyone'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function ParticipantVideo({ participant }: { participant: Participant }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const tracks = Array.from(participant.videoTrackPublications.values());
    const track = tracks.find((p) => p.source === 'camera' && !p.isMuted)?.track;
    if (track && ref.current) {
      track.attach(ref.current);
      setReady(true);
    } else setReady(false);
    const element = ref.current;
    return () => {
      if (track && element) track.detach(element);
    };
  }, [
    participant,
    participant.videoTrackPublications.size,
    Array.from(participant.videoTrackPublications.values())
      .map((p) => `${p.trackSid}:${p.isMuted}:${p.track?.sid || 'none'}`)
      .join(','),
  ]);
  return (
    <>
      <video className="participant-video" ref={ref} autoPlay playsInline muted />
      {!ready && (
        <div className="video-disabled">
          <VideoOff size={23} />
          <span>Camera off</span>
        </div>
      )}
    </>
  );
}
function ParticipantAudio({ participant }: { participant: Participant }) {
  const tracks = Array.from(participant.audioTrackPublications.values()).flatMap((p) =>
    p.track ? [p.track] : [],
  );
  return (
    <>
      {tracks.map((track) => (
        <MeetingAudioTrack key={track.sid || track.mediaStreamTrack.id} track={track} />
      ))}
    </>
  );
}
function MeetingAudioTrack({ track }: { track: Track }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    track.attach(element);
    return () => {
      track.detach(element);
      element.srcObject = null;
    };
  }, [track]);
  return <audio ref={ref} autoPlay />;
}
