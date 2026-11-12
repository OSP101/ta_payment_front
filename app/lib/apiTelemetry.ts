import * as Sentry from "@sentry/nextjs";

export interface DiagnosticReference { requestId?: string; traceId?: string; edgeRequestId?: string }

export function responseReference(headers: Headers): DiagnosticReference {
  const read = (key: string, pattern: RegExp) => {
    const value = headers.get(key) ?? "";
    return pattern.test(value) ? value : undefined;
  };
  return {
    requestId: read("x-request-id", /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
    traceId: read("x-trace-id", /^[0-9a-f]{32}$/i),
    edgeRequestId: read("x-edge-request-id", /^[0-9a-f]{32}$/i),
  };
}

export function diagnosticPath(input: string): string {
  const path = input.split(/[?#]/, 1)[0];
  if (/\/(?:public|p)\//.test(path)) return "/public/[redacted]";
  return path.replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi, ":id").replace(/\/\d+(?=\/|$)/g, "/:n").slice(0, 256);
}

// Only selected transport metadata leaves the browser. Never error bodies,
// query strings, form values, cookies, or the native fetch exception message.
export function recordAPI(input: string, method: string, started: number, response?: Response, failure?: unknown): void {
  if (typeof window === "undefined" || !Sentry.isInitialized()) return;
  if (failure instanceof Error && failure.name === "AbortError") return;
  const path = diagnosticPath(input);
  const reference = response ? responseReference(response.headers) : {};
  const status = response?.status ?? 0;
  const kind = failure instanceof Error && failure.name === "TimeoutError" ? "timeout" : response ? "http" : "network";
  const tags = { route: path, method: method.toUpperCase(), status: String(status), failure_kind: kind,
    request_id: reference.requestId, trace_id: reference.traceId, edge_request_id: reference.edgeRequestId };
  Sentry.addBreadcrumb({ category: "api", level: status >= 500 || failure ? "error" : "info", message: `${method.toUpperCase()} ${path}`, data: { ...tags, duration_ms: Math.max(0, Math.round(performance.now() - started)) } });
  if (status >= 500 || failure) {
    Sentry.captureMessage("API request failed", { level: "error", tags, fingerprint: ["api-transport", method.toUpperCase(), path, String(status), kind] });
  }
}
