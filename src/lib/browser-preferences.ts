// Retain pre-rebrand settings and unsent set summaries on the same browser origin.
// Old keys remain available if browser storage cannot accept the migrated value.
const legacyPrefix = 'fuzzfit';
export function readBrowserPreference(key: string): string | null {
  const current = localStorage.getItem(key);
  if (current !== null) return current;
  const old = localStorage.getItem(key.replace(/^geez-squad/, legacyPrefix));
  if (old !== null) {
    try {
      localStorage.setItem(key, old);
    } catch {
      /* Keep the original copy. */
    }
  }
  return old;
}
