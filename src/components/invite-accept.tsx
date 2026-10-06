'use client';
import { useState } from 'react';
import { Brand } from './ui';
import { apiCommand } from '@/lib/client';
export function InviteAccept({ code }: { code: string }) {
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <main className="invite-page">
      <Brand />
      <div className="panel">
        <span className="eyebrow">YOUR STUDIO IS WAITING</span>
        <h1>Let’s move together.</h1>
        <p>
          Accept this invitation with the email address your coach invited. This gives your coach
          access to your class summaries.
        </p>
        <button
          className="button lime"
          disabled={busy || !code}
          onClick={async () => {
            setBusy(true);
            try {
              await apiCommand({ action: 'acceptInvite', code });
              window.location.href = '/app';
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Please retry.');
              setBusy(false);
            }
          }}
        >
          Join studio
        </button>
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        <a href="/app">Back to my account</a>
      </div>
    </main>
  );
}
