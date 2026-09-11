import {
  createApplicationEventEncoder, inspectApplicationEventPayload,
  clearApplicationEventPayload, V1_APPLICATION_EVENT_POLICY,
  type ApplicationEventDraft, type ApplicationEventScope, type ApplicationEventRelationKind,
} from '@nekon/sdk/application-event';

const draft: ApplicationEventDraft = {
  type: 'com.example.task.created', schemaVersion: 1, contentType: 'application/json',
  content: new TextEncoder().encode('{}'), relation: { kind: 'reply', eventId: 'evt_01JPREVIOUSTASK000' },
};
const scope: ApplicationEventScope = { roomId: 'room_01JABCDEFGHIJKLMNOP', eventId: 'evt_01JAPPLICATIONEVENT0' };
const encoded: Uint8Array = createApplicationEventEncoder(draft)(scope);
const decoded = inspectApplicationEventPayload(encoded);
const kind: ApplicationEventRelationKind | undefined = decoded.relation?.kind;
clearApplicationEventPayload(decoded);
// @ts-expect-error The public draft requires opaque bytes, not arbitrary objects.
const invalid: ApplicationEventDraft = { ...draft, content: { hello: 'world' } };
// @ts-expect-error Relation kinds are closed, not arbitrary application commands.
const wrongRelation: ApplicationEventRelationKind = 'execute';
// @ts-expect-error Scope binding requires both the Room and Event ID.
createApplicationEventEncoder(draft)({ roomId: scope.roomId });
// @ts-expect-error Published policy is read-only.
V1_APPLICATION_EVENT_POLICY.maximumContentBytes = 1;
// @ts-expect-error The full NekonClient is deliberately not provided in this slice.
import { NekonClient } from '@nekon/sdk/application-event';
void kind; void invalid; void wrongRelation; void NekonClient;
