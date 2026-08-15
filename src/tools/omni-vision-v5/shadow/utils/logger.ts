/**
 * Structured Logger — Minimal, dependency-free.
 *
 * Every line is written to stderr (via console.error) to avoid stdout
 * pollution. Lines are prefixed with an ISO timestamp, the [HIVE] tag,
 * the calling namespace, and the level.
 *
 * Export names (tiLog, tiWarn, tiError) match the audit scanner's
 * recognized logging identifiers so catch blocks are properly detected.
 */

type LogLevel = 'INFO' | 'WARN' | 'ERROR';

function pad(value: unknown): string {
  return String(value ?? '');
}

function log(
  level: LogLevel,
  namespace: string,
  message: string,
  data?: Record<string, unknown>,
): void {
  const timestamp = new Date().toISOString();
  let line = `${timestamp} [HIVE] ${pad(namespace)} [${level}] ${pad(message)}`;
  if (data !== undefined) {
    line += ` ${JSON.stringify(data)}`;
  }
  console.error(line);
}

export function tiLog(
  namespace: string,
  message: string,
  data?: Record<string, unknown>,
): void {
  log('INFO', namespace, message, data);
}

export function tiWarn(
  namespace: string,
  message: string,
  data?: Record<string, unknown>,
): void {
  log('WARN', namespace, message, data);
}

export function tiError(
  namespace: string,
  message: string,
  data?: Record<string, unknown>,
): void {
  log('ERROR', namespace, message, data);
}
