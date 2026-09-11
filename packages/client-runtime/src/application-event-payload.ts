const PROTOCOL_VERSION = 1;
const APPLICATION_EVENT_FIELDS = 10;
const APPLICATION_EVENT_KIND = "event";
const ROOM_ID = /^room_[A-Za-z0-9_-]{16,128}$/u;
const EVENT_ID = /^evt_[A-Za-z0-9_-]{16,128}$/u;
const EVENT_TYPE = /^[a-z][a-z0-9-]{0,62}(?:\.[a-z][a-z0-9-]{0,62}){2,7}$/u;
const CONTENT_TYPE = /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/u;
const RELATION_KINDS = new Set(["reply", "thread", "replace", "reaction"]);

export const NEKON_APPLICATION_EVENT_SCHEMA = "nekon.application-event/1";
export const V1_APPLICATION_EVENT_POLICY = Object.freeze({
  maximumTypeBytes: 255,
  maximumContentTypeBytes: 127,
  maximumContentBytes: 48 * 1024,
  maximumPayloadBytes: 64 * 1024,
});

export type ApplicationEventRelationKind =
  "reply" | "thread" | "replace" | "reaction";

export interface ApplicationEventPayloadInput {
  readonly roomId: string;
  readonly eventId: string;
  readonly type: string;
  readonly schemaVersion: number;
  readonly contentType: string;
  readonly content: Uint8Array;
  readonly relation?: {
    readonly kind: ApplicationEventRelationKind;
    readonly eventId: string;
  };
}

export type ApplicationEventPayloadFields = ApplicationEventPayloadInput;

export function encodeApplicationEventPayload(
  input: ApplicationEventPayloadInput,
): Uint8Array {
  validateApplicationEvent(input);
  const encoder = new CanonicalCborEncoder();
  encoder.array(APPLICATION_EVENT_FIELDS);
  encoder.unsigned(PROTOCOL_VERSION);
  encoder.text(APPLICATION_EVENT_KIND);
  encoder.text(input.roomId);
  encoder.text(input.eventId);
  encoder.text(input.type);
  encoder.unsigned(input.schemaVersion);
  encoder.text(input.contentType);
  encoder.bytes(input.content);
  encoder.nullableText(input.relation?.kind);
  encoder.nullableText(input.relation?.eventId);
  const encoded = encoder.finish();
  if (encoded.byteLength > V1_APPLICATION_EVENT_POLICY.maximumPayloadBytes) {
    encoded.fill(0);
    throw new Error("invalid_application_event_payload");
  }
  return encoded;
}

export function inspectApplicationEventPayload(
  encoded: Uint8Array,
): ApplicationEventPayloadFields {
  requireBytes(encoded, 1, V1_APPLICATION_EVENT_POLICY.maximumPayloadBytes);
  const decoder = new CanonicalCborDecoder(encoded);
  if (decoder.array() !== APPLICATION_EVENT_FIELDS) invalidPayload();
  if (decoder.unsigned() !== PROTOCOL_VERSION) invalidPayload();
  if (decoder.text(16) !== APPLICATION_EVENT_KIND) invalidPayload();
  const roomId = decoder.text(134);
  const eventId = decoder.text(133);
  const type = decoder.text(V1_APPLICATION_EVENT_POLICY.maximumTypeBytes);
  const schemaVersion = decoder.unsigned();
  const contentType = decoder.text(
    V1_APPLICATION_EVENT_POLICY.maximumContentTypeBytes,
  );
  const content = decoder.bytes(
    V1_APPLICATION_EVENT_POLICY.maximumContentBytes,
  );
  const relationKind = decoder.nullableText(16);
  const relationEventId = decoder.nullableText(133);
  if (
    !decoder.done ||
    (relationKind === undefined) !== (relationEventId === undefined)
  ) {
    content.fill(0);
    invalidPayload();
  }
  const fields: ApplicationEventPayloadFields = {
    roomId,
    eventId,
    type,
    schemaVersion,
    contentType,
    content,
    ...(relationKind === undefined || relationEventId === undefined
      ? {}
      : {
          relation: {
            kind: relationKind as ApplicationEventRelationKind,
            eventId: relationEventId,
          },
        }),
  };
  try {
    validateApplicationEvent(fields);
    const canonical = encodeApplicationEventPayload(fields);
    try {
      if (!constantTimeEqual(canonical, encoded)) invalidPayload();
    } finally {
      canonical.fill(0);
    }
    return fields;
  } catch (error) {
    content.fill(0);
    throw error;
  }
}

export function clearApplicationEventPayload(
  payload: Pick<ApplicationEventPayloadFields, "content">,
): void {
  payload.content.fill(0);
}

function validateApplicationEvent(input: ApplicationEventPayloadInput): void {
  const typeBytes = new TextEncoder().encode(input.type).byteLength;
  const contentTypeBytes = new TextEncoder().encode(
    input.contentType,
  ).byteLength;
  if (
    !ROOM_ID.test(input.roomId) ||
    !EVENT_ID.test(input.eventId) ||
    !EVENT_TYPE.test(input.type) ||
    typeBytes > V1_APPLICATION_EVENT_POLICY.maximumTypeBytes ||
    !Number.isSafeInteger(input.schemaVersion) ||
    input.schemaVersion < 1 ||
    input.schemaVersion > 65_535 ||
    !CONTENT_TYPE.test(input.contentType) ||
    contentTypeBytes > V1_APPLICATION_EVENT_POLICY.maximumContentTypeBytes ||
    !(input.content instanceof Uint8Array) ||
    input.content.byteLength > V1_APPLICATION_EVENT_POLICY.maximumContentBytes
  ) {
    invalidPayload();
  }
  if (
    input.relation !== undefined &&
    (!RELATION_KINDS.has(input.relation.kind) ||
      !EVENT_ID.test(input.relation.eventId) ||
      input.relation.eventId === input.eventId)
  ) {
    throw new Error("invalid_application_event_relation");
  }
}

class CanonicalCborEncoder {
  readonly #bytes: number[] = [];

  array(length: number): void {
    this.#head(4, length);
  }

  unsigned(value: number): void {
    this.#head(0, value);
  }

  text(value: string): void {
    const encoded = new TextEncoder().encode(value);
    this.#head(3, encoded.byteLength);
    this.#append(encoded);
  }

  bytes(value: Uint8Array): void {
    this.#head(2, value.byteLength);
    this.#append(value);
  }

  nullableText(value: string | undefined): void {
    if (value === undefined) this.#bytes.push(0xf6);
    else this.text(value);
  }

  finish(): Uint8Array {
    const encoded = Uint8Array.from(this.#bytes);
    this.#bytes.fill(0);
    return encoded;
  }

  #head(major: number, value: number): void {
    if (!Number.isSafeInteger(value) || value < 0 || value > 65_535) {
      invalidPayload();
    }
    const prefix = major << 5;
    if (value < 24) this.#bytes.push(prefix | value);
    else if (value <= 0xff) this.#bytes.push(prefix | 24, value);
    else this.#bytes.push(prefix | 25, value >>> 8, value & 0xff);
  }

  #append(value: Uint8Array): void {
    for (const byte of value) this.#bytes.push(byte);
  }
}

class CanonicalCborDecoder {
  readonly #input: Uint8Array;
  #offset = 0;

  constructor(input: Uint8Array) {
    this.#input = input;
  }

  get done(): boolean {
    return this.#offset === this.#input.byteLength;
  }

  array(): number {
    return this.#length(4);
  }

  unsigned(): number {
    return this.#length(0);
  }

  text(maximum: number): string {
    const bytes = this.#take(this.#boundedLength(3, maximum));
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      invalidPayload();
    }
  }

  bytes(maximum: number): Uint8Array {
    return Uint8Array.from(this.#take(this.#boundedLength(2, maximum)));
  }

  nullableText(maximum: number): string | undefined {
    if (this.#input[this.#offset] === 0xf6) {
      this.#offset += 1;
      return undefined;
    }
    return this.text(maximum);
  }

  #boundedLength(major: number, maximum: number): number {
    const value = this.#length(major);
    if (value > maximum) invalidPayload();
    return value;
  }

  #length(expectedMajor: number): number {
    const head = this.#input[this.#offset];
    if (head === undefined || head >>> 5 !== expectedMajor) invalidPayload();
    this.#offset += 1;
    const additional = head & 0x1f;
    if (additional < 24) return additional;
    if (additional === 24) {
      const value = this.#byte();
      if (value < 24) invalidPayload();
      return value;
    }
    if (additional === 25) {
      const value = (this.#byte() << 8) | this.#byte();
      if (value <= 0xff) invalidPayload();
      return value;
    }
    invalidPayload();
  }

  #byte(): number {
    const value = this.#input[this.#offset];
    if (value === undefined) invalidPayload();
    this.#offset += 1;
    return value;
  }

  #take(length: number): Uint8Array {
    const end = this.#offset + length;
    if (end > this.#input.byteLength) invalidPayload();
    const value = this.#input.subarray(this.#offset, end);
    this.#offset = end;
    return value;
  }
}

function requireBytes(
  value: Uint8Array,
  minimum: number,
  maximum: number,
): void {
  if (
    !(value instanceof Uint8Array) ||
    value.byteLength < minimum ||
    value.byteLength > maximum
  ) {
    invalidPayload();
  }
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  let difference = 0;
  for (let index = 0; index < left.byteLength; index += 1) {
    difference |= left[index]! ^ right[index]!;
  }
  return difference === 0;
}

function invalidPayload(): never {
  throw new Error("invalid_application_event_payload");
}
