import {
  openBoundApplicationEnrollmentVault,
  type ApplicationEnrollmentBinding,
  type ApplicationEnrollmentSecretVault,
} from '@nekon/sdk/application-enrollment-storage';
import {
  ApplicationEnrollmentCoordinator,
  type ApplicationEnrollmentStore,
  type ApplicationEnrollmentDevice,
  type ApplicationEnrollmentTransport,
  type ApplicationEnrollmentActivator,
} from '@nekon/sdk/application-enrollment';
declare const vault: ApplicationEnrollmentSecretVault;
declare const binding: ApplicationEnrollmentBinding;
declare const device: ApplicationEnrollmentDevice;
declare const transport: ApplicationEnrollmentTransport;
declare const activator: ApplicationEnrollmentActivator;
const store: ApplicationEnrollmentStore = await openBoundApplicationEnrollmentVault({
  vault, binding, initializeNewVault: false, assertActive() {},
});
const coordinator = new ApplicationEnrollmentCoordinator({
  applicationId: binding.applicationId, authorizationOrigin: binding.serviceOrigin,
  scope: { redirectUri: binding.redirectUri, targetIdentityId: binding.targetIdentityId, targetDeviceId: binding.targetDeviceId },
  vault: store, device, transport, activator,
});
// @ts-expect-error Initializing an existing vault requires an explicit boolean, not a string.
openBoundApplicationEnrollmentVault({ vault, binding, initializeNewVault: 'yes', assertActive() {} });
// @ts-expect-error Every binding fixes both service and device context.
const incomplete: ApplicationEnrollmentBinding = { purpose: 'browser-application-enrollment', serviceOrigin: binding.serviceOrigin };
// @ts-expect-error Plain storage does not implement the encrypted vault/CAS contract.
const invalid: ApplicationEnrollmentSecretVault = { read: async () => null };
// @ts-expect-error This adapter does not own key material, signing, or key export.
store.exportPrivateKey();
// @ts-expect-error Storage binding grants no Room membership.
store.joinRoom('synthetic');
void coordinator; void incomplete; void invalid;
