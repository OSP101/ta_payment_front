export type RegSource = "new" | "legacy";

export interface RegSourceStatus {
  source: RegSource;
  available: boolean;
  state: "available" | "unavailable" | "limited" | "blocked" | "timeout" | "invalid_response" | "in_use";
  message: string;
  action: string;
  checked_at: string;
  retry_at?: string;
}

export interface RegSourcesResponse { sources: RegSourceStatus[] }
