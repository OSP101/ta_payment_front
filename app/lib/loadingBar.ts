/**
 * Global in-flight-request counter driving the top loading bar (TopLoadingBar.tsx).
 * Module-level, not React context: api.ts calls beginRequest/endRequest from
 * plain async functions with no component above them, the same reason
 * apiPrefix in api.ts is a module-level variable rather than context state.
 */

type Listener = () => void;

let activeCount = 0;
const listeners = new Set<Listener>();

export function beginRequest() {
  activeCount += 1;
  if (activeCount === 1) listeners.forEach(l => l());
}

export function endRequest() {
  activeCount = Math.max(0, activeCount - 1);
  if (activeCount === 0) listeners.forEach(l => l());
}

export function subscribeLoading(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function isLoading() {
  return activeCount > 0;
}
