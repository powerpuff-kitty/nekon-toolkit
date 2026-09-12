/** Existing encrypted application-enrollment V1 state and narrow adapter ports. */
export interface ApplicationEnrollmentReceipt {
  readonly enrolled: true;
  readonly applicationId: string;
  readonly authorizationRequestId: string;
  readonly accountId: string;
  readonly identityId: string;
  readonly deviceId: string;
  readonly duplicate: boolean;
}

export interface ApplicationEnrollmentScope {
  readonly redirectUri: string;
  readonly targetIdentityId: string;
  readonly targetDeviceId: string;
}

export interface ApplicationEnrollmentPreparedMaterial {
  readonly state: string;
  readonly codeVerifier: string;
  readonly codeChallenge: string;
  readonly targetSigningKeyHash: string;
  readonly targetMlsCredentialHash: string;
  readonly targetMlsCredential: string;
}

interface AuthorizationScope extends ApplicationEnrollmentScope,
  ApplicationEnrollmentPreparedMaterial {
  readonly applicationId: string;
  readonly authorizationRequestId: string;
}

export type ApplicationEnrollmentSnapshot =
  | (AuthorizationScope & { readonly status: "prepared"; readonly revision: number })
  | (AuthorizationScope & {
      readonly status: "approval_required";
      readonly authorizationUrl: string;
      readonly expiresAt: number;
      readonly revision: number;
    })
  | (AuthorizationScope & {
      readonly status: "redeeming";
      readonly authorizationUrl: string;
      readonly expiresAt: number;
      readonly code: string;
      readonly revision: number;
    })
  | {
      readonly status: "enrolled";
      readonly applicationId: string;
      readonly accountId: string;
      readonly targetIdentityId: string;
      readonly targetDeviceId: string;
      readonly authorizationRequestId: string;
      readonly receipt: ApplicationEnrollmentReceipt;
      readonly revision: number;
    };

type WithoutRevision<T> = T extends unknown ? Omit<T, "revision"> : never;
export type ApplicationEnrollmentDraft = WithoutRevision<ApplicationEnrollmentSnapshot>;

/** Implementations must encrypt at rest and enforce atomic compare-and-swap. */
export interface ApplicationEnrollmentStore {
  read(): Promise<ApplicationEnrollmentSnapshot | null>;
  stage(value: ApplicationEnrollmentDraft): Promise<ApplicationEnrollmentSnapshot>;
  advance(value: ApplicationEnrollmentDraft, expectedRevision: number): Promise<ApplicationEnrollmentSnapshot>;
  retire(expectedRevision: number): Promise<void>;
}

export interface ApplicationEnrollmentProof {
  readonly authorizationRequestId: string;
  readonly code: string;
  readonly codeVerifier: string;
  readonly targetSigningPublicKey: string;
  readonly targetMlsCredential: string;
  readonly targetSignature: string;
}

export interface ApplicationEnrollmentTransport {
  createEnterpriseAuthorizationRequest(applicationId: string, input: {
    readonly authorizationRequestId: string;
    readonly redirectUri: string;
    readonly state: string;
    readonly codeChallenge: string;
    readonly targetIdentityId: string;
    readonly targetDeviceId: string;
    readonly targetSigningKeyHash: string;
    readonly targetMlsCredentialHash: string;
  }): Promise<{
    readonly authorizationRequestId: string;
    readonly authorizationUrl: string;
    readonly expiresAt: number;
    readonly duplicate: boolean;
  }>;
  redeemEnterpriseAuthorization(applicationId: string, material: ApplicationEnrollmentProof): Promise<ApplicationEnrollmentReceipt>;
}

/** Trusted local owner of key material; neither the coordinator nor UI receives keys. */
export interface ApplicationEnrollmentDevice {
  prepare(scope: ApplicationEnrollmentScope): Promise<ApplicationEnrollmentPreparedMaterial>;
  prepareRedemption(state: Extract<ApplicationEnrollmentSnapshot, { status: "redeeming" }>): Promise<ApplicationEnrollmentProof>;
  authenticate(receipt: ApplicationEnrollmentReceipt): Promise<void>;
}

export interface ApplicationEnrollmentActivator {
  activate(receipt: ApplicationEnrollmentReceipt): Promise<void>;
}

export type ApplicationEnrollmentProgress =
  | {
      readonly status: "approval_required";
      readonly authorizationUrl: string;
      readonly expiresAt: number;
      readonly targetDeviceId: string;
    }
  | { readonly status: "enrolled"; readonly receipt: ApplicationEnrollmentReceipt };
