export async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...options, cache: 'no-store' });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'This request failed. Please retry.');
  return result as T;
}
export function apiCommand(data: unknown) {
  return fetchJson<Record<string, unknown>>('/api/command', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}
