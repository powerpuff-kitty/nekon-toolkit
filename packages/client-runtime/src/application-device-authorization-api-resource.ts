import { decodeBase64UrlBounded } from "./client-binary-codec";
import { readNekonHttpError } from "./client-api-error";
import {
  hasExactKeys,
  isPrefixedOpaqueId,
  isRecord,
} from "./client-response-validation";
import type { NekonRequestTransport } from "./client-transport";

export interface ApplicationDeviceAuthorizationRequestInput {
  readonly authorizationRequestId: string;
  readonly redirectUri: string;
  readonly state: string;
  readonly codeChallenge: string;
  readonly targetIdentityId: string;
  readonly targetDeviceId: string;
  readonly targetSigningKeyHash: string;
  readonly targetMlsCredentialHash: string;
}

export interface ApplicationDeviceAuthorizationRequestReceipt {
  readonly authorizationRequestId: string;
  readonly authorizationUrl: string;
  readonly expiresAt: number;
  readonly duplicate: boolean;
}

export interface ApplicationDeviceAuthorizationRedemptionMaterial {
  readonly authorizationRequestId: string;
  readonly code: string;
  readonly codeVerifier: string;
  readonly targetSigningPublicKey: string;
  readonly targetMlsCredential: string;
  readonly targetSignature: string;
}

export interface ApplicationDeviceEnrollmentReceipt {
  readonly enrolled: true;
  readonly applicationId: string;
  readonly authorizationRequestId: string;
  readonly accountId: string;
  readonly identityId: string;
  readonly deviceId: string;
  readonly duplicate: boolean;
}

export interface ApplicationDeviceAuthorizationApi {
  createEnterpriseAuthorizationRequest(
    applicationId: string,
    input: ApplicationDeviceAuthorizationRequestInput,
  ): Promise<ApplicationDeviceAuthorizationRequestReceipt>;
  redeemEnterpriseAuthorization(
    applicationId: string,
    material: ApplicationDeviceAuthorizationRedemptionMaterial,
  ): Promise<ApplicationDeviceEnrollmentReceipt>;
}

export class ApplicationDeviceAuthorizationApiResource implements ApplicationDeviceAuthorizationApi {
  readonly #transport: NekonRequestTransport;

  constructor(transport: NekonRequestTransport) {
    this.#transport = transport;
  }

  async createEnterpriseAuthorizationRequest(
    applicationId: string,
    input: ApplicationDeviceAuthorizationRequestInput,
  ): Promise<ApplicationDeviceAuthorizationRequestReceipt> {
    validateApplicationId(applicationId);
    validateAuthorizationRequestInput(input);
    const response = await this.#transport.request(
      `public/enterprise/applications/${applicationId}/authorization-requests`,
      {
        method: "POST",
        credentials: "omit",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      },
      { credentialMode: "public" },
    );
    if (!response.ok) throw await readNekonHttpError(response);
    const value = await response.json();
    if (
      !isRecord(value) ||
      !hasExactKeys(value, [
        "authorizationRequestId",
        "authorizationUrl",
        "expiresAt",
        "duplicate",
      ]) ||
      value.authorizationRequestId !== input.authorizationRequestId ||
      !isHttpsUrl(value.authorizationUrl) ||
      !isSafeUnsigned(value.expiresAt) ||
      typeof value.duplicate !== "boolean"
    ) {
      throw new Error("invalid_enterprise_authorization_request_receipt");
    }
    return value as unknown as ApplicationDeviceAuthorizationRequestReceipt;
  }

  async redeemEnterpriseAuthorization(
    applicationId: string,
    material: ApplicationDeviceAuthorizationRedemptionMaterial,
  ): Promise<ApplicationDeviceEnrollmentReceipt> {
    validateApplicationId(applicationId);
    validateRedemptionMaterial(material);
    const response = await this.#transport.request(
      `public/enterprise/applications/${applicationId}/authorization-codes/redeem`,
      {
        method: "POST",
        credentials: "omit",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(material),
      },
      { credentialMode: "public" },
    );
    if (!response.ok) throw await readNekonHttpError(response);
    const value = await response.json();
    if (
      !isRecord(value) ||
      !hasExactKeys(value, [
        "enrolled",
        "applicationId",
        "authorizationRequestId",
        "accountId",
        "identityId",
        "deviceId",
        "duplicate",
      ]) ||
      value.enrolled !== true ||
      value.applicationId !== applicationId ||
      value.authorizationRequestId !== material.authorizationRequestId ||
      !isPrefixedOpaqueId(value.accountId, "acct_") ||
      !isPrefixedOpaqueId(value.identityId, "id_") ||
      !isPrefixedOpaqueId(value.deviceId, "dev_") ||
      typeof value.duplicate !== "boolean"
    ) {
      throw new Error("invalid_enterprise_authorization_redemption_receipt");
    }
    return value as unknown as ApplicationDeviceEnrollmentReceipt;
  }
}

function validateAuthorizationRequestInput(
  input: ApplicationDeviceAuthorizationRequestInput,
): void {
  if (
    !isPrefixedOpaqueId(input.authorizationRequestId, "ear_") ||
    !isHttpsUrl(input.redirectUri) ||
    !isPrefixedOpaqueId(input.targetIdentityId, "id_") ||
    !isPrefixedOpaqueId(input.targetDeviceId, "dev_")
  ) {
    throw new Error("invalid_enterprise_authorization_request");
  }
  try {
    validateEncodedBytes(input.state, 24, 24);
    validateEncodedBytes(input.codeChallenge, 32, 32);
    validateEncodedBytes(input.targetSigningKeyHash, 32, 32);
    validateEncodedBytes(input.targetMlsCredentialHash, 32, 32);
  } catch {
    throw new Error("invalid_enterprise_authorization_request");
  }
}

function validateRedemptionMaterial(
  material: ApplicationDeviceAuthorizationRedemptionMaterial,
): void {
  if (
    !isPrefixedOpaqueId(material.authorizationRequestId, "ear_") ||
    !/^[A-Za-z0-9._~-]{43,128}$/u.test(material.codeVerifier)
  ) {
    throw new Error("invalid_enterprise_authorization_redemption");
  }
  try {
    validateEncodedBytes(material.code, 32, 32);
    validateEncodedBytes(material.targetSigningPublicKey, 32, 32);
    validateEncodedBytes(material.targetMlsCredential, 64 * 1024, 1);
    validateEncodedBytes(material.targetSignature, 64, 64);
  } catch {
    throw new Error("invalid_enterprise_authorization_redemption");
  }
}

function validateEncodedBytes(
  value: string,
  maximum: number,
  minimum: number,
): void {
  const decoded = decodeBase64UrlBounded(value, maximum, minimum);
  decoded.fill(0);
}

function validateApplicationId(value: string): void {
  if (!isPrefixedOpaqueId(value, "app_")) {
    throw new Error("invalid_application_id");
  }
}

function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.username === "" &&
      url.password === "" &&
      url.hash === ""
    );
  } catch {
    return false;
  }
}

function isSafeUnsigned(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}
