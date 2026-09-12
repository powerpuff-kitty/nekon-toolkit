# Security status and reporting

This is an unpublished toolkit source preview: tokens, application-event payload
serialization, low-level transport, prepared-material authorization, and reusable
enrollment coordination/storage/proof helpers. It is not an audited or complete
encrypted communication SDK. Encoding is not
encryption; HTTP/socket connectivity and shaped authorization receipts grant no
Room membership or execution authority. Production encrypted-vault/device adapters,
the complete browser enrollment factory and the verified Room/MLS owner remain
separate integration requirements.

Do not post secrets, private keys, recovery material, customer messages, sensitive
logs or suspected vulnerability details in public issues. Private vulnerability
reporting for this new repository has not been verified. Use an established
private maintainer channel, or request one without including sensitive details.
Setup remains tracked in #28. No bounty or response-time commitment is implied.

Transport and authorization source slices remain independently pinned upstream
and must not become separate forks. Source equality is provenance, not independent
security review. Injected adapters and endpoint JavaScript are trusted integration
components; compromised client code is not contained by transport wrappers.
Consume/cancel responses and close sockets deliberately; local cancellation is
not server rollback. Documentation describes the tested byte, route, session,
ticket and resource-validation boundaries without extending their authority.

Authorization APIs require trusted, immutable, already prepared material. They
neither construct nor verify enrollment proofs and do not persist keys or install
sessions. The higher-level owner must bind origins, expiry, identity and exact
retry material. No automatic retries are introduced. Do not log proof/code/verifier
values or raw provider errors. Error codes and retry hints are data, not permission
to repeat a write with fresh material or accept a different identity.

The enrollment coordinator checks scope, callback, material and receipt bindings;
the proof helper self-checks signatures but cannot prove remote approval. Always
pin service origin and expected scope in hosted integrations. The optional V2
bound-storage format remains proposed and rejects legacy records without adopting
or migrating them. Host vaults must encrypt and enforce atomic compare-and-swap.
Read/write byte cleanup cannot erase every JavaScript string or provider copy.
Retirement is local cleanup, not revocation. Raw pending state must never enter UI,
logs, analytics or support exports. These adapters do not provide production KDF,
IndexedDB, Worker signing or MLS merely by being available as public subpaths.

No production-readiness, anonymity, legal compliance, availability or audit claim
follows from passing local tests. Full pinned-workspace, actual browser/server,
Rust/WASM and encrypted interoperability checks remain gates. Package publication
stays blocked pending licensing, source, compatibility and release review.
