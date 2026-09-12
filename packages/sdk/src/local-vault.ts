/** Low-level local persistence; supply the approved KDF and host lifecycle integration. */
export {
  LocalSecretVault,
  IndexedDbVaultStorage,
  V1_LOCAL_VAULT_POLICY,
  type LocalVaultState,
  type VaultRecordKind,
  type VaultHeaderV1,
  type EncryptedVaultRecordV1,
  type VaultReadResult,
  type VaultRecordState,
  type VaultRecordCas,
  type VaultRecordMutation,
  type LocalVaultStorage,
  type VaultKeyDeriver,
  type LocalSecretVaultOptions,
} from "@nekon/client-runtime/local-vault";
