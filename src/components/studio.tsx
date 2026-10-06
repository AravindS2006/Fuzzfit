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
  Signal,
  Check,
  X,
  ScanLine,
  AlertCircle,
  ShieldCheck,
  LogOut,
  Volume2,
  Clock3,
  CheckCircle2,
} from 'lucide-react';
import type { Room, Participant, RemoteTrack, RemoteTrackPublication } from 'livekit-client';
import type { Analysis } from '@/lib/pose-engine';
import type { ClassView, MessageView, Person, WorkspaceData } from '@/lib/types';
import { apiCommand, fetchJson } from '@/lib/client';
import { exercises, exerciseName } from '@/lib/catalog';
import { Avatar, EmptyState, ExerciseArt, Modal, SectionTitle } from './ui';
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
                revision: c.revision + 1,
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
        videoCaptureDefaults: { resolution: { width: 640, height: 480, frameRate: 24 } },
        publishDefaults: { videoSimulcastLayers: [VideoPresets.h180] },
      });
      if (!mounted.current || joinGeneration.current !== run) {
        await instance.disconnect();
        return;
      }
      room.current = instance;
      const update = () => {
        if (mounted.current) {
          setRemote([...instance.remoteParticipants.values()]);
          const track = instance.localParticipant.getTrackPublication(Track.Source.Camera)?.track;
          setStream(track?.mediaStreamTrack ? new MediaStream([track.mediaStreamTrack]) : null);
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
      instance.on(RoomEvent.ConnectionStateChanged, (s) => {
        if (mounted.current) setConnectionState(s);
      });
      instance.on(RoomEvent.Disconnected, () => {
        if (mounted.current) {
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
      } catch {}
      await instance.localParticipant.setCameraEnabled(true);
      setCamera(true);
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
    try {
      await room.current?.localParticipant.setCameraEnabled(!camera);
      setCamera(!camera);
      const { Track } = await import('livekit-client');
      const track = room.current?.localParticipant.getTrackPublication(Track.Source.Camera)?.track;
      setStream(
        !camera && track?.mediaStreamTrack ? new MediaStream([track.mediaStreamTrack]) : null,
      );
    } catch {
      setError('Camera could not be enabled. Check your browser permissions.');
    }
  }
  async function toggleMic() {
    try {
      await room.current?.localParticipant.setMicrophoneEnabled(!mic);
      setMic(!mic);
    } catch {
      setError('Microphone could not be enabled. Check your browser permissions.');
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
  function onAnalysis(a: Analysis) {
    latestAnalysis.current = { value: a, at: Date.now() };
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
  const lastCue = [...messages]
    .reverse()
    .find((m) => m.kind === 'cue' && (!m.recipientId || m.recipientId === user.id));
  return (
    <div className="live-studio" inert={!hydrated} aria-busy={!hydrated}>
      <div className="studio-heading">
        <div>
          <span className="eyebrow">
            {demo ? 'ILLUSTRATIVE STUDIO PREVIEW' : 'YOUR LIVE COACHING SPACE'}
          </span>
          <h1>{item.title}</h1>
          <div className="studio-meta">
            <span className={`pill ${item.status === 'live' ? 'live-pill' : ''}`}>
              <span className="status-dot" />
              {demo ? 'Sample class' : item.status}
            </span>
            <span>
              <Users size={15} />
              {item.participants.length} enrolled
            </span>
            <span>
              <Clock3 size={15} />
              {String(Math.floor(seconds / 60)).padStart(2, '0')}:
              {String(seconds % 60).padStart(2, '0')}
            </span>
            <span>
              <Signal size={15} />
              {demo ? 'Preview only' : connectionState}
            </span>
          </div>
        </div>
        <button
          className="button outline"
          onClick={async () => {
            joinGeneration.current++;
            await room.current?.disconnect();
            onExit();
          }}
        >
          <ArrowLeft size={16} /> Back to sessions
        </button>
      </div>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {analysisWarning && (
        <p className="inline-notice" role="status">
          {analysisWarning}
        </p>
      )}
      {ended ? (
        <div className="panel session-finished">
          <CheckCircle2 size={36} />
          <h2>
            {item.status === 'completed'
              ? 'That’s another step forward.'
              : 'This session was cancelled.'}
          </h2>
          <p>
            {item.status === 'completed'
              ? 'Your tracked summaries are saved in Insights. Take a moment to recover.'
              : 'Your coach can schedule another session.'}
          </p>
          {coach && item.status === 'completed' && !demo && (
            <button className="button outline" disabled={busy} onClick={() => void control('end')}>
              Retry video room cleanup
            </button>
          )}
          <button className="button lime" onClick={onExit}>
            Back to my studio
            <ArrowUpRight size={17} />
          </button>
        </div>
      ) : (
        <>
          <div className="studio-toolbar panel">
            <div>
              <span className="eyebrow">CURRENT MOVEMENT</span>
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
            <span className="subtle">
              {item.paused ? 'Recovery break · tracking paused' : 'Move at a comfortable pace'}
            </span>
            <div className="toolbar-actions">
              {coach && item.status === 'scheduled' && (
                <button
                  className="button lime"
                  disabled={busy}
                  onClick={() => void control('start')}
                >
                  <Play size={16} /> Start class
                </button>
              )}
              {coach && item.status === 'live' && (
                <>
                  <button
                    className="button outline"
                    disabled={busy}
                    onClick={() => void control(item.paused ? 'resume' : 'pause')}
                  >
                    {item.paused ? <Play size={16} /> : <Pause size={16} />}{' '}
                    {item.paused ? 'Resume' : 'Pause class'}
                  </button>
                  <button className="button danger" onClick={() => setEnding(true)}>
                    End session
                  </button>
                </>
              )}
              {!demo && !connected && item.status === 'live' && (
                <button
                  className="button dark"
                  disabled={connecting || !services.video}
                  onClick={() => setShowConsent(true)}
                >
                  <Video size={17} />
                  {connecting ? 'Connecting…' : 'Join live video'}
                </button>
              )}
            </div>
          </div>
          {!services.video && !demo && (
            <p className="inline-notice">
              Live video is unavailable for this studio. You can continue with local camera
              practice.
            </p>
          )}
          <div className={`studio-grid ${coach ? 'coach-grid' : 'trainee-grid'}`}>
            <div className="studio-main">
              {coach ? (
                <>
                  <div className={`participant-grid ${focus ? 'has-focus' : ''}`}>
                    {(focus
                      ? item.participants.filter((p) => p.id === focus)
                      : item.participants
                    ).map((p, i) => {
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
                          className={`participant-tile ${p.helpRequested ? 'needs-attention' : ''}`}
                          onClick={() => setFocus(focus === p.id ? null : p.id)}
                        >
                          <div className="participant-feed">
                            {person ? (
                              <ParticipantVideo participant={person} />
                            ) : (
                              <div
                                className={`feed-placeholder ${['lavender', 'peach', 'sky', 'lime'][i % 4]}`}
                              >
                                <ExerciseArt exercise={item.exercise} />
                                <span>{demo ? 'Illustrative feed' : 'Waiting for video'}</span>
                              </div>
                            )}
                            <div className="feed-tags">
                              <span className="pill">
                                {p.helpRequested
                                  ? 'Help requested'
                                  : person
                                    ? 'Connected'
                                    : demo
                                      ? 'Sample participant'
                                      : 'Offline'}
                              </span>
                              <span className="focus-icon">
                                <ArrowUpRight size={17} />
                              </span>
                            </div>
                            <div className="feed-person">
                              <Avatar name={p.name} index={i} small />
                              <strong>{p.name}</strong>
                            </div>
                          </div>
                          <div className="participant-stats">
                            <div>
                              <span>FORM ESTIMATE</span>
                              <strong>
                                {fresh && p.metric?.score !== null
                                  ? Math.round(p.metric!.score!)
                                  : '—'}
                                <small>{fresh && p.metric?.score !== null ? '/100' : ''}</small>
                              </strong>
                            </div>
                            <div>
                              <span>REPS</span>
                              <strong>{fresh ? p.metric!.reps : '—'}</strong>
                            </div>
                            <span className="participant-state">
                              {fresh ? p.metric!.phase : demo ? 'Sample feed' : 'Awaiting tracking'}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  {!item.participants.length && (
                    <div className="panel">
                      <EmptyState
                        title="A little quiet before the work."
                        text="This session has no trainees enrolled. Use it as a coach rehearsal."
                      />
                    </div>
                  )}
                  {focus && (
                    <button className="text-link" onClick={() => setFocus(null)}>
                      <Users size={16} /> Show all participants
                    </button>
                  )}
                  <div className="coach-video panel">
                    <div>
                      <Video size={19} />
                      <span>Your coach camera</span>
                    </div>
                    {connected && camera && room.current ? (
                      <div className="self-video">
                        <ParticipantVideo participant={room.current.localParticipant} />
                      </div>
                    ) : (
                      <p>
                        {demo
                          ? 'Sample mode has no live video. Open camera practice to analyze a real movement.'
                          : 'Join live video to share your camera with the class.'}
                      </p>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <CameraAnalyzer
                    exercise={item.exercise}
                    paused={item.paused || item.status !== 'live'}
                    revision={item.revision}
                    stream={stream}
                    onAnalysis={connected ? onAnalysis : undefined}
                    initialReps={
                      item.participants.find((p) => p.id === user.id)?.metric?.revision ===
                      item.revision
                        ? item.participants.find((p) => p.id === user.id)?.metric?.reps || 0
                        : 0
                    }
                    initialHoldSeconds={
                      item.participants.find((p) => p.id === user.id)?.metric?.revision ===
                      item.revision
                        ? item.participants.find((p) => p.id === user.id)?.metric?.holdSeconds || 0
                        : 0
                    }
                  />
                  {lastCue && (
                    <div className="human-cue">
                      <Avatar name={item.coachName} small />
                      <div>
                        <span>YOUR COACH · {item.coachName}</span>
                        <p>{lastCue.text}</p>
                      </div>
                    </div>
                  )}
                  {remote
                    .filter((p) => p.identity === item.coachId)
                    .map((p) => (
                      <div className="coach-feed panel" key={p.identity}>
                        <SectionTitle title="Your coach" />
                        <ParticipantVideo participant={p} />
                      </div>
                    ))}
                </>
              )}
              <div className="call-controls panel">
                <div>
                  <button
                    className="icon-button"
                    aria-label={mic ? 'Mute microphone' : 'Enable microphone'}
                    disabled={!connected}
                    onClick={() => void toggleMic()}
                  >
                    {mic ? <Mic size={20} /> : <MicOff size={20} />}
                  </button>
                  <button
                    className="icon-button"
                    aria-label={camera ? 'Disable video camera' : 'Enable video camera'}
                    disabled={!connected}
                    onClick={() => void toggleCamera()}
                  >
                    {camera ? <Video size={20} /> : <VideoOff size={20} />}
                  </button>
                  <button
                    className="icon-button"
                    aria-label="Enable room audio"
                    disabled={!connected}
                    onClick={() => void room.current?.startAudio()}
                  >
                    <Volume2 size={20} />
                  </button>
                  <span>
                    {demo
                      ? 'Preview mode'
                      : connected
                        ? 'In the live class'
                        : 'Your devices are off'}
                  </span>
                </div>
                {!coach && item.status === 'live' && (
                  <button className="button outline" onClick={() => void help(true)}>
                    <Hand size={17} /> Ask my coach for help
                  </button>
                )}
                {connected && (
                  <button
                    className="button outline"
                    onClick={async () => {
                      joinGeneration.current++;
                      await room.current?.disconnect();
                      setConnected(false);
                      setStream(null);
                    }}
                  >
                    <LogOut size={17} /> Leave video
                  </button>
                )}
              </div>
            </div>
            <aside className="studio-side">
              <section className="panel coaching-panel">
                <SectionTitle
                  title={coach ? 'A moment of guidance' : 'Your movement guide'}
                  action={
                    <span className="pill">
                      <ScanLine size={13} /> {coach ? 'Coach' : 'Camera'}
                    </span>
                  }
                />
                {coach ? (
                  <>
                    <p>
                      {focused
                        ? `A personal cue for ${focused.name.split(' ')[0]}.`
                        : 'Select a participant to send a personal correction, or guide the whole class.'}
                    </p>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void send(cue, 'cue', focus || undefined);
                      }}
                    >
                      <label className="sr-only" htmlFor="coach-cue">
                        Coaching cue
                      </label>
                      <textarea
                        id="coach-cue"
                        placeholder="Keep the movement controlled. Let’s reset together…"
                        value={cue}
                        onChange={(e) => setCue(e.target.value)}
                        maxLength={600}
                      />
                      <button
                        className="button lime full"
                        disabled={!cue.trim() || item.status !== 'live'}
                      >
                        <Send size={16} /> Send {focus ? 'personal' : 'class'} cue
                      </button>
                    </form>
                    {focused?.helpRequested && (
                      <button
                        className="button outline full"
                        onClick={() => void help(false, focused.id)}
                      >
                        <Check size={16} /> Mark help request addressed
                      </button>
                    )}
                    <div className="privacy-note">
                      <ShieldCheck size={18} />
                      <p>
                        Client summaries are visible to you. Private cues are delivered only to the
                        selected trainee.
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <div
                      className={`practice-art ${exercises.find((e) => e.id === item.exercise)!.color}`}
                    >
                      <ExerciseArt exercise={item.exercise} />
                    </div>
                    <ol>
                      {exercises
                        .find((e) => e.id === item.exercise)!
                        .instructions.map((i) => (
                          <li key={i}>{i}</li>
                        ))}
                    </ol>
                    <p className="microcopy">
                      Estimates support your coach’s guidance. A high score does not establish that
                      a movement is safe or perfect.
                    </p>
                  </>
                )}
              </section>
              <section className="panel chat-panel">
                <SectionTitle
                  title="Session conversation"
                  action={<span className="chat-count">{messages.length}</span>}
                />
                <div className="chat-messages" aria-live="polite">
                  {!messages.length ? (
                    <div className="chat-empty">
                      <Users size={23} />
                      <p>
                        A little encouragement goes a long way.
                        <br />
                        Start the conversation.
                      </p>
                    </div>
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
                    placeholder="Say something encouraging…"
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
            </aside>
          </div>
          {remote.map((p) => (
            <ParticipantAudio key={p.identity} participant={p} />
          ))}
        </>
      )}
      {showConsent && (
        <Modal title="A shared space to move together." onClose={() => setShowConsent(false)}>
          <div className="form-stack">
            <p>
              This is a group class. Your camera and microphone, when enabled, are visible and
              audible to all enrolled participants. Your coach and you can see your movement
              summaries.
            </p>
            <div className="privacy-note">
              <ShieldCheck size={20} />
              <p>
                Camera analysis runs locally. Fuzzfit does not record the class. You can stop
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
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const tracks = Array.from(participant.audioTrackPublications.values()).flatMap((p) =>
      p.track ? [p.track] : [],
    );
    const element = ref.current;
    if (element) tracks.forEach((t) => t.attach(element));
    return () => {
      if (element) tracks.forEach((t) => t.detach(element));
    };
  }, [
    participant,
    participant.audioTrackPublications.size,
    Array.from(participant.audioTrackPublications.values())
      .map((p) => p.track?.sid || 'none')
      .join(','),
  ]);
  return <audio ref={ref} autoPlay />;
}
