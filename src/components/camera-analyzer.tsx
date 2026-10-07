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
  Settings2,
  ChevronDown,
  ChevronUp,
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
import { Modal } from './ui';
import {
  advanceStartCountdown,
  canStartWorkout,
  initialStartCountdown,
  MAX_START_FRAME_GAP_MS,
} from '@/lib/workout-start';
import { workoutSetProgress } from '@/lib/workout-progress';

const movementSteps: Record<ExerciseId, [string, string, string]> = {
  squat: [
    'Stand tall, feet about shoulder-width apart.',
    'Bend hips and knees, sitting back within a comfortable range.',
    'Press through your feet and return to standing to complete one rep.',
  ],
  pushup: [
    'Place hands below shoulders and extend your legs. Keep your body in a line.',
    'Bend your elbows to lower your chest under control.',
    'Press back to extended arms. Ask your coach about an easier variation if needed.',
  ],
  curl: [
    'Stand tall with your working arm extended and a light weight.',
    'Bend your elbow toward your shoulder, keeping your upper arm still.',
    'Lower the weight slowly to the starting position to complete one rep.',
  ],
  plank: [
    'Place forearms on the floor, elbows below shoulders.',
    'Extend your legs and align your shoulders, hips, and ankles.',
    'Hold steadily and breathe. Only time observed in alignment counts.',
  ],
};
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [armed, setArmed] = useState(false);
  const [showGo, setShowGo] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [countdownPaused, setCountdownPaused] = useState(false);
  const [cueExpanded, setCueExpanded] = useState(false);
  const armedRef = useRef(false);
  const armedAt = useRef(0);
  const startClock = useRef(initialStartCountdown());
  const lastCountdownSound = useRef<number | null>(null);
  const lastFrameAt = useRef(0);
  const staleFrame = useRef(false);
  const initDeadline = useRef<ReturnType<typeof setTimeout> | null>(null);
  const modeRef = useRef<Mode>('setup');
  const configRef = useRef(config);
  const baseline = useRef({ reps: initialReps, holdMs: initialHoldSeconds * 1000 });
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
    cancelStart();
    if (initDeadline.current) clearTimeout(initDeadline.current);
    initDeadline.current = null;
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
    setShowGo(false);
    const amount = Math.floor(
      workoutSetProgress(exerciseRef.current, result.reps, tally.current.holdMs, baseline.current),
    );
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
  function cancelStart() {
    if (armedRef.current) window.speechSynthesis?.cancel();
    armedRef.current = false;
    startClock.current = initialStartCountdown();
    lastCountdownSound.current = null;
    setArmed(false);
    setCountdown(null);
    setCountdownPaused(false);
    setShowGo(false);
  }
  function startSet() {
    if (
      pausedRef.current ||
      document.hidden ||
      status !== 'ready' ||
      armedRef.current ||
      (modeRef.current !== 'setup' && modeRef.current !== 'rest') ||
      (modeRef.current === 'rest' && Date.now() < restUntil)
    )
      return;
    previewState.current = initialPoseState();
    startClock.current = initialStartCountdown();
    armedAt.current = performance.now();
    armedRef.current = true;
    lastCountdownSound.current = null;
    setCountdown(null);
    setCountdownPaused(false);
    setArmed(true);
    setSettingsOpen(false);
    if (voiceRef.current && window.AudioContext) {
      soundContext.current ??= new AudioContext();
      void soundContext.current.resume();
    }
    announce(
      'Step back into view and hold your starting position. Your set will start after the countdown.',
      true,
    );
  }
  function activateSet(timestamp: number) {
    if (!armedRef.current || pausedRef.current || document.hidden) return;
    baseline.current = { reps: tally.current.reps, holdMs: tally.current.holdMs };
    const preview = previewState.current;
    // The countdown already observed a stable starting pose. Preserve that readiness
    // so the first movement after Go is counted, without importing rehearsal reps.
    state.current = {
      ...initialPoseState(),
      ...tally.current,
      stage: exerciseRef.current === 'plank' ? 'seek' : 'ready',
      side: preview.side,
      smoothAngle: preview.smoothAngle,
      candidate: preview.candidate,
      candidateSince: preview.candidateSince,
      lastTimestamp: timestamp,
      previousHoldValid: exerciseRef.current === 'plank',
    };
    cancelStart();
    samples.current = { count: 0, total: 0 };
    modeRef.current = 'active';
    setMode('active');
    setShowGo(true);
    setLocalPaused(false);
    signalRep();
    announce('Go. Your set has started. Move under control.', true);
  }
  function invalidateTracking(cue: string) {
    canvas.current?.getContext('2d')?.clearRect(0, 0, canvas.current.width, canvas.current.height);
    state.current.stage = 'seek';
    state.current.candidate = '';
    state.current.lastTimestamp = 0;
    state.current.previousHoldValid = false;
    previewState.current = initialPoseState();
    startClock.current = initialStartCountdown();
    lastCountdownSound.current = null;
    setCountdown(null);
    setCountdownPaused(false);
    const unavailable = {
      ...empty,
      reps: tally.current.reps,
      holdSeconds: Math.floor(tally.current.holdMs / 1000),
      phase: 'camera paused',
      cue,
    };
    setAnalysis(unavailable);
    analysisCallback.current?.(unavailable);
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
    baseline.current = { reps: initialReps, holdMs: initialHoldSeconds * 1000 };
    cancelStart();
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
      cancelStart();
      state.current.stage = 'seek';
      state.current.candidate = '';
      state.current.lastTimestamp = 0;
      setAnalysis((previous) => ({ ...previous, score: null, confidence: 0, tracked: false }));
      window.speechSynthesis?.cancel();
    }
  }, [paused, localPaused]);
  useEffect(() => {
    if (!showGo) return;
    const timer = setTimeout(() => setShowGo(false), 1000);
    return () => clearTimeout(timer);
  }, [showGo]);
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) {
        cancelStart();
        invalidateTracking(
          'Tracking paused while this tab is hidden. Return to the meeting to continue.',
        );
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);
  useEffect(() => {
    if (status !== 'ready') return;
    const watchdog = setInterval(() => {
      if (
        document.hidden ||
        pausedRef.current ||
        staleFrame.current ||
        performance.now() - lastFrameAt.current <= MAX_START_FRAME_GAP_MS
      )
        return;
      staleFrame.current = true;
      invalidateTracking(
        'Camera frames paused. Wait for tracking to recover or restart camera analysis.',
      );
    }, 250);
    return () => clearInterval(watchdog);
  }, [status]);
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
          if (initDeadline.current) clearTimeout(initDeadline.current);
          initDeadline.current = null;
          lastFrameAt.current = performance.now();
          staleFrame.current = false;
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
            const timestamp = performance.now();
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
                  timestamp,
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
          const now = performance.now();
          if (
            document.hidden ||
            pausedRef.current ||
            !Number.isFinite(data.timestamp) ||
            now - data.timestamp > MAX_START_FRAME_GAP_MS ||
            data.timestamp > now
          ) {
            staleFrame.current = true;
            invalidateTracking('Waiting for fresh camera frames before tracking continues.');
            return;
          }
          lastFrameAt.current = data.timestamp;
          staleFrame.current = false;
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
          const continuing = armedRef.current && startClock.current.acquired;
          const ready =
            canStartWorkout(result, exerciseRef.current, configRef.current, continuing) &&
            (continuing ||
              exerciseRef.current === 'plank' ||
              previewState.current.stage === 'ready');
          if (armedRef.current) {
            startClock.current = advanceStartCountdown(
              startClock.current,
              ready && data.timestamp >= armedAt.current,
              data.timestamp,
            );
            const remaining = !startClock.current.acquired
              ? null
              : Math.ceil(startClock.current.remainingMs / 1000);
            setCountdown(remaining);
            setCountdownPaused(startClock.current.invalidSince !== null);
            if (remaining !== null && remaining > 0 && remaining !== lastCountdownSound.current) {
              signalRep();
              lastCountdownSound.current = remaining;
            }
            if (ready && startClock.current.remainingMs === 0) activateSet(data.timestamp);
          }
          if (activeSet) {
            if (result.reps > tally.current.reps) signalRep();
            tally.current = { reps: state.current.reps, holdMs: state.current.holdMs };
            if (result.score !== null) {
              samples.current.count++;
              samples.current.total += result.score;
            }
            const progress = workoutSetProgress(
              exerciseRef.current,
              result.reps,
              tally.current.holdMs,
              baseline.current,
            );
            if (progress >= configRef.current.target) finishSet(result);
          } else {
            result.reps = tally.current.reps;
            result.holdSeconds = Math.floor(tally.current.holdMs / 1000);
            result.score = null;
            if (armedRef.current) {
              result.phase = !startClock.current.acquired
                ? 'getting into position'
                : 'starting countdown';
              result.cue = ready
                ? 'Hold your starting position through the countdown.'
                : result.tracked
                  ? `${movementSteps[exerciseRef.current][0]} Hold this starting position for the countdown.`
                  : result.cue;
            } else if (result.tracked && modeRef.current === 'rest') {
              result.phase = 'resting';
            } else if (result.tracked && modeRef.current === 'complete') {
              result.phase = 'workout complete';
            } else if (result.tracked && modeRef.current === 'setup' && ready) {
              result.phase = 'ready to start';
            }
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
      initDeadline.current = setTimeout(() => {
        if (generation.current !== run) return;
        stop();
        setStatus('off');
        setError(
          'Pose tracking took too long to load. Check your connection and retry camera analysis.',
        );
      }, 20000);
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
  const progress = Math.floor(
    workoutSetProgress(exercise, analysis.reps, tally.current.holdMs, baseline.current),
  );
  const updateConfig = (change: Partial<WorkoutConfig>) => {
    const next = normalizeWorkoutConfig(exercise, { ...config, ...change });
    setConfig(next);
    try {
      localStorage.setItem(`fuzzfit-workout-${exercise}`, JSON.stringify(next));
    } catch {}
  };
  const cue =
    paused || localPaused
      ? 'Tracking paused. Take a moment to reset.'
      : armed
        ? countdown === null
          ? `${movementSteps[exercise][0]} Step into camera view.`
          : countdownPaused
            ? 'Countdown paused. Return to your starting position.'
            : `Starting in ${countdown}. Stay in your starting position.`
        : mode === 'rest'
          ? 'Rest, breathe, and prepare for your next set.'
          : mode === 'complete'
            ? 'Your workout is finished. Open settings to review your sets.'
            : status === 'off'
              ? `${definition.instructions[0]} ${definition.instructions[1]}`
              : status === 'loading'
                ? 'Preparing pose tracking. Keep your body in view.'
                : mode === 'setup' && analysis.tracked
                  ? 'Tap Start set, then step back. Wait for Go.'
                  : analysis.cue;
  const currentSet = Math.min(completedSets.length + 1, config.sets);
  return (
    <div className="camera-analyzer meeting-analyzer">
      <div className="camera-view">
        <video ref={video} muted playsInline className="camera-video" />
        <canvas ref={canvas} className="pose-canvas" aria-hidden="true" />
        <div className="analyzer-topbar">
          <span className="analyzer-identity">You · {definition.name}</span>
          <button
            className="icon-button analyzer-settings-button"
            title="Workout settings"
            aria-label="Workout settings"
            onClick={() => {
              cancelStart();
              setSettingsOpen(true);
            }}
          >
            <Settings2 size={19} />
          </button>
        </div>
        {status === 'off' && (
          <div className="camera-placeholder">
            <div className="camera-icon">
              <Camera size={32} />
            </div>
            <h3>Your workout camera</h3>
            <p>
              {definition.view}. {definition.instructions[0]}
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
            {sessionCamera && <p>Your coach sees the same camera used for tracking.</p>}
          </div>
        )}
        {((armed && countdown !== null) || showGo) && (
          <div className="start-countdown" role="status" aria-label="Set start countdown">
            <span>
              {showGo ? 'Your set has started' : countdownPaused ? 'Countdown paused' : 'Get ready'}
            </span>
            <strong>{showGo ? 'Go' : countdown}</strong>
            <span>
              {showGo
                ? 'Move under control'
                : countdownPaused
                  ? 'Return to your starting position'
                  : 'Stay in position · Starts automatically'}
            </span>
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
            <div
              className="analysis-strip analyzer-hud"
              role="group"
              aria-label="Live workout scores"
            >
              <div>
                <span>{exercise === 'plank' ? 'Hold time' : 'Total reps'}</span>
                <strong data-testid="cumulative-reps">
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
                    : armed
                      ? countdown === null
                        ? 'Getting ready'
                        : countdownPaused
                          ? 'Countdown paused'
                          : `Starting in ${countdown}`
                      : mode === 'rest'
                        ? 'Resting'
                        : mode === 'complete'
                          ? 'Complete'
                          : analysis.phase}
                </strong>
              </div>
            </div>
            <div className="camera-bottom">
              <span>
                Set {currentSet} / {config.sets}
              </span>
              <span>{Math.round(analysis.confidence * 100)}% tracking confidence</span>
            </div>
          </>
        )}
      </div>
      <div className="analyzer-footer">
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        <div className={`cue-card analyzer-cue ${cueExpanded ? 'is-expanded' : ''}`}>
          <ScanLine size={16} aria-hidden="true" />
          <p role="status">{cue}</p>
          <button
            className="icon-button cue-expand"
            aria-label={cueExpanded ? 'Collapse coaching cue' : 'Expand coaching cue'}
            aria-expanded={cueExpanded}
            onClick={() => setCueExpanded(!cueExpanded)}
          >
            {cueExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
        <section className="set-progress analyzer-progress" aria-label="Set progress">
          <div>
            <strong>
              {mode === 'complete' ? 'Workout complete' : `Set ${currentSet} of ${config.sets}`}
            </strong>
            <span>
              {armed
                ? countdownPaused
                  ? 'Return to start position'
                  : 'Wait for Go'
                : mode === 'setup'
                  ? `${config.target} ${exercise === 'plank' ? 'seconds' : 'reps'} · Start when ready`
                  : mode === 'rest'
                    ? `Recovery · ${restLeft}s remaining`
                    : mode === 'complete'
                      ? `${completedSets.length} sets finished`
                      : `${progress} / ${config.target} ${exercise === 'plank' ? 'seconds' : 'reps'}`}
            </span>
          </div>
          <progress
            value={Math.min(progress, config.target)}
            max={config.target}
            aria-label="Current set target"
          />
          <div className="set-actions">
            {!armed && (mode === 'setup' || mode === 'rest') && (
              <button
                className="button lime"
                disabled={paused || status !== 'ready' || (mode === 'rest' && restLeft > 0)}
                onClick={startSet}
              >
                <Play size={17} /> {mode === 'rest' ? 'Start next set' : 'Start set'}
              </button>
            )}
            {status === 'ready' && analysis.phase === 'camera paused' && (
              <button
                className="button outline"
                onClick={() => {
                  const shared = ownStream.current
                    ? undefined
                    : (currentStream.current ?? undefined);
                  void start(shared);
                }}
              >
                Retry tracking
              </button>
            )}
            {armed && (
              <button className="button outline" onClick={cancelStart}>
                Cancel start
              </button>
            )}
            {mode === 'rest' && restLeft > 0 && (
              <button
                className="button outline small"
                onClick={() => {
                  setRestUntil(Date.now());
                  setRestLeft(0);
                }}
              >
                Skip rest
              </button>
            )}
            {mode === 'active' && (
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
                    holdMs: tally.current.holdMs,
                  };
                }}
              >
                New workout
              </button>
            )}
          </div>
          <div className="analyzer-tools" role="group" aria-label="Pose tracking controls">
            <div>
              <button
                className="icon-button"
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
        </section>
      </div>
      {settingsOpen && (
        <Modal title="Workout settings" onClose={() => setSettingsOpen(false)}>
          <div className="analyzer-settings">
            <section className="workout-setup" aria-label="Workout targets">
              <div className="workout-setup-title">
                <strong>{definition.name}</strong>
                <span>
                  {block ? 'Targets from your coach’s plan' : 'Set a comfortable target'}
                  {mode !== 'setup' && ' · Targets are locked during a workout'}
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
                  Use a side view and choose your visible arm or leg. Ask your coach to set the
                  movement range before changing these camera angle estimates.
                </p>
                <div className="workout-fields">
                  <label>
                    Body side
                    <select
                      value={config.side}
                      disabled={mode !== 'setup'}
                      onChange={(e) =>
                        updateConfig({ side: e.target.value as WorkoutConfig['side'] })
                      }
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
                      <label>
                        Minimum rep time (ms)
                        <input
                          type="number"
                          min={500}
                          max={3000}
                          step={100}
                          value={config.minRepMs}
                          disabled={mode !== 'setup'}
                          onChange={(e) => updateConfig({ minRepMs: Number(e.target.value) })}
                        />
                      </label>
                    </>
                  )}
                </div>
              </details>
            </section>
            <section className="analyzer-instructions" aria-label="How to do this exercise">
              <h3>Movement & camera setup</h3>
              <p>
                {definition.instructions[0]} {definition.instructions[1]} Use bright, even lighting.
              </p>
              <ol>
                {movementSteps[exercise].map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              <p className="microcopy">
                Tap Start set before stepping back. Stay in your starting position through the
                five-second countdown. Small movements are tolerated; brief tracking uncertainty
                pauses the timer. Full, controlled movements count after Go. Pose analysis stays on
                your device. Form scores are camera estimates to review with your coach. Stop if a
                movement causes pain.
              </p>
            </section>
            {mode === 'active' && (
              <div className="analyzer-live-details">
                <div className="movement-metrics">
                  <span>
                    Last rep range:{' '}
                    <b>{analysis.rangeDegrees ? `${analysis.rangeDegrees}°` : '—'}</b>
                  </span>
                  <span>
                    Last rep time:{' '}
                    <b>
                      {analysis.lastRepSeconds ? `${analysis.lastRepSeconds.toFixed(1)}s` : '—'}
                    </b>
                  </span>
                  <span>
                    Joint angle: <b>{analysis.angle === null ? '—' : `${analysis.angle}°`}</b>
                  </span>
                </div>
                <button
                  className="button outline"
                  onClick={() => {
                    finishSet(analysis);
                    setSettingsOpen(false);
                  }}
                >
                  Finish set early
                </button>
              </div>
            )}
            {!!completedSets.length && (
              <div className="set-results">
                <h3>
                  <CheckCircle2 size={18} /> Your set results
                </h3>
                <p className="microcopy">
                  Set details stay in this page. In a joined class, cumulative reps and form
                  summaries are saved in Insights.
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
            <button
              className="button lime analyzer-settings-done"
              onClick={() => setSettingsOpen(false)}
            >
              Done
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
