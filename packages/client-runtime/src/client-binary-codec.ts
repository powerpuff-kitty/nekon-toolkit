export function requireClientBytes(
  value: Uint8Array,
  maximum: number,
  minimum = 1,
): void {
  if (
    !(value instanceof Uint8Array) ||
    value.byteLength < minimum ||
    value.byteLength > maximum
  )
    throw new Error("invalid_room_admission_material");
}

export function decodeBase64Url(value: string): Uint8Array {
  return decodeBase64UrlBounded(value, 257 * 1024);
}

export function decodeBase64UrlBounded(
  value: string,
  maximum: number,
  minimum = 1,
): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/u.test(value))
    throw new Error("invalid_base64url_value");
  const padding = (4 - (value.length % 4)) % 4;
  const binary = atob(
    value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat(padding),
  );
  if (binary.length < minimum || binary.length > maximum)
    throw new Error("invalid_base64url_value");
  const decoded = Uint8Array.from(binary, (character) =>
    character.charCodeAt(0),
  );
  if (encodeBase64Url(decoded) !== value)
    throw new Error("invalid_base64url_value");
  return decoded;
}

export function encodeBase64Url(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

export function toArrayBuffer(value: Uint8Array): ArrayBuffer {
  const output = new ArrayBuffer(value.byteLength);
  new Uint8Array(output).set(value);
  return output;
}
