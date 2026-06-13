// Local-only rate limit + dedupe for the keep notification.
// Per-device best-effort — cross-device limit drift is acceptable.

const NOTIFIED_KEY = 'pebble-pocket-notified-v1';
const RATE_KEY = 'pebble-pocket-notify-rate-v1';
const WINDOW_MS = 24 * 60 * 60 * 1000;
const PER_AUTHOR_CAP = 5;

function readNotified(): Set<string> {
  try {
    const raw = localStorage.getItem(NOTIFIED_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function writeNotified(s: Set<string>): void {
  try {
    localStorage.setItem(NOTIFIED_KEY, JSON.stringify(Array.from(s)));
  } catch {
    /* quota / private */
  }
}

function readRate(): Record<string, number[]> {
  try {
    const raw = localStorage.getItem(RATE_KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw);
    return obj && typeof obj === 'object' ? obj : {};
  } catch {
    return {};
  }
}

function writeRate(r: Record<string, number[]>): void {
  try {
    localStorage.setItem(RATE_KEY, JSON.stringify(r));
  } catch {
    /* quota */
  }
}

export function hasAlreadyNotified(dedupeKey: string): boolean {
  return readNotified().has(dedupeKey);
}

export function withinRateLimit(targetUserId: string): boolean {
  const r = readRate();
  const arr = r[targetUserId] || [];
  const now = Date.now();
  const fresh = arr.filter((t) => now - t < WINDOW_MS);
  return fresh.length < PER_AUTHOR_CAP;
}

export function recordNotify(targetUserId: string, dedupeKey: string): void {
  const notified = readNotified();
  notified.add(dedupeKey);
  writeNotified(notified);

  const r = readRate();
  const now = Date.now();
  const arr = (r[targetUserId] || []).filter((t) => now - t < WINDOW_MS);
  arr.push(now);
  r[targetUserId] = arr;
  writeRate(r);
}
