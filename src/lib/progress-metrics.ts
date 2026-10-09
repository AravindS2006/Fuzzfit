import type { WorkoutSetView } from './types';
export function summarizeWorkouts(sets: WorkoutSetView[], timeZone = 'UTC') {
  const weighted = (
    field: 'formScore' | 'qualityScore' | 'rangeDegrees' | 'repSeconds',
    weight: (set: WorkoutSetView) => number,
  ) => {
    const valid = sets.filter((set) => set[field] !== null && weight(set) > 0);
    const sum = valid.reduce((total, set) => total + weight(set), 0);
    return sum ? valid.reduce((total, set) => total + set[field]! * weight(set), 0) / sum : null;
  };
  const activeMs = sets.reduce((total, set) => total + set.activeMs, 0);
  const trackedMs = sets.reduce((total, set) => total + set.trackedMs, 0);
  return {
    reps: sets.reduce((total, set) => total + set.reps, 0),
    holdMs: sets.reduce((total, set) => total + set.holdMs, 0),
    sets: sets.length,
    completedSets: sets.filter((set) => set.completed).length,
    activeMs,
    trackedMs,
    coverage: activeMs ? (trackedMs / activeMs) * 100 : null,
    form: weighted('formScore', (set) => set.trackedMs),
    quality: weighted('qualityScore', (set) => set.reps),
    range: weighted('rangeDegrees', (set) => set.reps),
    tempo: weighted('repSeconds', (set) => set.reps),
    rejectedReps: sets.reduce((total, set) => total + set.rejectedReps, 0),
    loadVolume: sets
      .filter((set) => set.loadKg !== null)
      .reduce((total, set) => total + set.reps * set.loadKg!, 0),
    loadedSets: sets.filter((set) => set.loadKg !== null).length,
    trainingDays: new Set(
      sets
        .filter((set) => set.reps > 0 || set.holdMs > 0)
        .map((set) =>
          new Intl.DateTimeFormat('en-CA', {
            timeZone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
          }).format(new Date(set.endedAt)),
        ),
    ).size,
  };
}
export function csvCell(value: unknown) {
  const raw = String(value ?? '');
  // Spreadsheet formula injection applies to user-entered names as well as notes.
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}
export function workoutCsv(sets: WorkoutSetView[]) {
  const headers = [
    'Date UTC',
    'Trainee',
    'Exercise',
    'Source',
    'Set',
    'Target',
    'Reps',
    'Hold seconds',
    'Observed active seconds',
    'Tracked seconds',
    'Form estimate',
    'Rep quality',
    'Range degrees',
    'Rep seconds',
    'Confidence',
    'Rejected cycles',
    'Reported load kg',
    'Target reached',
    'Rule version',
  ];
  const rows = sets.map((set) => [
    set.endedAt,
    set.userName,
    set.exercise,
    set.classTitle ?? 'Practice',
    set.setNumber,
    set.target,
    set.reps,
    set.holdMs / 1000,
    set.activeMs / 1000,
    set.trackedMs / 1000,
    set.formScore,
    set.qualityScore,
    set.rangeDegrees,
    set.repSeconds,
    set.confidence,
    set.rejectedReps,
    set.loadKg,
    set.completed ? 'Yes' : 'No',
    set.ruleVersion,
  ]);
  return [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
}
