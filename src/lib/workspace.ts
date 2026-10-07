import 'server-only';
import { db } from './db';
import { ApiError } from './security';
import type { WorkspaceData, Block, ClassView, ExerciseId } from './types';
export async function workspaceData(userId: string): Promise<WorkspaceData> {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw new ApiError(401, 'Please sign in.');
  const studio = await db.studio.findFirst({
    where: { OR: [{ ownerId: userId }, { memberships: { some: { userId } } }] },
  });
  const [members, plans, classes, billing] = await Promise.all([
    studio && user.role === 'coach'
      ? db.membership.findMany({
          where: { studioId: studio.id },
          include: { user: true },
          orderBy: { createdAt: 'desc' },
        })
      : [],
    studio
      ? db.workoutPlan.findMany({ where: { studioId: studio.id }, orderBy: { createdAt: 'desc' } })
      : [],
    db.classSession.findMany({
      where:
        user.role === 'coach'
          ? { studio: { ownerId: userId } }
          : { enrollments: { some: { userId } } },
      include: {
        studio: { include: { owner: { select: { name: true } } } },
        enrollments: {
          include: { user: { select: { id: true, name: true } }, metric: true, summary: true },
        },
      },
      orderBy: { startsAt: 'desc' },
      take: 100,
    }),
    db.billingSubscription.findUnique({ where: { userId } }),
  ]);
  const classViews: ClassView[] = classes.map((c) => ({
    id: c.id,
    title: c.title,
    startsAt: c.startsAt.toISOString(),
    duration: c.duration,
    capacity: c.capacity,
    status: c.status,
    exercise: c.exercise as ExerciseId,
    revision: c.revision,
    paused: c.paused,
    startedAt: c.startedAt?.toISOString() ?? null,
    endedAt: c.endedAt?.toISOString() ?? null,
    coachId: c.studio.ownerId,
    coachName: c.studio.owner.name,
    planId: c.planId,
    workout: (plans.find((p) => p.id === c.planId)?.blocks ?? []) as unknown as Block[],
    participants: c.enrollments
      .filter((e) => user.role === 'coach' || e.userId === userId)
      .map((e) => ({
        id: e.userId,
        name: e.user.name,
        helpRequested: e.helpRequested,
        metric: e.metric
          ? {
              exercise: e.metric.exercise,
              revision: e.metric.revision,
              reps: e.metric.reps,
              holdSeconds: e.metric.holdSeconds,
              score: e.metric.score,
              confidence: e.metric.confidence,
              phase: e.metric.phase,
              cue: e.metric.cue,
              updatedAt: e.metric.updatedAt.toISOString(),
            }
          : null,
        summary: e.summary
          ? {
              totalReps: e.summary.totalReps,
              trackedSamples: e.summary.trackedSamples,
              scoreTotal: e.summary.scoreTotal,
            }
          : null,
      })),
  }));
  return {
    demo: false,
    user: { id: user.id, name: user.name, email: user.email, role: user.role, goal: user.goal },
    studio: studio ? { id: studio.id, name: studio.name } : null,
    clients: members.map((m) => ({
      id: m.userId,
      name: m.user.name,
      email: m.user.email,
      role: m.user.role,
      goal: m.user.goal,
      joinedAt: m.createdAt.toISOString(),
    })),
    plans: plans.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      blocks: p.blocks as unknown as Block[],
    })),
    classes: classViews,
    billing: billing?.status ?? 'inactive',
    services: {
      video: !!(
        process.env.LIVEKIT_URL &&
        process.env.LIVEKIT_API_KEY &&
        process.env.LIVEKIT_API_SECRET
      ),
      billing: !!(
        process.env.STRIPE_SECRET_KEY &&
        process.env.STRIPE_PRICE_ID &&
        process.env.STRIPE_WEBHOOK_SECRET
      ),
      email: !!process.env.RESEND_API_KEY,
    },
  };
}
