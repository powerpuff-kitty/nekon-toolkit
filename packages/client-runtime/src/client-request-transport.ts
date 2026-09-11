/** Minimum authority required by a domain API resource. */
export interface NekonRequestTransport {
  request(
    path: string,
    init?: RequestInit,
    policy?: NekonRequestPolicy,
  ): Promise<Response>;
}

export interface NekonRequestPolicy {
  /** Ends local observation; callers must retry with the same idempotency material. */
  readonly deadlineMs?: number;
  readonly responseBodyLimitBytes?: number;
  /** Explicit authority boundary for the Device-bound application session. */
  readonly credentialMode?: NekonRequestCredentialMode;
}

export type NekonRequestCredentialMode = "application-session" | "public";
