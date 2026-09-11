import {
  createApplicationEventEncoder,
  inspectApplicationEventPayload,
  clearApplicationEventPayload,
} from '@nekon/sdk/application-event';

// Synthetic IDs only. In a real integration the verified Room controller must
// allocate/bind these values; this codec does not create or authorize a Room.
const scope = {
  roomId: 'room_01JABCDEFGHIJKLMNOP',
  eventId: 'evt_01JAPPLICATIONEVENT0',
};
const content = new TextEncoder().encode('{"taskId":"synthetic-demo"}');
const encodeForScope = createApplicationEventEncoder({
  type: 'com.example.task.created', schemaVersion: 1,
  contentType: 'application/json', content,
});
const encoded = encodeForScope(scope);
const decoded = inspectApplicationEventPayload(encoded);
if (decoded.roomId !== scope.roomId || decoded.eventId !== scope.eventId) {
  throw new Error('Unexpected application-event scope');
}
// Do not log contents, encoded payloads, credentials or recovery material.
console.log('Synthetic application-event round trip passed. No network or encryption performed.');
clearApplicationEventPayload(decoded);
encoded.fill(0);
content.fill(0);
// The encoder owns another snapshot. Release references when no longer needed;
// JavaScript cannot guarantee erasure of all copies. See the package guide.
