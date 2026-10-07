export type ExerciseId = 'squat' | 'pushup' | 'curl' | 'plank';
export type Person = { id: string; name: string; email: string; role: string; goal: string };
export type Block = { exercise: ExerciseId; sets: number; reps: number; rest: number };
export type Plan = { id: string; name: string; description: string; blocks: Block[] };
export type MetricView = {
  exercise: string;
  revision: number;
  reps: number;
  holdSeconds: number;
  score: number | null;
  confidence: number;
  phase: string;
  cue: string;
  updatedAt: string;
};
export type ClientView = Person & { joinedAt: string };
export type ClassView = {
  id: string;
  title: string;
  startsAt: string;
  duration: number;
  capacity: number;
  status: string;
  exercise: ExerciseId;
  revision: number;
  paused: boolean;
  startedAt: string | null;
  endedAt: string | null;
  coachId: string;
  coachName: string;
  planId: string | null;
  workout?: Block[];
  participants: {
    id: string;
    name: string;
    helpRequested: boolean;
    metric: MetricView | null;
    summary: { totalReps: number; trackedSamples: number; scoreTotal: number } | null;
  }[];
};
export type WorkspaceData = {
  user: Person;
  studio: { id: string; name: string } | null;
  clients: ClientView[];
  plans: Plan[];
  classes: ClassView[];
  billing: string;
  services: { video: boolean; billing: boolean; email: boolean };
  demo: boolean;
};
export type MessageView = {
  id: string;
  senderId: string;
  senderName: string;
  recipientId: string | null;
  text: string;
  kind: string;
  createdAt: string;
};
