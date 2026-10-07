'use client';
import { memo, useEffect, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { exercises } from '@/lib/catalog';
import type { ExerciseId } from '@/lib/types';

const steps: Record<ExerciseId, [string, string, string]> = {
  squat: [
    'Stand tall, feet about shoulder-width apart.',
    'Bend hips and knees, sitting back within a comfortable range.',
    'Press through your feet and return to standing. That completes one rep.',
  ],
  pushup: [
    'Place hands below shoulders and extend your legs. Keep your body in a line.',
    'Bend your elbows to lower your chest under control.',
    'Press back to extended arms. Ask your coach about an easier variation if needed.',
  ],
  curl: [
    'Stand tall, working arm extended, with a light weight.',
    'Bend your elbow to bring the weight toward your shoulder. Keep the upper arm still.',
    'Lower the weight slowly to the starting position. That completes one rep.',
  ],
  plank: [
    'Place forearms on the floor, elbows below shoulders.',
    'Extend legs and align your shoulders, hips, and ankles.',
    'Hold steadily and breathe. Only time observed in alignment counts.',
  ],
};

// Side-view illustrations teach the positions; the actual camera is evaluated separately.
function MovementFigure({ exercise, lowered }: { exercise: ExerciseId; lowered: boolean }) {
  const points =
    exercise === 'squat'
      ? lowered
        ? [
            [38, 27],
            [43, 42],
            [54, 64],
            [80, 68],
            [71, 94],
            [64, 43],
            [82, 40],
          ]
        : [
            [49, 13],
            [50, 29],
            [50, 53],
            [51, 73],
            [51, 94],
            [53, 49],
            [62, 64],
          ]
      : exercise === 'curl'
        ? [
            [49, 13],
            [50, 29],
            [50, 53],
            [51, 73],
            [51, 94],
            [52, 51],
            lowered ? [66, 31] : [54, 73],
          ]
        : exercise === 'plank'
          ? [
              [16, 43],
              [28, 48],
              [66, 64],
              [91, 74],
              [113, 83],
              [30, 83],
              [49, 84],
            ]
          : lowered
            ? [
                [14, 60],
                [27, 65],
                [66, 74],
                [90, 79],
                [114, 84],
                [42, 77],
                [29, 85],
              ]
            : [
                [14, 34],
                [27, 41],
                [66, 59],
                [90, 72],
                [114, 84],
                [27, 63],
                [29, 85],
              ];
  const [head, shoulder, hip, knee, ankle, elbow, wrist] = points;
  return (
    <svg
      viewBox="0 0 130 110"
      role="img"
      aria-label={`${exercise} ${lowered ? 'lowered' : 'starting'} position illustration`}
    >
      <path d="M10 99H120" stroke="#ccd5c7" strokeWidth="2" />
      <circle cx={head[0]} cy={head[1]} r="8" fill="#25382e" />
      <polyline
        points={[shoulder, hip, knee, ankle].map((p) => p.join(',')).join(' ')}
        fill="none"
        stroke="#25382e"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polyline
        points={[shoulder, elbow, wrist].map((p) => p.join(',')).join(' ')}
        fill="none"
        stroke="#527340"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {[shoulder, hip, knee, elbow].map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r="3" fill="#ceef92" />
      ))}
    </svg>
  );
}

export const WorkoutGuide = memo(function WorkoutGuide({
  exercise,
  compact = false,
}: {
  exercise: ExerciseId;
  compact?: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  useEffect(() => {
    if (compact) setExpanded(false);
  }, [compact]);
  const definition = exercises.find((e) => e.id === exercise)!;
  return (
    <section className="workout-guide" aria-label="How to do this exercise">
      <button
        className="guide-heading"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
      >
        <span>
          <small>LEARN THE MOVEMENT</small>
          <strong>How to do a {definition.name.toLowerCase()}</strong>
        </span>
        {expanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
      </button>
      {expanded && (
        <>
          <div className="movement-steps">
            {steps[exercise].map((step, i) => (
              <div key={step}>
                <MovementFigure exercise={exercise} lowered={i === 1} />
                <p>
                  <b>{i + 1}.</b> {step}
                </p>
              </div>
            ))}
          </div>
          <p className="position-instruction">
            <b>Camera setup:</b> {definition.instructions[0]} {definition.instructions[1]} Leave
            space around your body and use bright, even lighting.
          </p>
        </>
      )}
    </section>
  );
});
