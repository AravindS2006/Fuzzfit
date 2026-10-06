import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireUser, requireClass, safeError } from '@/lib/security';
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const item = await requireClass(id, user.id);
    const coach = item.studio.ownerId === user.id;
    const messages = await db.message.findMany({
      where: {
        classId: id,
        OR: [{ recipientId: null }, { recipientId: user.id }, { senderId: user.id }],
      },
      include: { sender: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 80,
    });
    return NextResponse.json(
      {
        status: item.status,
        exercise: item.exercise,
        revision: item.revision,
        paused: item.paused,
        startedAt: item.startedAt,
        participants: item.enrollments
          .filter((e) => coach || e.userId === user.id)
          .map((e) => ({
            id: e.userId,
            name: e.user.name,
            helpRequested: e.helpRequested,
            metric: e.metric,
          })),
        messages: messages.reverse().map((m) => ({
          id: m.id,
          senderId: m.senderId,
          senderName: m.sender.name,
          recipientId: m.recipientId,
          text: m.text,
          kind: m.kind,
          createdAt: m.createdAt,
        })),
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    return safeError(error);
  }
}
