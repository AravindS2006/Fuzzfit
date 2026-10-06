import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireUser, safeError, rateLimit } from '@/lib/security';
export async function GET() {
  try {
    const user = await requireUser();
    await rateLimit(user.id, 'export', 3);
    const enrollments = await db.enrollment.findMany({
      where: { userId: user.id },
      include: { summary: true, class: { select: { title: true, startsAt: true, status: true } } },
    });
    const memberships = await db.membership.findMany({
      where: { userId: user.id },
      select: { createdAt: true, studio: { select: { name: true } } },
    });
    return NextResponse.json(
      {
        exportedAt: new Date().toISOString(),
        profile: {
          name: user.name,
          email: user.email,
          goal: user.goal,
          role: user.role,
          createdAt: user.createdAt,
        },
        memberships,
        workouts: enrollments.map((e) => ({
          class: e.class,
          consentAt: e.consentAt,
          summary: e.summary,
        })),
      },
      {
        headers: {
          'Content-Disposition': 'attachment; filename="fuzzfit-data.json"',
          'Cache-Control': 'private, no-store',
        },
      },
    );
  } catch (error) {
    return safeError(error);
  }
}
