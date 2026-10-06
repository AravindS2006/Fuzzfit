import { NextResponse } from 'next/server';
import { requireUser, safeError } from '@/lib/security';
import { workspaceData } from '@/lib/workspace';
export async function GET() {
  try {
    const user = await requireUser();
    return NextResponse.json(await workspaceData(user.id), {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    return safeError(error);
  }
}
