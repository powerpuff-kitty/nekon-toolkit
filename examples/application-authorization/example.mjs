import { ApplicationDeviceAuthorizationApiResource } from '@nekon/sdk/application-authorization';
import { NekonTransport } from '@nekon/client-runtime/transport';

// Every value and response is synthetic. This is a wire-API example, not a
// recipe for generating real PKCE state, signing keys or enrollment proofs.
const request = Object.freeze({
  authorizationRequestId: 'ear_SYNTHETICREQUEST0',
  redirectUri: 'https://app.example.invalid/callback', state: 'A'.repeat(32),
  codeChallenge: 'A'.repeat(43), targetIdentityId: 'id_SYNTHETICIDENTITY0',
  targetDeviceId: 'dev_SYNTHETICDEVICE00', targetSigningKeyHash: 'A'.repeat(43),
  targetMlsCredentialHash: 'A'.repeat(43),
});
let calls = 0;
const transport = new NekonTransport('https://service.example.invalid', {
  requestTimeoutMs: 0,
  fetch: async (_url, init) => {
    calls++;
    if (init.credentials !== 'omit' || init.redirect !== 'error') throw new Error('Wrong request policy');
    return Response.json({ authorizationRequestId: request.authorizationRequestId,
      authorizationUrl: 'https://service.example.invalid/approve', expiresAt: 123456, duplicate: false });
  },
});
const api = new ApplicationDeviceAuthorizationApiResource(transport);
const receipt = await api.createEnterpriseAuthorizationRequest('app_SYNTHETICAPP00000', request);
if (calls !== 1 || receipt.authorizationRequestId !== request.authorizationRequestId) throw new Error('Wrong receipt');
// Do not navigate to this placeholder URL or log request/state/proof material.
console.log('Synthetic authorization API example passed. No network, real enrollment, storage or encryption performed.');
