// Captures the original Error out-of-band so server.ts can recover the stack
// when h3 has already swallowed the throw into a generic 500 Response.
//
// [Bug 4.3] A single module-level `lastCapturedError` was shared across
// ALL concurrent requests on the process — one request's captured error
// could be consumed (and logged as the cause) by an unrelated request's
// error page within the 5s TTL. Captures now accumulate in a small
// timestamped ring buffer and the consumer DRAINS everything recent,
// logging every candidate instead of guessing which one belongs to
// which request.

interface CapturedError {
  error: unknown;
  at: number;
}

const CAPTURE_BUFFER_MAX = 20;
const TTL_MS = 5_000;

let captured: CapturedError[] = [];

function record(error: unknown) {
  captured.push({ error, at: Date.now() });
  if (captured.length > CAPTURE_BUFFER_MAX) {
    captured = captured.slice(-CAPTURE_BUFFER_MAX);
  }
}

if (typeof globalThis.addEventListener === "function") {
  globalThis.addEventListener("error", (event) => record((event as ErrorEvent).error ?? event));
  globalThis.addEventListener("unhandledrejection", (event) =>
    record((event as PromiseRejectionEvent).reason),
  );
}

/**
 * Returns and clears every capture inside the TTL window. The caller
 * logs ALL of them — attribution to a specific request is impossible
 * by design, so none is silently mis-credited.
 */
export function drainRecentCapturedErrors(): unknown[] {
  const now = Date.now();
  const fresh = captured.filter((c) => now - c.at <= TTL_MS);
  captured = [];
  return fresh.map((c) => c.error);
}
