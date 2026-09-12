/** Compile-only composition of public entries; no fake production vault or key owner. */
import { NekonTransport } from '@nekon/client-runtime/transport';
import { ApplicationDeviceAuthorizationApiResource } from '@nekon/sdk/application-authorization';
import {
  ApplicationEnrollmentCoordinator, type ApplicationEnrollmentTransport,
  type ApplicationEnrollmentDevice, type ApplicationEnrollmentActivator,
  type ApplicationEnrollmentProof,
} from '@nekon/sdk/application-enrollment';
import {
  openBoundApplicationEnrollmentVault, type ApplicationEnrollmentBinding,
  type ApplicationEnrollmentSecretVault,
} from '@nekon/sdk/application-enrollment-storage';
import {
  createEnterpriseAuthorizationRedemptionWithSigner,
  type EnterpriseAuthorizationRedemptionSignerInput,
} from '@nekon/sdk/application-enrollment-proof';
declare const vault: ApplicationEnrollmentSecretVault;
declare const binding: ApplicationEnrollmentBinding;
declare const device: ApplicationEnrollmentDevice;
declare const activator: ApplicationEnrollmentActivator;
declare const assertActive: () => void;
const transport: ApplicationEnrollmentTransport = new ApplicationDeviceAuthorizationApiResource(
  new NekonTransport(binding.serviceOrigin),
);
const store = await openBoundApplicationEnrollmentVault({
  vault, binding, initializeNewVault: false, assertActive,
});
const owner = new ApplicationEnrollmentCoordinator({
  applicationId: binding.applicationId, authorizationOrigin: binding.serviceOrigin,
  scope: { redirectUri: binding.redirectUri, targetIdentityId: binding.targetIdentityId,
    targetDeviceId: binding.targetDeviceId },
  vault: store, transport, device, activator, assertActive,
});
const prepareProof: (input: EnterpriseAuthorizationRedemptionSignerInput) =>
  Promise<ApplicationEnrollmentProof> = createEnterpriseAuthorizationRedemptionWithSigner;
void owner; void prepareProof;
