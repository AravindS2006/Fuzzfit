'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="error-page">
      <h1>Let’s try that again.</h1>
      <p>We couldn’t load this page. Your saved data is still there.</p>
      <button className="button lime" onClick={reset}>
        Try again
      </button>
      <a href="/demo">Open sample studio</a>
    </main>
  );
}
