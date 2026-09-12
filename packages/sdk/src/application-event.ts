import {
  NEKON_APPLICATION_EVENT_SCHEMA as INTERNAL_APPLICATION_EVENT_SCHEMA,
  V1_APPLICATION_EVENT_POLICY as INTERNAL_APPLICATION_EVENT_POLICY,
  clearApplicationEventPayload as clearInternalApplicationEventPayload,
  encodeApplicationEventPayload as encodeInternalApplicationEventPayload,
  inspectApplicationEventPayload as inspectInternalApplicationEventPayload,
} from "@nekon/client-runtime/application-event";

export const NEKON_APPLICATION_EVENT_SCHEMA = INTERNAL_APPLICATION_EVENT_SCHEMA;
export const V1_APPLICATION_EVENT_POLICY = INTERNAL_APPLICATION_EVENT_POLICY;

export type ApplicationEventRelationKind =
  "reply" | "thread" | "replace" | "reaction";

export interface ApplicationEventRelation {
  readonly kind: ApplicationEventRelationKind;
  readonly eventId: string;
}

export interface ApplicationEventPayloadInput {
  readonly roomId: string;
  readonly eventId: string;
  /** Reverse-domain namespace, for example `com.example.task.created`. */
  readonly type: string;
  readonly schemaVersion: number;
  /** Lowercase media type describing the opaque content bytes. */
  readonly contentType: string;
  readonly content: Uint8Array;
  readonly relation?: ApplicationEventRelation;
}

export type ApplicationEventDraft = Omit<
  ApplicationEventPayloadInput,
  "roomId" | "eventId"
>;

export interface ApplicationEventScope {
  readonly roomId: string;
  readonly eventId: string;
}

export type ApplicationEventPayloadFields = ApplicationEventPayloadInput;

export function encodeApplicationEventPayload(
  input: ApplicationEventPayloadInput,
): Uint8Array {
  return encodeInternalApplicationEventPayload(input);
}

export function inspectApplicationEventPayload(
  encoded: Uint8Array,
): ApplicationEventPayloadFields {
  return inspectInternalApplicationEventPayload(encoded);
}

export function clearApplicationEventPayload(
  payload: Pick<ApplicationEventPayloadFields, "content">,
): void {
  clearInternalApplicationEventPayload(payload);
}

/**
 * Produces the callback expected by an official Room controller's
 * `sendBoundApplication` method. The exact outer Room and Event IDs are bound
 * only after the controller allocates them.
 */
export function createApplicationEventEncoder(
  draft: ApplicationEventDraft,
): (scope: ApplicationEventScope) => Uint8Array {
  const ownedDraft: ApplicationEventDraft = {
    ...draft,
    content: Uint8Array.from(draft.content),
    ...(draft.relation === undefined
      ? {}
      : { relation: { ...draft.relation } }),
  };
  return (scope) =>
    encodeApplicationEventPayload({
      ...ownedDraft,
      roomId: scope.roomId,
      eventId: scope.eventId,
    });
}
