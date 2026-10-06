'use client';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Brand } from './ui';
import { Studio } from './studio';
import type { ClassView, WorkspaceData } from '@/lib/types';
export function StudioPage({
  item,
  user,
  services,
}: {
  item: ClassView;
  user: WorkspaceData['user'];
  services: WorkspaceData['services'];
}) {
  return (
    <main className="standalone-studio">
      <header>
        <Link href="/app">
          <Brand />
        </Link>
        <Link href="/app?view=sessions" className="text-link">
          <ArrowLeft size={16} /> Back to workspace
        </Link>
      </header>
      <Studio
        initialClass={item}
        user={user}
        services={services}
        demo={false}
        onExit={() => {
          window.location.href = '/app?view=sessions';
        }}
      />
    </main>
  );
}
