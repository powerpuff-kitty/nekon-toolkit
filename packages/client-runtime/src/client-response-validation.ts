export function isRequestId(value: unknown): value is string {
  return (
    typeof value === "string" && /^req_[A-Za-z0-9_-]{16,128}$/u.test(value)
  );
}

export function isPrefixedOpaqueId(
  value: unknown,
  prefix: string,
): value is string {
  return (
    typeof value === "string" &&
    value.startsWith(prefix) &&
    value.length <= 128 &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(value)
  );
}

export function isSafeUnsigned(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

export function isSafeUnsignedDecimal(value: string): boolean {
  if (!/^(0|[1-9][0-9]*)$/u.test(value)) return false;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0;
}

export function isIdentityId(value: unknown): value is string {
  return typeof value === "string" && /^id_[A-Za-z0-9_-]{16,128}$/u.test(value);
}

export function isDeviceId(value: unknown): value is string {
  return (
    typeof value === "string" && /^dev_[A-Za-z0-9_-]{16,128}$/u.test(value)
  );
}

export function isRoomId(value: unknown): value is string {
  return (
    typeof value === "string" && /^room_[A-Za-z0-9_-]{16,128}$/u.test(value)
  );
}

export function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const keys = Object.keys(value);
  return (
    keys.length === expected.length &&
    keys.every((key) => expected.includes(key))
  );
}

export function isWebAuthnOptions(
  value: unknown,
  kind: "registration" | "authentication",
): boolean {
  if (
    !isRecord(value) ||
    !isBase64UrlText(value.challenge) ||
    (kind === "registration"
      ? !("user" in value) || !("rp" in value)
      : !("allowCredentials" in value) || !("rpId" in value))
  )
    return false;
  try {
    return (
      new TextEncoder().encode(JSON.stringify(value)).byteLength <= 64 * 1024
    );
  } catch {
    return false;
  }
}

export function isBase64UrlText(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 16 &&
    value.length <= 8192 &&
    /^[A-Za-z0-9_-]+$/u.test(value)
  );
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
