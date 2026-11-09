import test from "node:test";
import assert from "node:assert/strict";
import { backendSessionHeaders } from "../app/lib/backendSessionHeaders.mjs";

test("SSR API calls preserve the edge-selected client, not the forwarding chain", () => {
  const incoming = new Headers({
    "X-Real-IP": "192.0.2.42",
    "X-Forwarded-For": "203.0.113.99, 198.51.100.10",
    Authorization: "synthetic-unrelated-header",
  });
  const result = backendSessionHeaders("access_token=synthetic-session", incoming);
  assert.equal(result.get("X-Forwarded-For"), "192.0.2.42");
  assert.equal(result.get("X-Real-IP"), "192.0.2.42");
  assert.equal(result.get("Cookie"), "access_token=synthetic-session");
  assert.equal(result.get("Authorization"), null);
});

test("SSR does not invent a client address when the edge header is absent or malformed", () => {
  for (const value of ["", "unknown", "192.0.2.1, 203.0.113.2", "192.0.2.1:1234", "fe80::1%eth0", "999.1.1.1"]) {
    const result = backendSessionHeaders("access_token=synthetic-session", new Headers({ "X-Real-IP": value, "X-Forwarded-For": "203.0.113.99" }));
    assert.equal(result.get("X-Forwarded-For"), null);
    assert.equal(result.get("X-Real-IP"), null);
  }
});

test("SSR supports IPv6 and keeps concurrent request identities separate", () => {
  const one = backendSessionHeaders("access_token=one", new Headers({ "X-Real-IP": "2001:db8::42" }));
  const two = backendSessionHeaders("access_token=two", new Headers({ "X-Real-IP": "192.0.2.10" }));
  assert.equal(one.get("X-Forwarded-For"), "2001:db8::42");
  assert.equal(two.get("X-Forwarded-For"), "192.0.2.10");
  assert.equal(one.get("Cookie"), "access_token=one");
});
