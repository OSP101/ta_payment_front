/** Error with an HTTP status; messages contain no request data. */
export class BodyReadError extends Error {
  /** @param {number} status */
  constructor(status) { super("Request body rejected"); this.status = status; }
}

/** Read at most maxBytes of UTF-8, including chunked requests without a length.
 * @param {ReadableStream<Uint8Array> | null} body
 * @param {number} maxBytes
 * @param {number} timeoutMs
 * @returns {Promise<string>}
 */
export async function readLimitedText(body, maxBytes, timeoutMs = 10000) {
  if (!body) return "";
  const reader = body.getReader();
  const chunks = [];
  let size = 0;
  let expired = false;
  const timer = setTimeout(() => { expired = true; void reader.cancel().catch(() => {}); }, timeoutMs);
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (expired) throw new BodyReadError(408);
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        void reader.cancel().catch(() => {});
        throw new BodyReadError(413);
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
    catch { throw new BodyReadError(400); }
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
}
