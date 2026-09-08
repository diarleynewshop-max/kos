/**
 * Version comparison for the in-app updater.
 *
 * Kept free of Capacitor imports so it can be unit tested directly: a wrong
 * answer here either hides every update or offers one forever.
 */

export function parseVersion(value: string): number[] {
  return value
    .trim()
    .replace(/^v/i, '')
    .split('.')
    .map((part) => parseInt(part, 10) || 0);
}

export function isNewer(remote: string, local: string): boolean {
  const r = parseVersion(remote);
  const l = parseVersion(local);
  const len = Math.max(r.length, l.length);

  for (let i = 0; i < len; i += 1) {
    const rv = r[i] || 0;
    const lv = l[i] || 0;
    if (rv !== lv) return rv > lv;
  }

  return false;
}
