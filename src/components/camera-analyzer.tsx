'use client';
import { useEffect, useRef, useState } from 'react';
import {
  Camera,
  CameraOff,
  ScanLine,
  Volume2,
  VolumeX,
  Play,
  Pause,
  CheckCircle2,
} from 'lucide-react';
import type { Block, ExerciseId } from '@/lib/types';
import {
  analyzePose,
  initialPoseState,
  skeletonConnections,
  type Analysis,
  type Landmark,
  RULE_VERSION,
} from '@/lib/pose-engine';
import { exercises } from '@/lib/catalog';
import {
  defaultWorkoutConfig,
  normalizeWorkoutConfig,
  type WorkoutConfig,
} from '@/lib/workout-config';
import { WorkoutGuide } from './workout-guide';
const empty: Analysis = {
  reps: 0,
  holdSeconds: 0,
  score: null,
  confidence: 0,
  phase: 'camera off',
  cue: 'Enable your camera to begin.',
  angle: null,
  tracked: false,
  ruleVersion: RULE_VERSION,
};
export function CameraAnalyzer({
  exercise,
  paused = false,
  revision = 0,
  stream,
  onAnalysis,
  onStream,
  initialReps = 0,
  initialHoldSeconds = 0,
  block,
  sessionCamera = false,
  onEnableCamera,
}: {
  exercise: ExerciseId;
  paused?: boolean;
  revision?: number;
  stream?: MediaStream | null;
  onAnalysis?: (a: Analysis) => void;
  onStream?: (s: MediaStream | null) => void;
  initialReps?: number;
  initialHoldSeconds?: number;
  block?: Block;
  sessionCamera?: boolean;
  onEnableCamera?: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null),
    canvas = useRef<HTMLCanvasElement>(null),
    worker = useRef<Worker | null>(null),
    state = useRef(initialPoseState());
  const previewState = useRef(initialPoseState());
  type Mode = 'setup' | 'active' | 'rest' | 'complete';
  type SetResult = {
    number: number;
    amount: number;
    score: number | null;
    range: number;
    tempo: number;
  };
  const [config, setConfig] = useState(() => defaultWorkoutConfig(exercise, block));
  const [mode, setMode] = useState<Mode>('setup');
  const [completedSets, setCompletedSets] = useState<SetResult[]>([]);
  const [restUntil, setRestUntil] = useState(0);
  const [restLeft, setRestLeft] = useState(0);
  const [localPaused, setLocalPaused] = useState(false);
  const modeRef = useRef<Mode>('setup');
  const configRef = useRef(config);
  const baseline = useRef({ reps: initialReps, seconds: initialHoldSeconds });
  const completedRef = useRef<SetResult[]>([]);
  const samples = useRef({ count: 0, total: 0 });
  const soundContext = useRef<AudioContext | null>(null);
  const lastVideoTime = useRef(-1);
  configRef.current = config;
  const ownStream = useRef<MediaStream | null>(null),
    currentStream = useRef<MediaStream | null>(null),
    timer = useRef<ReturnType<typeof setInterval> | null>(null),
    inFlight = useRef(false),
    generation = useRef(0);
  const exerciseRef = useRef(exercise),
    pausedRef = useRef(paused),
    analysisCallback = useRef(onAnalysis),
    streamCallback = useRef(onStream),
    voiceRef = useRef(false),
    lastSpoken = useRef({ text: '', at: 0 });
  const tally = useRef({ reps: initialReps, holdMs: initialHoldSeconds * 1000 });
  const [analysis, setAnalysis] = useState(empty),
    [status, setStatus] = useState('off'),
    [error, setError] = useState(''),
    [voice, setVoice] = useState(false);
  exerciseRef.current = exercise;
  pausedRef.current = paused || localPaused;
  analysisCallback.current = onAnalysis;
  streamCallback.current = onStream;
  voiceRef.current = voice;
  function stop() {
    generation.current += 1;
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    worker.current?.terminate();
    worker.current = null;
    inFlight.current = false;
    ownStream.current?.getTracks().forEach((t) => t.stop());
    ownStream.current = null;
    currentStream.current = null;
    if (video.current) video.current.srcObject = null;
    canvas.current?.getContext('2d')?.clearRect(0, 0, canvas.current.width, canvas.current.height);
    streamCallback.current?.(null);
    window.speechSynthesis?.cancel();
  }
  function announce(text: string, force = false, urgent = false) {
    if (!voiceRef.current || !window.speechSynthesis) return;
    if (
      !force &&
      (Date.now() - lastSpoken.current.at < (urgent ? 2000 : 7000) ||
        lastSpoken.current.text === text)
    )
      return;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
    lastSpoken.current = { text, at: Date.now() };
  }
  function signalRep() {
    const context = soundContext.current;
    if (!voiceRef.current || !context || context.state !== 'running') return;
    const oscillator = context.createOscillator(),
      gain = context.createGain();
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.frequency.value = 720;
    gain.gain.setValueAtTime(0.06, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.1);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.1);
  }
  function finishSet(result: Analysis) {
    if (modeRef.current !== 'active') return;
    const amount =
      exerciseRef.current === 'plank'
        ? result.holdSeconds - baseline.current.seconds
        : result.reps - baseline.current.reps;
    const entry = {
      number: completedRef.current.length + 1,
      amount,
      score: samples.current.count
        ? Math.round(samples.current.total / samples.current.count)
        : null,
      range: result.rangeDegrees ?? 0,
      tempo: result.lastRepSeconds ?? 0,
    };
    completedRef.current = [...completedRef.current, entry];
    setCompletedSets(completedRef.current);
    const nextMode = completedRef.current.length >= configRef.current.sets ? 'complete' : 'rest';
    modeRef.current = nextMode;
    setMode(nextMode);
    setLocalPaused(false);
    const until = Date.now() + configRef.current.rest * 1000;
    setRestUntil(until);
    setRestLeft(configRef.current.rest);
    announce(
      nextMode === 'complete'
        ? 'Workout complete. Well done. Take a recovery break.'
        : `Set finished. Rest for ${configRef.current.rest} seconds.`,
      true,
    );
  }
  function startSet() {
    if (paused || !analysis.tracked || status !== 'ready') return;
    baseline.current = {
      reps: tally.current.reps,
      seconds: Math.floor(tally.current.holdMs / 1000),
    };
    state.current = { ...initialPoseState(), ...tally.current };
    samples.current = { count: 0, total: 0 };
    modeRef.current = 'active';
    setMode('active');
    setLocalPaused(false);
    announce('Set started. Begin in the starting position, then move under control.', true);
  }
  useEffect(
    () => () => {
      stop();
      void soundContext.current?.close();
    },
    [],
  ); // All device and worker resources are owned by this component.
  useEffect(() => {
    tally.current = { reps: initialReps, holdMs: initialHoldSeconds * 1000 };
    state.current = { ...initialPoseState(), ...tally.current };
    previewState.current = initialPoseState();
    baseline.current = { reps: initialReps, seconds: initialHoldSeconds };
    modeRef.current = 'setup';
    setMode('setup');
    setLocalPaused(false);
    completedRef.current = [];
    setCompletedSets([]);
    let saved: Partial<WorkoutConfig> = {};
    try {
      saved = JSON.parse(localStorage.getItem(`fuzzfit-workout-${exercise}`) || '{}');
    } catch {}
    setConfig(
      normalizeWorkoutConfig(exercise, {
        ...saved,
        ...(block ? { sets: block.sets, target: block.reps, rest: block.rest } : {}),
      }),
    );
    setAnalysis({ ...empty, reps: initialReps, holdSeconds: initialHoldSeconds });
  }, [exercise, revision]);
  useEffect(() => {
    if (mode !== 'rest') return;
    const tick = () => setRestLeft(Math.max(0, Math.ceil((restUntil - Date.now()) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [mode, restUntil]);
  useEffect(() => {
    if (paused || localPaused) {
      state.current.stage = 'seek';
      state.current.candidate = '';
      state.current.lastTimestamp = 0;
      setAnalysis((previous) => ({ ...previous, score: null, confidence: 0, tracked: false }));
      window.speechSynthesis?.cancel();
    }
  }, [paused, localPaused]);
  useEffect(() => {
    if (stream && stream !== currentStream.current) void start(stream);
    if (!stream && currentStream.current && !ownStream.current) {
      stop();
      setStatus('off');
      setAnalysis({
        ...empty,
        reps: tally.current.reps,
        holdSeconds: Math.floor(tally.current.holdMs / 1000),
      });
    }
  }, [stream]);
  async function start(external?: MediaStream) {
    stop();
    const run = generation.current;
    state.current = { ...initialPoseState(), ...tally.current };
    previewState.current = initialPoseState();
    lastVideoTime.current = -1;
    setError('');
    setStatus('loading');
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.Worker || !window.createImageBitmap)
        throw new Error(
          'Camera analysis is not supported here. Use a current Chrome, Edge, or Safari browser over HTTPS.',
        );
      const camera =
        external ??
        (await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
          audio: false,
        }));
      if (generation.current !== run) {
        if (!external) camera.getTracks().forEach((t) => t.stop());
        return;
      }
      if (!external) ownStream.current = camera;
      currentStream.current = camera;
      streamCallback.current?.(camera);
      if (!video.current) return;
      video.current.srcObject = camera;
      await video.current.play();
      if (generation.current !== run) return;
      const task = new Worker('/pose-worker.js');
      worker.current = task;
      task.onerror = () => {
        if (generation.current === run) {
          stop();
          setStatus('off');
          setError('Camera analysis could not start. Retry in a supported browser.');
        }
      };
      task.onmessage = ({ data }) => {
        if (generation.current !== run) return;
        if (data.type === 'error') {
          stop();
          setStatus('off');
          setError(data.message);
          return;
        }
        if (data.type === 'ready') {
          setStatus('ready');
          timer.current = setInterval(async () => {
            const v = video.current;
            if (
              !v ||
              v.readyState < 2 ||
              inFlight.current ||
              pausedRef.current ||
              document.hidden ||
              lastVideoTime.current === v.currentTime
            )
              return;
            lastVideoTime.current = v.currentTime;
            inFlight.current = true;
            try {
              const bitmap = await createImageBitmap(v);
              if (generation.current !== run || !worker.current) {
                bitmap.close();
                return;
              }
              task.postMessage(
                {
                  type: 'frame',
                  bitmap,
                  timestamp: performance.now(),
                  width: v.videoWidth,
                  height: v.videoHeight,
                },
                [bitmap],
              );
            } catch {
              inFlight.current = false;
            }
          }, 100);
        }
        if (data.type === 'result') {
          inFlight.current = false;
          const activeSet = modeRef.current === 'active';
          const result = analyzePose(
            data.poses,
            exerciseRef.current,
            activeSet ? state.current : previewState.current,
            data.timestamp,
            data.width,
            data.height,
            pausedRef.current,
            configRef.current,
          );
          if (activeSet) {
            if (result.reps > tally.current.reps) signalRep();
            tally.current = { reps: state.current.reps, holdMs: state.current.holdMs };
            if (result.score !== null) {
              samples.current.count++;
              samples.current.total += result.score;
            }
            const progress =
              exerciseRef.current === 'plank'
                ? result.holdSeconds - baseline.current.seconds
                : result.reps - baseline.current.reps;
            if (progress >= configRef.current.target) finishSet(result);
          } else {
            result.reps = tally.current.reps;
            result.holdSeconds = Math.floor(tally.current.holdMs / 1000);
            result.score = null;
            if (result.tracked)
              result.phase =
                modeRef.current === 'setup'
                  ? 'ready to start'
                  : modeRef.current === 'rest'
                    ? 'resting'
                    : 'workout complete';
          }
          setAnalysis(result);
          analysisCallback.current?.(result);
          draw(data.poses[0] ?? [], data.width, data.height);
          if (modeRef.current === 'setup' || modeRef.current === 'active')
            announce(
              result.cue,
              false,
              !result.tracked ||
                result.cue.startsWith('Rep not counted') ||
                (result.score !== null && result.score < 75),
            );
        }
      };
      task.postMessage({ type: 'init' });
    } catch (err) {
      if (generation.current !== run) return;
      stop();
      setStatus('off');
      const name = err instanceof Error ? err.name : '';
      setError(
        name === 'NotAllowedError'
          ? 'Camera permission was denied. Allow camera access in your browser, then retry.'
          : name === 'NotFoundError'
            ? 'No camera was found. Connect a camera and retry.'
            : name === 'NotReadableError'
              ? 'Your camera may be in use by another app. Close it and retry.'
              : err instanceof Error
                ? err.message
                : 'Could not start your camera.',
      );
    }
  }
  function draw(landmarks: Landmark[], width: number, height: number) {
    const c = canvas.current;
    if (!c) return;
    c.width = width;
    c.height = height;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#cbff65';
    ctx.fillStyle = '#cbff65';
    for (const [a, b] of skeletonConnections) {
      if ((landmarks[a]?.visibility ?? 0) < 0.65 || (landmarks[b]?.visibility ?? 0) < 0.65)
        continue;
      ctx.beginPath();
      ctx.moveTo(landmarks[a].x * width, landmarks[a].y * height);
      ctx.lineTo(landmarks[b].x * width, landmarks[b].y * height);
      ctx.stroke();
    }
    for (const p of landmarks.slice(11)) {
      if ((p.visibility ?? 0) < 0.65) continue;
      ctx.beginPath();
      ctx.arc(p.x * width, p.y * height, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const definition = exercises.find((e) => e.id === exercise)!;
  const progress = Math.max(
    0,
    exercise === 'plank'
      ? analysis.holdSeconds - baseline.current.seconds
      : analysis.reps - baseline.current.reps,
  );
  const updateConfig = (change: Partial<WorkoutConfig>) => {
    const next = normalizeWorkoutConfig(exercise, { ...config, ...change });
    setConfig(next);
    try {
      localStorage.setItem(`fuzzfit-workout-${exercise}`, JSON.stringify(next));
    } catch {}
  };
  return (
    <div className="camera-module">
      <WorkoutGuide key={exercise} exercise={exercise} compact={mode !== 'setup'} />
      <section className="workout-setup" aria-label="Workout settings">
        <div className="workout-setup-title">
          <strong>Your workout</strong>
          <span>
            {block
              ? 'Targets from your coach’s plan · adjust with your coach'
              : 'Choose a comfortable target before you start'}
          </span>
        </div>
        <div className="workout-fields">
          <label>
            Sets
            <input
              type="number"
              min={1}
              max={10}
              value={config.sets}
              disabled={mode !== 'setup'}
              onChange={(e) => updateConfig({ sets: Number(e.target.value) })}
            />
          </label>
          <label>
            {exercise === 'plank' ? 'Seconds per set' : 'Reps per set'}
            <input
              type="number"
              min={1}
              max={120}
              value={config.target}
              disabled={mode !== 'setup'}
              onChange={(e) => updateConfig({ target: Number(e.target.value) })}
            />
          </label>
          <label>
            Rest (seconds)
            <input
              type="number"
              min={0}
              max={300}
              value={config.rest}
              disabled={mode !== 'setup'}
              onChange={(e) => updateConfig({ rest: Number(e.target.value) })}
            />
          </label>
        </div>
        <details className="tracking-settings">
          <summary>Adjust tracking with your coach</summary>
          <p>
            Use a side view. Choose the visible arm or leg. Joint angles are camera estimates;
            adjust the endpoints to your coach-approved movement range.
          </p>
          <div className="workout-fields">
            <label>
              Body side
              <select
                value={config.side}
                disabled={mode !== 'setup'}
                onChange={(e) => updateConfig({ side: e.target.value as WorkoutConfig['side'] })}
              >
                <option value="auto">Automatic</option>
                <option value="left">Left</option>
                <option value="right">Right</option>
              </select>
            </label>
            {exercise !== 'plank' && (
              <>
                <label>
                  Extended angle (°)
                  <input
                    type="number"
                    min={130}
                    max={175}
                    value={config.topAngle}
                    disabled={mode !== 'setup'}
                    onChange={(e) => updateConfig({ topAngle: Number(e.target.value) })}
                  />
                </label>
                <label>
                  Bent angle (°)
                  <input
                    type="number"
                    min={35}
                    max={config.topAngle - 25}
                    value={config.bottomAngle}
                    disabled={mode !== 'setup'}
                    onChange={(e) => updateConfig({ bottomAngle: Number(e.target.value) })}
                  />
                </label>
              </>
            )}
          </div>
        </details>
      </section>
      <div className="camera-view">
        <video ref={video} muted playsInline className="camera-video" />
        <canvas ref={canvas} className="pose-canvas" />
        {status === 'off' && (
          <div className="camera-placeholder">
            <div className="camera-icon">
              <ScanLine size={38} />
            </div>
            <h3>1. Learn the movement. 2. Position your camera.</h3>
            <p>
              {definition.view}
              <br />
              Pose analysis runs on your device.
            </p>
            <button
              className="button lime"
              disabled={sessionCamera && !onEnableCamera}
              onClick={() =>
                sessionCamera ? (stream ? void start(stream) : onEnableCamera?.()) : void start()
              }
            >
              <Camera size={17} /> {sessionCamera ? 'Turn on session camera' : 'Enable camera'}
            </button>
            {sessionCamera && (
              <p>Join live video first. The same camera is used for your coach and tracking.</p>
            )}
          </div>
        )}
        {status === 'loading' && (
          <div className="camera-loading">
            <span className="spinner" /> Preparing your camera & pose model…
          </div>
        )}
        {status === 'ready' && (
          <>
            <span className="tracking-badge">
              <span className={`status-dot ${analysis.tracked ? '' : 'amber'}`} />
              {paused || localPaused
                ? 'Paused'
                : analysis.tracked
                  ? 'Pose detected'
                  : 'Position camera'}
            </span>
            <div className="camera-bottom">
              <span>{definition.name}</span>
              <span>{Math.round(analysis.confidence * 100)}% tracking confidence</span>
            </div>
          </>
        )}
      </div>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      <div className="camera-tools">
        <span>Local analysis · no recording</span>
        <div>
          <button
            className="button outline small"
            title={voice ? 'Mute voice & rep sound' : 'Enable voice & rep sound'}
            aria-label={voice ? 'Mute voice & rep sound' : 'Enable voice & rep sound'}
            aria-pressed={voice}
            onClick={() => {
              setVoice(!voice);
              voiceRef.current = !voice;
              if (voice) window.speechSynthesis?.cancel();
              else {
                if (window.AudioContext) {
                  soundContext.current ??= new AudioContext();
                  void soundContext.current.resume();
                }
                announce(analysis.cue, true);
              }
            }}
          >
            {voice ? <Volume2 size={18} /> : <VolumeX size={18} />}
            {voice ? 'Mute voice & rep sound' : 'Enable voice & rep sound'}
          </button>
          {status !== 'off' && (
            <button
              className="icon-button"
              title="Stop local camera analysis"
              aria-label="Stop local camera analysis"
              onClick={() => {
                stop();
                setStatus('off');
                setAnalysis({
                  ...empty,
                  reps: tally.current.reps,
                  holdSeconds: Math.floor(tally.current.holdMs / 1000),
                });
              }}
            >
              <CameraOff size={18} />
            </button>
          )}
        </div>
      </div>
      <section className="set-progress" aria-label="Set progress">
        <div>
          <strong>
            {mode === 'complete'
              ? 'Workout complete'
              : `Set ${Math.min(completedSets.length + 1, config.sets)} of ${config.sets}`}
          </strong>
          <span>
            {mode === 'setup'
              ? 'Camera ready? Read the steps above, then start your set.'
              : mode === 'rest'
                ? `Recovery · ${restLeft}s remaining`
                : mode === 'complete'
                  ? 'Your sets are shown below.'
                  : `${progress} / ${config.target} ${exercise === 'plank' ? 'seconds' : 'reps'}`}
          </span>
        </div>
        <progress
          value={Math.min(progress, config.target)}
          max={config.target}
          aria-label="Current set target"
        />
        <div className="set-actions">
          {(mode === 'setup' || mode === 'rest') && (
            <button
              className="button lime"
              disabled={
                paused ||
                status !== 'ready' ||
                !analysis.tracked ||
                (mode === 'rest' && restLeft > 0)
              }
              onClick={startSet}
            >
              <Play size={17} />
              {mode === 'rest' ? 'Start next set' : 'Start set'}
            </button>
          )}
          {mode === 'rest' && restLeft > 0 && (
            <button
              className="button outline"
              onClick={() => {
                setRestUntil(Date.now());
                setRestLeft(0);
              }}
            >
              Skip rest
            </button>
          )}
          {mode === 'active' && (
            <>
              <button
                className="button outline"
                disabled={paused}
                onClick={() => {
                  setLocalPaused(!localPaused);
                  state.current = { ...initialPoseState(), ...tally.current };
                }}
              >
                {localPaused ? <Play size={16} /> : <Pause size={16} />}
                {localPaused ? 'Resume set' : 'Pause set'}
              </button>
              <button className="button outline" onClick={() => finishSet(analysis)}>
                Finish set early
              </button>
            </>
          )}
          {mode === 'complete' && (
            <button
              className="button lime"
              onClick={() => {
                completedRef.current = [];
                setCompletedSets([]);
                modeRef.current = 'setup';
                setMode('setup');
                baseline.current = {
                  reps: tally.current.reps,
                  seconds: Math.floor(tally.current.holdMs / 1000),
                };
              }}
            >
              New workout
            </button>
          )}
        </div>
      </section>
      <div className="analysis-strip">
        <div>
          <span>{exercise === 'plank' ? 'Hold time' : 'Reps this exercise'}</span>
          <strong>
            {exercise === 'plank'
              ? `${analysis.holdSeconds}s`
              : String(analysis.reps).padStart(2, '0')}
          </strong>
        </div>
        <div>
          <span>Form estimate</span>
          <strong>
            {analysis.score === null ? '—' : Math.round(analysis.score)}
            <small>{analysis.score === null ? '' : '/100'}</small>
          </strong>
        </div>
        <div>
          <span>Movement phase</span>
          <strong className="phase-text">
            {paused || localPaused
              ? 'Paused'
              : mode === 'rest'
                ? 'Resting'
                : mode === 'complete'
                  ? 'Complete'
                  : analysis.phase}
          </strong>
        </div>
      </div>
      <div className="cue-card">
        <ScanLine size={20} />
        <div>
          <span>CAMERA COACH</span>
          <p role="status">
            {paused || localPaused
              ? 'Tracking paused. Take a moment to reset.'
              : mode === 'rest'
                ? 'Rest, breathe, and prepare for your next set.'
                : mode === 'complete'
                  ? 'Workout finished. Review your progress below.'
                  : analysis.cue}
          </p>
        </div>
      </div>
      {mode === 'active' && (
        <div className="movement-metrics">
          <span>
            Last rep range: <b>{analysis.rangeDegrees ? `${analysis.rangeDegrees}°` : '—'}</b>
          </span>
          <span>
            Last rep time:{' '}
            <b>{analysis.lastRepSeconds ? `${analysis.lastRepSeconds.toFixed(1)}s` : '—'}</b>
          </span>
          <span>
            Joint angle: <b>{analysis.angle === null ? '—' : `${analysis.angle}°`}</b>
          </span>
        </div>
      )}
      {!!completedSets.length && (
        <div className="set-results">
          <h3>
            <CheckCircle2 size={18} /> Your set results
          </h3>
          <p className="microcopy">
            Set details stay in this page. In a joined class, cumulative reps and form summaries are
            saved in Insights.
          </p>
          <table>
            <thead>
              <tr>
                <th>Set</th>
                <th>{exercise === 'plank' ? 'Seconds' : 'Reps'}</th>
                <th>Target</th>
                <th>Form estimate</th>
              </tr>
            </thead>
            <tbody>
              {completedSets.map((s) => (
                <tr key={s.number}>
                  <td>{s.number}</td>
                  <td>{s.amount}</td>
                  <td>
                    {s.amount >= config.target ? 'Reached' : `${s.amount} / ${config.target}`}
                  </td>
                  <td>{s.score === null ? '—' : `${s.score}/100`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="microcopy">
        Geometry-based estimates, reviewed with your coach. Stop if a movement causes pain.
      </p>
    </div>
  );
}
