import type { ExerciseId } from './types';
export const exercises: {
  id: ExerciseId;
  name: string;
  group: string;
  equipment: string;
  view: string;
  instructions: string[];
  color: string;
}[] = [
  {
    id: 'squat',
    name: 'Bodyweight squat',
    group: 'Lower body',
    equipment: 'Bodyweight',
    view: 'Side view · whole body',
    instructions: [
      'Place the camera at hip height, perpendicular to your side.',
      'Keep your shoulder, hip, knee, and ankle visible.',
      'Lower within a comfortable range, then return to standing.',
    ],
    color: 'lime',
  },
  {
    id: 'pushup',
    name: 'Push-up',
    group: 'Upper body',
    equipment: 'Exercise mat',
    view: 'Side view · whole body',
    instructions: [
      'Set the camera perpendicular to your side.',
      'Show your shoulder, elbow, wrist, hip, and ankle.',
      'Lower under control and press back up; choose a coach-approved variation.',
    ],
    color: 'lavender',
  },
  {
    id: 'curl',
    name: 'Biceps curl',
    group: 'Upper body',
    equipment: 'Light dumbbells',
    view: 'Side view · upper body',
    instructions: [
      'Place the camera perpendicular to your working arm.',
      'Keep your shoulder, elbow, wrist, and hip in frame.',
      'Curl within a comfortable range, keeping the upper arm steady.',
    ],
    color: 'peach',
  },
  {
    id: 'plank',
    name: 'Forearm plank',
    group: 'Core',
    equipment: 'Exercise mat',
    view: 'Side view · whole body',
    instructions: [
      'Set the camera perpendicular to your side.',
      'Keep your shoulder, hip, and ankle visible.',
      'Hold a comfortable aligned position; stop if you feel pain.',
    ],
    color: 'sky',
  },
];
export function exerciseName(id: string) {
  return exercises.find((e) => e.id === id)?.name ?? id;
}
export const starterBlocks = [
  { exercise: 'squat' as const, sets: 3, reps: 12, rest: 60 },
  { exercise: 'pushup' as const, sets: 3, reps: 10, rest: 60 },
  { exercise: 'plank' as const, sets: 3, reps: 30, rest: 45 },
];
