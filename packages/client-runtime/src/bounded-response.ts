/** Count bytes on the stream itself so every standard Response consumer shares the limit. */
export function boundedResponse(
  response: Response,
  signal: AbortSignal,
  maximumBytes: number,
  cleanup: () => void,
): Response {
  if (response.body === null) {
    cleanup();
    return response;
  }
  const reader = response.body.getReader();
  let settled = false;
  let total = 0;
  let controller: ReadableStreamDefaultController<Uint8Array>;

  const finish = (): boolean => {
    if (settled) return false;
    settled = true;
    signal.removeEventListener("abort", abort);
    cleanup();
    return true;
  };
  const release = (): void => {
    try { reader.releaseLock(); } catch { /* A pending read releases after cancellation. */ }
  };
  const cancelReader = (reason: unknown): void => {
    void reader.cancel(reason).catch(() => undefined).finally(release);
  };
  const fail = (reason: unknown): void => {
    if (!finish()) return;
    controller.error(reason);
    cancelReader(reason);
  };
  const abort = (): void => fail(
    signal.reason ?? new DOMException("Request aborted", "AbortError"),
  );

  const body = new ReadableStream<Uint8Array>({
    start(value) {
      controller = value;
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
    },
    async pull(value) {
      if (settled) return;
      try {
        const chunk = await reader.read();
        if (settled) return;
        if (chunk.done) {
          if (finish()) value.close();
          release();
          return;
        }
        total += chunk.value.byteLength;
        if (total > maximumBytes) {
          fail(new Error("response_body_too_large"));
          return;
        }
        value.enqueue(chunk.value);
      } catch (error) {
        fail(error);
      }
    },
    cancel(reason) {
      if (finish()) cancelReader(reason);
    },
  }, { highWaterMark: 0 });

  try {
    const wrapped = new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
    return withMetadata(wrapped, response);
  } catch (error) {
    fail(error);
    throw error;
  }
}

function withMetadata(bounded: Response, original: Response): Response {
  return new Proxy(bounded, {
    get(target, property) {
      if (property === "url") return original.url;
      if (property === "redirected") return original.redirected;
      if (property === "type") return original.type;
      if (property === "clone") return () => withMetadata(target.clone(), original);
      const value: unknown = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

export function rejectDeclaredOversize(response: Response, maximumBytes: number): void {
  const rawLength = response.headers.get("content-length");
  if (rawLength === null || !/^\d+$/.test(rawLength)) return;
  const length = Number(rawLength);
  if (length <= maximumBytes) return;
  // The streaming check remains authoritative when the server omits or lies about length.
  void response.body?.cancel().catch(() => undefined);
  throw new Error("response_body_too_large");
}
