/**
 * THE BLIND-SLEEP PREDICATE (2026-08-26 — the sleep guard's c1): the LONGEST
 * `sleep N` in a bash command, in seconds; null when none. Handles bare +
 * compound forms (sleep 300; echo hi && sleep 60) + suffixes (sleep 5m / 2h).
 * Pure + exported for unit testing — the guard itself lives in trident-hooks.
 */
export function blindSleepSeconds(command: string): number | null {
  if (!command) return null;
  let worst: number | null = null;
  const re = /\bsleep\s+([0-9]+(?:\.[0-9]+)?)(ms|s|m|h|d)?\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(command)) !== null) {
    const n = parseFloat(m[1]);
    if (!Number.isFinite(n)) continue;
    const suf = (m[2] ?? 's').toLowerCase();
    const secs = suf === 'ms' ? n / 1000 : suf === 's' ? n : suf === 'm' ? n * 60 : suf === 'h' ? n * 3600 : n * 86400;
    if (worst === null || secs > worst) worst = secs;
  }
  return worst;
}
