export type RuntimeDiagnosticChannel =
  | "scene"
  | "passenger"
  | "vehicle"
  | "door";

/**
 * Expensive DOM-published diagnostics are opt-in even in development.
 * `?mamDiagnostics=1` enables all channels; a comma-separated value enables
 * only the requested ones. Console hooks remain available independently.
 */
export function runtimeDiagnosticsEnabled(
  channel: RuntimeDiagnosticChannel,
): boolean {
  if (process.env.NODE_ENV === "production" || typeof window === "undefined") {
    return false;
  }
  const requested = new URLSearchParams(window.location.search).get(
    "mamDiagnostics",
  );
  if (!requested) {
    return false;
  }
  return requested === "1" || requested.split(",").some(
    (candidate) => candidate.trim() === channel,
  );
}
