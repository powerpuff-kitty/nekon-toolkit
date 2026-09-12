/** Local UI adapter. All canonical encoding/inspection is delegated to the SDK. */
export const SYNTHETIC_SCOPE = Object.freeze({
  roomId: 'room_0123456789abcdef', eventId: 'evt_0123456789abcdef',
});
export const SAMPLES = Object.freeze({
  message: Object.freeze({ type: 'com.example.chat.message', contentType: 'text/plain',
    content: 'Hello from your own interface.' }),
  telemetry: Object.freeze({ type: 'com.example.sensor.reading', contentType: 'application/json',
    content: '{\n  "sensor": "demo-thermostat",\n  "temperature": 21.5,\n  "unit": "C"\n}' }),
  command: Object.freeze({ type: 'com.example.device.command', contentType: 'application/json',
    content: '{\n  "device": "demo-thermostat",\n  "action": "setTemperature",\n  "value": 21\n}' }),
});

const fail = code => { throw new Error(code); };
const textEncoder = new TextEncoder();
const prettyHex = bytes => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join(' ');

export function createWorkbench(sdk) {
  const { maximumContentBytes, maximumPayloadBytes } = sdk.V1_APPLICATION_EVENT_POLICY;
  const maximumHexCharacters = maximumPayloadBytes * 3;
  // UI-specific limits do not change the underlying protocol policy.
  const text = (value, max) => {
    if (typeof value !== 'string' || value.length > max) fail('invalid_input');
    return value;
  };
  const inspectBytes = bytes => {
    let fields;
    try {
      fields = sdk.inspectApplicationEventPayload(bytes);
      let content;
      let representation = 'UTF-8 text';
      try { content = new TextDecoder('utf-8', { fatal: true }).decode(fields.content); }
      catch { content = prettyHex(fields.content); representation = 'Binary (hex)'; }
      // Display only known fields as inert text. No application command is executed.
      return Object.freeze({
        encodedBytes: bytes.byteLength, contentBytes: fields.content.byteLength,
        hex: prettyHex(bytes), content, representation,
        metadata: JSON.stringify({
          schema: sdk.NEKON_APPLICATION_EVENT_SCHEMA,
          roomId: fields.roomId, eventId: fields.eventId, type: fields.type,
          schemaVersion: fields.schemaVersion, contentType: fields.contentType,
          ...(fields.relation === undefined ? {} : { relation: fields.relation }),
        }, null, 2),
      });
    } finally {
      if (fields) sdk.clearApplicationEventPayload(fields);
    }
  };
  return Object.freeze({
    maximumContentBytes, maximumHexCharacters,
    encode(form) {
      let content;
      let encoded;
      try {
        // Bound strings before UTF-8 allocation; the byte bound is checked again.
        const input = text(form.content, maximumContentBytes);
        content = textEncoder.encode(input);
        if (content.length > maximumContentBytes) fail('content_too_large');
        const schema = text(form.schemaVersion, 5);
        if (!/^[1-9][0-9]{0,4}$/.test(schema) || Number(schema) > 65_535) fail('invalid_schema_version');
        const contentType = text(form.contentType, 127);
        if (contentType !== 'text/plain' && contentType !== 'application/json') fail('unsupported_preview_content_type');
        if (contentType === 'application/json') {
          try { JSON.parse(input); } catch { fail('invalid_json'); }
          // Parsing checks syntax only; JSON is neither normalized nor executed.
        }
        encoded = sdk.encodeApplicationEventPayload({
          roomId: text(form.roomId, 133), eventId: text(form.eventId, 132),
          type: text(form.type, 255), schemaVersion: Number(schema), contentType, content,
        });
        return inspectBytes(encoded);
      } finally { content?.fill(0); encoded?.fill(0); }
    },
    inspectHex(input) {
      text(input, maximumHexCharacters);
      // A strict two-digit hex representation; never eval or permissive parsing.
      const compact = input.replace(/[\t\n\r ]/g, '');
      if (!compact.length || compact.length % 2 || compact.length > maximumPayloadBytes * 2 ||
          !/^[0-9a-f]+$/i.test(compact)) fail('invalid_hex');
      const bytes = Uint8Array.from(compact.match(/../g), pair => Number.parseInt(pair, 16));
      try { return inspectBytes(bytes); } finally { bytes.fill(0); }
    },
  });
}

const MESSAGES = Object.freeze({
  invalid_input: 'Check the input lengths and required text fields.',
  content_too_large: 'Content exceeds the 48 KiB UTF-8 limit.',
  invalid_schema_version: 'Schema version must be a whole number from 1 to 65535.',
  invalid_json: 'The content is not valid JSON. It has not been encoded.',
  invalid_hex: 'Use complete hexadecimal byte pairs, with optional spaces or line breaks.',
  unsupported_preview_content_type: 'The composer supports plain text and JSON only.',
  invalid_application_event_payload: 'The SDK rejected this event. Check IDs, namespace, size and canonical payload format.',
  invalid_application_event_relation: 'The SDK rejected the event relation.',
});
export function describeError(error) {
  return error instanceof Error && Object.hasOwn(MESSAGES, error.message)
    ? MESSAGES[error.message] : 'Validation failed. No event was sent or saved.';
}
