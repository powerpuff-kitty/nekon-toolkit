# Security status and reporting

This is an unpublished toolkit source preview: tokens, application-event payload
serialization, low-level transport and prepared-material authorization APIs. It
is not an audited or complete encrypted communication SDK. Encoding is not
encryption; HTTP/socket connectivity and shaped authorization receipts grant no
Room membership or execution authority. Complete encrypted enrollment and the
verified Room/MLS owner remain separate integration requirements.

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

No production-readiness, anonymity, legal compliance, availability or audit claim
follows from passing local tests. Full pinned-workspace, actual browser/server,
Rust/WASM and encrypted interoperability checks remain gates. Package publication
stays blocked pending licensing, source, compatibility and release review.
