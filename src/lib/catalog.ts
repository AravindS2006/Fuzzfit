import type { ExerciseId } from './types';
import { exerciseIds, getExerciseProfile } from './exercise-profiles';
export const exercises = exerciseIds.map((id) => {
  const profile = getExerciseProfile(id);
  return {
    id: id as ExerciseId,
    name: profile.name,
    group: profile.category,
    equipment: ['curl', 'shoulderpress', 'lateralraise', 'row'].includes(id)
      ? 'Optional light dumbbells'
      : ['pushup', 'plank', 'sideplank', 'crunch', 'glutebridge'].includes(id)
        ? 'Exercise mat'
        : 'Bodyweight',
    view: profile.cameraCue,
    instructions: [profile.cameraCue, profile.startCue, profile.moveCue, profile.returnCue],
    color:
      profile.category === 'Core'
        ? 'sky'
        : profile.category === 'Lower body'
          ? 'lime'
          : profile.category === 'Conditioning'
            ? 'peach'
            : 'lavender',
  };
});
export function exerciseName(id: string) {
  return exercises.find((e) => e.id === id)?.name ?? id;
}
export const starterBlocks = [
  { exercise: 'squat' as const, sets: 3, reps: 12, rest: 60 },
  { exercise: 'pushup' as const, sets: 3, reps: 10, rest: 60 },
  { exercise: 'plank' as const, sets: 3, reps: 30, rest: 45 },
];
