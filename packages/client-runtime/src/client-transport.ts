import { boundedResponse, discardResponse, rejectDeclaredOversize } from "./bounded-response.js";

export const NEKON_API_VERSION = "2026-08-24";
export const NEKON_API_VERSION_HEADER = "Nekon-Api-Version";
export const NEKON_ROOM_GUEST_SESSION_HEADER = "Nekon-Room-Guest-Session";
export const NEKON_APPLICATION_SESSION_HEADER = "Nekon-Application-Session";
export const NEKON_WEBSOCKET_TICKET_PROTOCOL_PREFIX = "nekon.ws-ticket.";
export const NEKON_CLIENT_API_PATH = "/api/client/v1";
export const NEKON_WEBSOCKET_PROTOCOL = "nekon.protocol.v1";
export const NEKON_CALL_WEBSOCKET_PROTOCOL = "nekon.call.2026-08-23.v2";
export const NEKON_ROOM_LIVE_WEBSOCKET_PROTOCOL = "nekon.room-live.v1";

export interface NekonCapabilities {
  readonly service: string;
  readonly api: {
    readonly major: number;
    readonly current: string;
    readonly supported: readonly string[];
    readonly versionHeader: string;
    readonly basePath: string;
  };
  readonly protocol: {
    readonly versions: readonly number[];
    readonly eventSchema: string;
    readonly cipherSuites: readonly number[];
    readonly webSocketSubprotocols: readonly string[];
  };
  readonly features: Readonly<Record<string, number>>;
}

export interface NekonClientOptions {
  /** Immutable isolated authority: every authenticated request omits Account cookies. */
  readonly roomGuestRoomId?: string;
  readonly fetch?: typeof fetch;
  readonly WebSocket?: typeof WebSocket;
  /** Timeout for idempotent reads, their response bodies, and ephemeral connection setup. Durable writes are never auto-aborted. */
  readonly requestTimeoutMs?: number;
  /** Maximum decoded response body size for requests governed by requestTimeoutMs. */
  readonly responseBodyLimitBytes?: number;
}

export type {
  NekonRequestTransport,
  NekonRequestPolicy,
  NekonRequestCredentialMode,
} from "./client-request-transport.js";
import type {
  NekonRequestTransport,
  NekonRequestPolicy,
  NekonRequestCredentialMode,
} from "./client-request-transport.js";

/**
 * Framework-independent HTTP, application-session, and WebSocket transport.
 * Domain request encoding and response validation belong to resource clients.
 */
export class NekonTransport implements NekonRequestTransport {
  readonly #baseUrl: URL;
  readonly #fetch: typeof fetch;
  readonly #WebSocket: typeof WebSocket | undefined;
  readonly #requestTimeoutMs: number;
  readonly #responseBodyLimitBytes: number;
  #applicationSession: string | undefined;
  #roomGuestSession: string | undefined;
  readonly #roomGuestRoomId: string | undefined;

  constructor(baseUrl: string | URL, options: NekonClientOptions = {}) {
    this.#baseUrl = normalizeBaseUrl(baseUrl);
    if (
      options.roomGuestRoomId !== undefined &&
      !/^room_[A-Za-z0-9]{16,128}$/u.test(options.roomGuestRoomId)
    )
      throw new Error("invalid_room_guest_transport");
    this.#roomGuestRoomId = options.roomGuestRoomId;
    this.#fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.#WebSocket = options.WebSocket ?? globalThis.WebSocket;
    this.#requestTimeoutMs = options.requestTimeoutMs ?? 20_000;
    if (!Number.isSafeInteger(this.#requestTimeoutMs) ||
        this.#requestTimeoutMs < 0 || this.#requestTimeoutMs > 2_147_483_647) {
      throw new Error("invalid_request_timeout");
    }
    this.#responseBodyLimitBytes =
      options.responseBodyLimitBytes ?? 16 * 1024 * 1024;
    if (
      !Number.isSafeInteger(this.#responseBodyLimitBytes) ||
      this.#responseBodyLimitBytes < 1
    ) {
      throw new Error("invalid_response_body_limit");
    }
  }

  get roomGuestRoomId(): string | undefined {
    return this.#roomGuestRoomId;
  }

  async discover(): Promise<NekonCapabilities> {
    const url = new URL("/api/client/versions", this.#baseUrl);
    const init: RequestInit = { credentials: "omit", redirect: "error" };
    const response =
      this.#requestTimeoutMs <= 0
        ? await requestWithBoundedResponse(
            this.#fetch, url, init, undefined, this.#responseBodyLimitBytes,
          )
        : await requestWithTimeout(
            this.#fetch,
            url,
            init,
            undefined,
            this.#requestTimeoutMs,
            this.#responseBodyLimitBytes,
          );
    if (!response.ok) {
      discardResponse(response);
      throw new Error(`nekon_discovery_failed:${response.status}`);
    }
    return (await response.json()) as NekonCapabilities;
  }

  request(
    path: string,
    init: RequestInit = {},
    policy: NekonRequestPolicy = {},
  ): Promise<Response> {
    if (
      policy.deadlineMs !== undefined &&
      (!Number.isSafeInteger(policy.deadlineMs) || policy.deadlineMs < 1 ||
        policy.deadlineMs > 2_147_483_647)
    )
      throw new Error("invalid_request_deadline");
    if (
      policy.responseBodyLimitBytes !== undefined &&
      (!Number.isSafeInteger(policy.responseBodyLimitBytes) ||
        policy.responseBodyLimitBytes < 1)
    )
      throw new Error("invalid_response_body_limit");
    if (
      policy.credentialMode !== undefined &&
      policy.credentialMode !== "application-session" &&
      policy.credentialMode !== "public"
    )
      throw new Error("invalid_request_credential_mode");
    const method = (init.method ?? "GET").toUpperCase();
    const idempotentRead = method === "GET" || method === "HEAD";
    const credentialMode =
      policy.credentialMode ??
      (init.credentials === "omit" ? "public" : "application-session");
    if (credentialMode === "application-session" && init.credentials === "omit")
      throw new Error("application_session_requires_credentials");
    return this.#request(
      path,
      init,
      idempotentRead || policy.deadlineMs !== undefined,
      policy.deadlineMs ?? this.#requestTimeoutMs,
      policy.responseBodyLimitBytes ?? this.#responseBodyLimitBytes,
      credentialMode,
    );
  }

  #request(
    path: string,
    init: RequestInit,
    timeoutEnabled: boolean,
    timeoutMs = this.#requestTimeoutMs,
    responseBodyLimitBytes = this.#responseBodyLimitBytes,
    credentialMode: NekonRequestCredentialMode = "application-session",
  ): Promise<Response> {
    const url = clientApiUrl(this.#baseUrl, path);
    const headers = new Headers(init.headers);
    headers.set(NEKON_API_VERSION_HEADER, NEKON_API_VERSION);
    if (
      credentialMode === "application-session" &&
      this.#applicationSession !== undefined &&
      !headers.has(NEKON_APPLICATION_SESSION_HEADER)
    ) {
      headers.set(NEKON_APPLICATION_SESSION_HEADER, this.#applicationSession);
    }
    // Caller-supplied credentials cannot cross the immutable guest boundary.
    headers.delete(NEKON_ROOM_GUEST_SESSION_HEADER);
    if (credentialMode === "public" || this.#roomGuestRoomId !== undefined) {
      headers.delete(NEKON_APPLICATION_SESSION_HEADER);
    }
    if (this.#roomGuestRoomId !== undefined) {
      headers.delete("Cookie");
      if (
        !isAttachmentCapability(
          path,
          init.method ?? "GET",
          headers.get("Authorization"),
          credentialMode,
        )
      )
        headers.delete("Authorization");
    }
    if (
      credentialMode !== "public" &&
      this.#roomGuestRoomId !== undefined &&
      this.#roomGuestSession !== undefined
    )
      headers.set(NEKON_ROOM_GUEST_SESSION_HEADER, this.#roomGuestSession);
    const requestInit: RequestInit = {
      ...init,
      redirect: "error",
      credentials:
        credentialMode === "public" || this.#roomGuestRoomId !== undefined
          ? "omit"
          : (init.credentials ?? "include"),
      headers,
    };
    if (!timeoutEnabled || timeoutMs <= 0) {
      return requestWithBoundedResponse(
        this.#fetch,
        url,
        requestInit,
        init.signal,
        responseBodyLimitBytes,
      );
    }

    return requestWithTimeout(
      this.#fetch,
      url,
      requestInit,
      init.signal,
      timeoutMs,
      responseBodyLimitBytes,
    );
  }

  setApplicationSession(value: string): void {
    if (this.#roomGuestRoomId !== undefined)
      throw new Error("guest_transport_forbids_account_session");
    if (!isApplicationSession(value)) {
      throw new Error("invalid_application_session");
    }
    this.#applicationSession = value;
  }

  clearApplicationSession(): void {
    this.#applicationSession = undefined;
    this.#roomGuestSession = undefined;
  }

  setRoomGuestSession(value: string): void {
    if (this.#roomGuestRoomId === undefined || !isApplicationSession(value))
      throw new Error("invalid_room_guest_session");
    this.#roomGuestSession = value;
  }

  async connect(deviceId: string): Promise<WebSocket> {
    if (!this.#WebSocket) {
      throw new Error("websocket_unavailable");
    }
    if (!/^dev_[A-Za-z0-9_-]{16,128}$/u.test(deviceId)) {
      throw new Error("invalid_device_id");
    }
    const url = new URL("/ws", this.#baseUrl);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.searchParams.set("deviceId", deviceId);
    const ticket = await this.#issueWebSocketTicket(
      NEKON_WEBSOCKET_PROTOCOL,
      webSocketTarget(url),
    );
    return new this.#WebSocket(url, [
      NEKON_WEBSOCKET_PROTOCOL,
      `${NEKON_WEBSOCKET_TICKET_PROTOCOL_PREFIX}${ticket}`,
    ]);
  }

  async connectCall(callId: string, deviceId: string): Promise<WebSocket> {
    if (!this.#WebSocket) {
      throw new Error("websocket_unavailable");
    }
    if (!/^call_[A-Za-z0-9_-]{16,128}$/u.test(callId)) {
      throw new Error("invalid_call_id");
    }
    if (!/^dev_[A-Za-z0-9_-]{16,128}$/u.test(deviceId)) {
      throw new Error("invalid_device_id");
    }
    const url = new URL(
      `${NEKON_CLIENT_API_PATH}/calls/${callId}/ws`,
      this.#baseUrl,
    );
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.searchParams.set("deviceId", deviceId);
    const ticket = await this.#issueWebSocketTicket(
      NEKON_CALL_WEBSOCKET_PROTOCOL,
      webSocketTarget(url),
    );
    return new this.#WebSocket(url, [
      NEKON_CALL_WEBSOCKET_PROTOCOL,
      `${NEKON_WEBSOCKET_TICKET_PROTOCOL_PREFIX}${ticket}`,
    ]);
  }

  async connectRoomLive(roomId: string, deviceId: string): Promise<WebSocket> {
    if (!this.#WebSocket) throw new Error("websocket_unavailable");
    if (!/^room_[A-Za-z0-9_-]{16,128}$/u.test(roomId))
      throw new Error("invalid_room_id");
    if (!/^dev_[A-Za-z0-9_-]{16,128}$/u.test(deviceId))
      throw new Error("invalid_device_id");
    const url = new URL(
      `${NEKON_CLIENT_API_PATH}/rooms/${roomId}/live`,
      this.#baseUrl,
    );
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.searchParams.set("deviceId", deviceId);
    const ticket = await this.#issueWebSocketTicket(
      NEKON_ROOM_LIVE_WEBSOCKET_PROTOCOL,
      webSocketTarget(url),
    );
    return new this.#WebSocket(url, [
      NEKON_ROOM_LIVE_WEBSOCKET_PROTOCOL,
      `${NEKON_WEBSOCKET_TICKET_PROTOCOL_PREFIX}${ticket}`,
    ]);
  }

  async #issueWebSocketTicket(
    protocol: string,
    target: string,
  ): Promise<string> {
    const response = await this.#request(
      "/auth/websocket-tickets",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ protocol, target }),
      },
      true,
      this.#requestTimeoutMs,
      this.#responseBodyLimitBytes,
      "application-session",
    );
    if (!response.ok) {
      discardResponse(response);
      throw new Error(`websocket_ticket_failed:${response.status}`);
    }
    const body = (await response.json()) as unknown;
    const now = Date.now();
    if (
      !isRecord(body) ||
      typeof body.ticket !== "string" ||
      !/^[A-Za-z0-9_-]{43}$/u.test(body.ticket) ||
      body.protocol !== protocol ||
      body.target !== target ||
      !Number.isSafeInteger(body.expiresAt) ||
      (body.expiresAt as number) <= now ||
      (body.expiresAt as number) > now + 60_000 ||
      Object.keys(body).sort().join(",") !== "expiresAt,protocol,target,ticket"
    ) {
      throw new Error("invalid_websocket_ticket_response");
    }
    return body.ticket;
  }
}

function webSocketTarget(url: URL): string {
  if (url.hash !== "" || (url.protocol !== "wss:" && url.protocol !== "ws:"))
    throw new Error("invalid_websocket_target");
  return `${url.pathname}${url.search}`;
}

async function requestWithBoundedResponse(
  fetcher: typeof fetch,
  url: URL,
  init: RequestInit,
  sourceSignal: AbortSignal | null | undefined,
  responseBodyLimitBytes: number,
): Promise<Response> {
  sourceSignal?.throwIfAborted();
  const response = await fetcher(url, init);
  if (sourceSignal?.aborted) {
    discardResponse(response);
    sourceSignal.throwIfAborted();
  }
  rejectDeclaredOversize(response, responseBodyLimitBytes);
  if (response.body === null) return response;
  const signal = sourceSignal ?? new AbortController().signal;
  return boundedResponse(
    response,
    signal,
    responseBodyLimitBytes,
    () => undefined,
  );
}

async function requestWithTimeout(
  fetcher: typeof fetch,
  url: URL,
  init: RequestInit,
  sourceSignal: AbortSignal | null | undefined,
  timeoutMs: number,
  responseBodyLimitBytes: number,
): Promise<Response> {
  sourceSignal?.throwIfAborted();
  const controller = new AbortController();
  const forwardAbort = (): void => controller.abort(sourceSignal?.reason);
  if (sourceSignal?.aborted) forwardAbort();
  else sourceSignal?.addEventListener("abort", forwardAbort, { once: true });
  const timeout = globalThis.setTimeout(
    () =>
      controller.abort(new DOMException("Request timed out", "TimeoutError")),
    timeoutMs,
  );
  const cleanup = (): void => {
    globalThis.clearTimeout(timeout);
    sourceSignal?.removeEventListener("abort", forwardAbort);
  };
  try {
    const response = await fetcher(url, { ...init, signal: controller.signal });
    if (controller.signal.aborted) {
      discardResponse(response);
      controller.signal.throwIfAborted();
    }
    rejectDeclaredOversize(response, responseBodyLimitBytes);
    if (response.body === null) {
      cleanup();
      return response;
    }
    return boundedResponse(
      response,
      controller.signal,
      responseBodyLimitBytes,
      cleanup,
    );
  } catch (error) {
    cleanup();
    throw error;
  }
}

function normalizeBaseUrl(value: string | URL): URL {
  const url = new URL(value);
  if (url.username !== "" || url.password !== "" ||
      (url.protocol !== "https:" && !isLocalHttp(url))) {
    throw new Error("secure_nekon_origin_required");
  }
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url;
}

function isLocalHttp(url: URL): boolean {
  return (
    url.protocol === "http:" &&
    (url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "[::1]")
  );
}

function clientApiUrl(baseUrl: URL, path: string): URL {
  if (typeof path !== "string" || /[\u0000-\u0020\u007f\\#]/u.test(path) ||
      /^[a-z][a-z0-9+.-]*:/iu.test(path) || path.includes("..")) {
    throw new Error("invalid_client_api_path");
  }
  const rawPath = path.split("?", 1)[0]!;
  // Route segments are canonical ASCII paths. Encoded routing separators and
  // dot segments must not acquire a different meaning in URL or server parsing.
  if (/%(?:2e|2f|5c|00|25)/iu.test(rawPath)) {
    throw new Error("invalid_client_api_path");
  }
  // Normalize the route only: trailing query slashes are application data.
  const relative = rawPath.replace(/^\/+|\/+$/gu, "");
  const query = path.slice(rawPath.length);
  if (relative.length === 0 || relative.startsWith("?")) {
    throw new Error("invalid_client_api_path");
  }
  const url = new URL(`${NEKON_CLIENT_API_PATH}/${relative}${query}`, baseUrl);
  if (url.origin !== baseUrl.origin || url.hash !== "" ||
      !url.pathname.startsWith(`${NEKON_CLIENT_API_PATH}/`)) {
    throw new Error("invalid_client_api_path");
  }
  return url;
}

function isApplicationSession(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 256) return false;
  const separator = value.indexOf(".");
  if (
    separator < 0 ||
    !/^dev_[A-Za-z0-9_-]{16,128}$/u.test(value.slice(0, separator))
  ) {
    return false;
  }
  const encodedToken = value.slice(separator + 1);
  let token: Uint8Array | undefined;
  try {
    token = decodeCanonicalBase64Url(encodedToken);
    return token.byteLength === 32;
  } catch {
    return false;
  } finally {
    token?.fill(0);
  }
}

function decodeCanonicalBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) {
    throw new Error("invalid_base64url_value");
  }
  const padding = (4 - (value.length % 4)) % 4;
  const binary = atob(
    value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat(padding),
  );
  const decoded = Uint8Array.from(binary, (character) =>
    character.charCodeAt(0),
  );
  if (encodeBase64Url(decoded) !== value) {
    decoded.fill(0);
    throw new Error("invalid_base64url_value");
  }
  return decoded;
}

function encodeBase64Url(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Object-scoped bearer operations intentionally carry no Device/Account session. */
function isAttachmentCapability(
  path: string,
  method: string,
  authorization: string | null,
  mode: NekonRequestCredentialMode,
): boolean {
  if (mode !== "public" || authorization === null) return false;
  return (
    (method === "PUT" &&
      /^attachments\/[A-Za-z0-9_-]{43}\/parts\/[1-9][0-9]*$/u.test(path) &&
      /^Nekon-Attachment-Part [A-Za-z0-9_-]{43}$/u.test(authorization)) ||
    ((method === "GET" || method === "HEAD") &&
      /^attachments\/[A-Za-z0-9_-]{43}\/content$/u.test(path) &&
      /^Nekon-Attachment-Download [A-Za-z0-9_-]{43}$/u.test(authorization))
  );
}
