import {
  ApplicationDeviceAuthorizationApiResource,
  type ApplicationDeviceAuthorizationApi,
  type ApplicationDeviceAuthorizationRequestInput,
  type ApplicationDeviceAuthorizationRedemptionMaterial,
  type ApplicationDeviceEnrollmentReceipt,
} from '@nekon/sdk/application-authorization';
import { NekonTransport } from '@nekon/client-runtime/transport';

const api: ApplicationDeviceAuthorizationApi = new ApplicationDeviceAuthorizationApiResource(
  new NekonTransport('https://example.invalid'),
);
declare const prepared: ApplicationDeviceAuthorizationRequestInput;
declare const proof: ApplicationDeviceAuthorizationRedemptionMaterial;
const enrollment: Promise<ApplicationDeviceEnrollmentReceipt> = api.redeemEnterpriseAuthorization('app_synthetic', proof);
void api.createEnterpriseAuthorizationRequest('app_synthetic', prepared);
// @ts-expect-error Redemption requires the prepared proof; a creation request is not one.
api.redeemEnterpriseAuthorization('app_synthetic', prepared);
// @ts-expect-error Prepared binary material is encoded text, not a raw object.
const invalid: ApplicationDeviceAuthorizationRedemptionMaterial = { ...proof, targetSignature: new Uint8Array(64) };
// @ts-expect-error This resource does not provide verified Room admission or encryption.
api.createRoom();
// @ts-expect-error The public interface deliberately has no storage or key-export method.
api.exportPrivateKey();
void invalid; void enrollment;
