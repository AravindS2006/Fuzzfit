'use client';
import { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, ScanLine, Volume2, VolumeX, RotateCcw } from 'lucide-react';
import type { ExerciseId } from '@/lib/types';
import {
  analyzePose,
  initialPoseState,
  skeletonConnections,
  type Analysis,
  type Landmark,
} from '@/lib/pose-engine';
import { exercises } from '@/lib/catalog';
const empty: Analysis = {
  reps: 0,
  holdSeconds: 0,
  score: null,
  confidence: 0,
  phase: 'camera off',
  cue: 'Enable your camera to begin.',
  angle: null,
  tracked: false,
  ruleVersion: 'geometry-v1',
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
}: {
  exercise: ExerciseId;
  paused?: boolean;
  revision?: number;
  stream?: MediaStream | null;
  onAnalysis?: (a: Analysis) => void;
  onStream?: (s: MediaStream | null) => void;
  initialReps?: number;
  initialHoldSeconds?: number;
}) {
  const video = useRef<HTMLVideoElement>(null),
    canvas = useRef<HTMLCanvasElement>(null),
    worker = useRef<Worker | null>(null),
    state = useRef(initialPoseState());
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
  pausedRef.current = paused;
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
  useEffect(
    () => () => {
      stop();
    },
    [],
  ); // All device and worker resources are owned by this component.
  useEffect(() => {
    tally.current = { reps: initialReps, holdMs: initialHoldSeconds * 1000 };
    state.current = { ...initialPoseState(), ...tally.current };
    setAnalysis({ ...empty, reps: initialReps, holdSeconds: initialHoldSeconds });
  }, [exercise, revision]);
  useEffect(() => {
    if (paused) {
      state.current.stage = 'seek';
      state.current.candidate = '';
      state.current.lastTimestamp = 0;
      setAnalysis((previous) => ({ ...previous, score: null, confidence: 0, tracked: false }));
      window.speechSynthesis?.cancel();
    }
  }, [paused]);
  useEffect(() => {
    if (stream && stream !== currentStream.current) void start(stream);
    if (!stream && currentStream.current && !ownStream.current) {
      stop();
      setStatus('off');
      setAnalysis(empty);
    }
  }, [stream]);
  async function start(external?: MediaStream) {
    stop();
    const run = generation.current;
    state.current = { ...initialPoseState(), ...tally.current };
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
            if (!v || v.readyState < 2 || inFlight.current || pausedRef.current || document.hidden)
              return;
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
          const result = analyzePose(
            data.poses,
            exerciseRef.current,
            state.current,
            data.timestamp,
            data.width,
            data.height,
            pausedRef.current,
          );
          tally.current = { reps: state.current.reps, holdMs: state.current.holdMs };
          setAnalysis(result);
          analysisCallback.current?.(result);
          draw(data.poses[0] ?? [], data.width, data.height);
          if (
            voiceRef.current &&
            result.tracked &&
            Date.now() - lastSpoken.current.at > 8000 &&
            result.cue !== lastSpoken.current.text &&
            window.speechSynthesis
          ) {
            window.speechSynthesis.cancel();
            window.speechSynthesis.speak(new SpeechSynthesisUtterance(result.cue));
            lastSpoken.current = { text: result.cue, at: Date.now() };
          }
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
  return (
    <div className="camera-module">
      <div className="camera-view">
        <video ref={video} muted playsInline className="camera-video" />
        <canvas ref={canvas} className="pose-canvas" />
        {status === 'off' && (
          <div className="camera-placeholder">
            <div className="camera-icon">
              <ScanLine size={38} />
            </div>
            <h3>Your movement, in focus.</h3>
            <p>
              {definition.view}
              <br />
              Your camera frames stay on your device for analysis.
            </p>
            <button className="button lime" onClick={() => void start()}>
              <Camera size={17} /> Enable camera
            </button>
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
              {paused ? 'Paused' : analysis.tracked ? 'Pose detected' : 'Position camera'}
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
            className="icon-button"
            title={voice ? 'Mute spoken cues' : 'Enable spoken cues'}
            aria-label={voice ? 'Mute spoken cues' : 'Enable spoken cues'}
            onClick={() => {
              setVoice(!voice);
              if (voice) window.speechSynthesis?.cancel();
            }}
          >
            {voice ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>
          {status !== 'off' && (
            <button
              className="icon-button"
              title="Reset set"
              aria-label="Reset set"
              onClick={() => {
                tally.current = { reps: 0, holdMs: 0 };
                state.current = initialPoseState();
                setAnalysis(empty);
              }}
              disabled={!!onAnalysis}
            >
              <RotateCcw size={18} />
            </button>
          )}
          {status !== 'off' && (
            <button
              className="icon-button"
              title="Stop local camera analysis"
              aria-label="Stop local camera analysis"
              onClick={() => {
                stop();
                setStatus('off');
                setAnalysis(empty);
              }}
            >
              <CameraOff size={18} />
            </button>
          )}
        </div>
      </div>
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
          <strong className="phase-text">{paused ? 'Paused' : analysis.phase}</strong>
        </div>
      </div>
      <div className="cue-card">
        <ScanLine size={20} />
        <div>
          <span>CAMERA COACH</span>
          <p>{paused ? 'Tracking paused. Take a moment to reset.' : analysis.cue}</p>
        </div>
      </div>
      <p className="microcopy">
        Geometry-based estimates, reviewed with your coach. Stop if a movement causes pain.
      </p>
    </div>
  );
}
