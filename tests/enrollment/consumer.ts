import {
  ApplicationEnrollmentCoordinator,
  type ApplicationEnrollmentCoordinatorOptions,
  type ApplicationEnrollmentStore,
  type ApplicationEnrollmentDevice,
  type ApplicationEnrollmentActivator,
  type ApplicationEnrollmentTransport,
  type ApplicationEnrollmentProgress,
} from '@nekon/sdk/application-enrollment';
declare const vault: ApplicationEnrollmentStore;
declare const device: ApplicationEnrollmentDevice;
declare const activator: ApplicationEnrollmentActivator;
declare const transport: ApplicationEnrollmentTransport;
const options: ApplicationEnrollmentCoordinatorOptions = {
  applicationId: 'app_0123456789abcdef', authorizationOrigin: 'https://service.example',
  scope: {redirectUri:'https://app.example/callback',targetIdentityId:'id_0123456789abcdef',targetDeviceId:'dev_0123456789abcdef'},
  vault, device, activator, transport,
};
const owner = new ApplicationEnrollmentCoordinator(options);
const progress: Promise<ApplicationEnrollmentProgress | null> = owner.resume();
// @ts-expect-error Both callback state and code are required.
owner.acceptCallback({code:'synthetic'});
// @ts-expect-error A state coordinator does not expose private keys.
owner.exportPrivateKey();
// @ts-expect-error A state coordinator cannot authorize Room membership.
owner.joinRoom('room_0123456789abcdef');
// @ts-expect-error Local browser lifecycle is adapter-owned, not an invented method.
owner.lock();
// @ts-expect-error Storage adapters need atomic revision transitions.
const invalid: ApplicationEnrollmentStore = {read:async()=>null};
void progress; void invalid;
