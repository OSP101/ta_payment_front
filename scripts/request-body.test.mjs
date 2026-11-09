import test from "node:test";
import assert from "node:assert/strict";
import { readLimitedText } from "../app/lib/boundedBody.mjs";
const enc = new TextEncoder();
function stream(parts, onCancel = () => {}) {
  return new ReadableStream({ start(c) { for (const p of parts) c.enqueue(p); c.close(); }, cancel: onCancel });
}
test("chunked UTF-8 limit counts bytes rather than characters", async () => {
  const b = enc.encode("ภาษาไทย");
  assert.equal(await readLimitedText(stream([b.subarray(0, 2), b.subarray(2)]), b.length), "ภาษาไทย");
  await assert.rejects(readLimitedText(stream([b]), b.length - 1), e => e.status === 413);
});
test("rejects oversized streams before buffering subsequent chunks", async () => {
  let reads = 0, cancelled = false;
  const s = new ReadableStream({ pull(c) { reads++; c.enqueue(new Uint8Array(16)); }, cancel() { cancelled = true; } });
  await assert.rejects(readLimitedText(s, 32), e => e.status === 413);
  assert.ok(cancelled); assert.ok(reads <= 4);
});
test("invalid UTF-8 and stalled uploads are rejected", async () => {
  await assert.rejects(readLimitedText(stream([new Uint8Array([255])]), 32), e => e.status === 400);
  await assert.rejects(readLimitedText(new ReadableStream({}), 32, 10), e => e.status === 408);
  assert.equal(await readLimitedText(null, 0), "");
});
