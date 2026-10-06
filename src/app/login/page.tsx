import { Suspense } from 'react';
import { connection } from 'next/server';
import { AuthForm } from '@/components/auth-form';
import { emailPolicy } from '@/lib/auth';
export default async function LoginPage() {
  await connection();
  return (
    <Suspense fallback={<div className="page-loading">Loading…</div>}>
      <AuthForm
        testingMode={emailPolicy.testingMode}
        signupEnabled={emailPolicy.signupEnabled}
        passwordResetEnabled={emailPolicy.passwordResetEnabled}
      />
    </Suspense>
  );
}
