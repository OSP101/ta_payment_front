import { isIP } from "node:net";

/**
 * Preserve nginx's canonical client address on server-rendered API requests.
 * The frontend must be reachable only through the trusted edge: nginx MUST
 * overwrite X-Real-IP, as proxy-frontend.conf does. This validates syntax; it
 * cannot authenticate the sender of an arbitrary incoming HTTP header.
 * Never pick the first element of a browser-supplied forwarding chain.
 * @param {string} cookieHeader
 * @param {{ get(name: string): string | null }} incoming
 * @returns {Headers}
 */
export function backendSessionHeaders(cookieHeader, incoming) {
  const outgoing = new Headers({ Cookie: cookieHeader });
  const ip = (incoming.get("x-real-ip") ?? "").trim();
  if (isIP(ip) && !ip.includes("%")) {
    outgoing.set("X-Real-IP", ip);
    outgoing.set("X-Forwarded-For", ip);
  }
  return outgoing;
}
