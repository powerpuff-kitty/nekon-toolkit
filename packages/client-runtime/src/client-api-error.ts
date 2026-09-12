export class NekonHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly retryAfterSeconds?: number,
    readonly currentEpoch?: number,
  ) {
    super(`nekon_http_error:${status}:${code}`);
    this.name = "NekonHttpError";
  }
}

export async function readNekonHttpError(
  response: Response,
): Promise<NekonHttpError> {
  let code = "request_failed";
  let currentEpoch: number | undefined;
  const retryAfterHeader = response.headers.get("Retry-After");
  const retryAfterSeconds =
    retryAfterHeader !== null && /^\d{1,4}$/u.test(retryAfterHeader)
      ? Number(retryAfterHeader)
      : undefined;
  try {
    const value = await response.json();
    if (
      isRecord(value) &&
      typeof value.error === "string" &&
      /^[a-z][a-z0-9_]{0,127}$/u.test(value.error)
    ) {
      code = value.error;
    }
    if (isRecord(value) && typeof value.currentEpoch === "string") {
      currentEpoch = parseSafeUnsignedDecimal(value.currentEpoch);
    }
  } catch {
    // Keep the bounded generic code for a malformed or non-JSON error body.
  }
  return new NekonHttpError(
    response.status,
    code,
    retryAfterSeconds !== undefined && retryAfterSeconds <= 3600
      ? retryAfterSeconds
      : undefined,
    currentEpoch,
  );
}

function parseSafeUnsignedDecimal(value: string): number | undefined {
  if (!/^(?:0|[1-9][0-9]*)$/u.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
