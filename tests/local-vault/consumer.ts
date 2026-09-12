import { LocalSecretVault, IndexedDbVaultStorage, type VaultKeyDeriver, type LocalVaultStorage } from '@nekon/sdk/local-vault';
import { openBoundApplicationEnrollmentVault, type ApplicationEnrollmentSecretVault, type ApplicationEnrollmentBinding } from '@nekon/sdk/application-enrollment-storage';
declare const deriveKey: VaultKeyDeriver;
declare const indexedDB: IDBFactory;
declare const binding: ApplicationEnrollmentBinding;
const storage: LocalVaultStorage = new IndexedDbVaultStorage('synthetic-typed-consumer', indexedDB);
const vault = new LocalSecretVault({storage, deriveKey});
const port: ApplicationEnrollmentSecretVault = vault;
void openBoundApplicationEnrollmentVault({vault: port, binding, initializeNewVault:false, assertActive() {}});
// @ts-expect-error A host must supply key derivation; there is no weak fallback.
new LocalSecretVault({storage});
// @ts-expect-error Private data keys are never a public export method.
vault.exportDataKey();
// @ts-expect-error Persistence is not membership or message authority.
vault.joinRoom('synthetic');
// @ts-expect-error Record writes require bytes, not arbitrary objects.
vault.write({recordId:'example',kind:'enterprise_provisioning',plaintext:{},expectedRevision:0});
