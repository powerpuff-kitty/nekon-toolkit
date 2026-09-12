import {
  createEnterpriseAuthorizationRedemptionWithSigner,
  type EnterpriseAuthorizationRedemptionSignerInput,
  type EnterpriseAuthorizationRedemptionProof,
} from '@nekon/sdk/application-enrollment-proof';
declare const prepared: EnterpriseAuthorizationRedemptionSignerInput;
const result: Promise<EnterpriseAuthorizationRedemptionProof> = createEnterpriseAuthorizationRedemptionWithSigner(prepared);
// @ts-expect-error The callback returns an owned byte signature, not text.
const wrong: EnterpriseAuthorizationRedemptionSignerInput = { ...prepared, sign: async () => 'signature' };
// @ts-expect-error Key bytes are public Uint8Arrays, not key handles.
const key: EnterpriseAuthorizationRedemptionSignerInput = { ...prepared, targetSigningPublicKey: {} as CryptoKey };
// @ts-expect-error This helper deliberately takes no private signing key handle.
createEnterpriseAuthorizationRedemptionWithSigner({ ...prepared, privateKey: {} as CryptoKey });
// @ts-expect-error Raw code bytes are required, not a callback URL.
createEnterpriseAuthorizationRedemptionWithSigner({ ...prepared, code: 'callback' });
void result; void wrong; void key;
