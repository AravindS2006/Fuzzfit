'use client';
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
