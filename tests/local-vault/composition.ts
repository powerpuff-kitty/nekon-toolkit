/** Compile-only host composition. No password derivation or browser factory is supplied here. */
import {
  LocalSecretVault, type LocalVaultStorage, type VaultKeyDeriver,
} from '@nekon/sdk/local-vault';
import {
  openBoundApplicationEnrollmentVault, type ApplicationEnrollmentBinding,
} from '@nekon/sdk/application-enrollment-storage';

// The host must provide the approved Argon2id implementation and actual storage.
declare const storage: LocalVaultStorage;
declare const deriveKey: VaultKeyDeriver;
declare const binding: ApplicationEnrollmentBinding;
declare const unlockSecret: string;
const vault = new LocalSecretVault({ storage, deriveKey });
await vault.unlock(unlockSecret);
try {
  const enrollmentStore = await openBoundApplicationEnrollmentVault({
    vault, binding, initializeNewVault: false,
    assertActive() {
      if (vault.state !== 'unlocked') throw new Error('vault_locked');
    },
  });
  // Pass this store to the existing coordinator with the same origin and scope.
  // Do not render or log its raw pending snapshots.
  void enrollmentStore;
} finally {
  await vault.lockAndDrain();
}
