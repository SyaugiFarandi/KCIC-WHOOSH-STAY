const WINDOW_MS = 15 * 60_000;
const MAX_FAILURES = 5;
const BLOCK_MS = 15 * 60_000;
const MAX_TRACKED = 10_000;

type Entry = { failures: number; firstFailureAt: number; blockedUntil: number };

const entries = new Map<string, Entry>();

function prune(now: number): void {
  if (entries.size < MAX_TRACKED) return;
  for (const [key, entry] of entries) {
    if (entry.blockedUntil <= now && entry.firstFailureAt + WINDOW_MS <= now) entries.delete(key);
  }
}

export function loginRetryAfterSeconds(key: string): number | null {
  const now = Date.now();
  const entry = entries.get(key);
  if (!entry) return null;
  if (entry.blockedUntil > now) return Math.ceil((entry.blockedUntil - now) / 1000);
  if (entry.firstFailureAt + WINDOW_MS <= now) entries.delete(key);
  return null;
}

export function recordLoginFailure(key: string): void {
  const now = Date.now();
  const entry = entries.get(key);
  if (!entry || entry.firstFailureAt + WINDOW_MS <= now) {
    prune(now);
    entries.set(key, { failures: 1, firstFailureAt: now, blockedUntil: 0 });
    return;
  }
  entry.failures += 1;
  if (entry.failures >= MAX_FAILURES) entry.blockedUntil = now + BLOCK_MS;
}

export function recordLoginSuccess(key: string): void {
  entries.delete(key);
}
