/**
 * Minimal structured logger — TanStack Start port of @/lib/logger.
 *
 * The main-repo logger lazy-loads @sentry/nextjs; that dependency isn't in the
 * Start app, so this is a slim console-based logger with the SAME call surface
 * (info/warn/error/debug + child) so consumers port unchanged.
 */
type Fields = Record<string, unknown>;

function emit(level: string, event: string, fields?: Fields) {
  const line = { level, event, ...fields, ts: new Date().toISOString() };
  const fn = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  fn(JSON.stringify(line));
}

export interface Logger {
  info(event: string, fields?: Fields): void;
  warn(event: string, fields?: Fields): void;
  debug(event: string, fields?: Fields): void;
  error(event: string, err?: unknown, fields?: Fields): void;
  child(bound: Fields): Logger;
}

function make(bound: Fields = {}): Logger {
  return {
    info: (event, fields) => emit("info", event, { ...bound, ...fields }),
    warn: (event, fields) => emit("warn", event, { ...bound, ...fields }),
    debug: (event, fields) => emit("debug", event, { ...bound, ...fields }),
    error: (event, err, fields) =>
      emit("error", event, {
        ...bound,
        ...fields,
        error: err instanceof Error ? { message: err.message, stack: err.stack } : err,
      }),
    child: (extra) => make({ ...bound, ...extra }),
  };
}

export const logger = make();
