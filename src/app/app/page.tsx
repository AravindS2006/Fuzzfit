import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/security';
import { workspaceData } from '@/lib/workspace';
import { Workspace } from '@/components/workspace';
export const dynamic = 'force-dynamic';
export default async function AppPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  let user;
  try {
    user = await requireUser();
  } catch {
    redirect('/login');
  }
  const query = await searchParams;
  return <Workspace initial={await workspaceData(user.id)} view={query.view || 'dashboard'} />;
}
