// AbortSignal.timeout/any are unavailable in older mobile Safari versions.
// Use the widely supported controller so requests still reach the server.
export function requestTimeout(ms: number, parent?: AbortSignal | null) {
  const controller = new AbortController();
  let timedOut = false;
  const cancel = () => controller.abort(parent?.reason);
  if (parent?.aborted) cancel();
  else parent?.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(() => {
    if (controller.signal.aborted) return;
    timedOut = true;
    controller.abort(new DOMException("Request timed out", "TimeoutError"));
  }, ms);
  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    dispose() {
      clearTimeout(timer);
      parent?.removeEventListener("abort", cancel);
    },
  };
}
