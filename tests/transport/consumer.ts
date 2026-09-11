import {
  NekonTransport, type NekonRequestTransport, type NekonRequestPolicy,
  type NekonCapabilities, type NekonClientOptions,
} from '@nekon/client-runtime/transport';
const options: NekonClientOptions = { requestTimeoutMs: 1000, responseBodyLimitBytes: 1024 };
const transport = new NekonTransport('https://example.invalid', options);
const resourceTransport: NekonRequestTransport = transport;
const policy: NekonRequestPolicy = { credentialMode: 'public', deadlineMs: 2000 };
const request: Promise<Response> = resourceTransport.request('synthetic', {}, policy);
const discovery: Promise<NekonCapabilities> = transport.discover();
const socket: Promise<WebSocket> = transport.connect('dev_SYNTHETICDEVICE0000');
// @ts-expect-error Credential policy does not admit an arbitrary authority.
const invalid: NekonRequestPolicy = { credentialMode: 'administrator' };
// @ts-expect-error This transport does not implement encryption or Room membership.
transport.encrypt('plaintext');
// @ts-expect-error Session credentials must be explicit strings, not identity objects.
transport.setApplicationSession({ deviceId: 'synthetic' });
void request; void discovery; void socket; void invalid;
