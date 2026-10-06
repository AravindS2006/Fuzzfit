import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/security';
import { InviteAccept } from '@/components/invite-accept';
export default async function InvitePage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  let user;
  try {
    user = await requireUser();
  } catch {
    redirect(`/login?invite=${encodeURIComponent(code || '')}`);
  }
  if (user.role === 'unset') redirect(`/app?view=setup&invite=${encodeURIComponent(code || '')}`);
  return <InviteAccept code={code || ''} />;
}
