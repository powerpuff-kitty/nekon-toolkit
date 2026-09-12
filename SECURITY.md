# Security status and reporting

This is an unpublished toolkit source preview: tokens, application-event payload
serialization and low-level transport. It is not an audited or complete encrypted
communication SDK. Encoding is not encryption; HTTP/socket connectivity does not
grant Room membership or execution authority. Resource validation and the full
verified Room/MLS owner remain separate integration requirements.

Do not post secrets, private keys, recovery material, customer messages, sensitive
logs or suspected vulnerability details in public issues. Private vulnerability
reporting for this new repository has not been verified. Use an established
private maintainer channel, or request one without including sensitive details.
Setup remains tracked in #28. No bounty or response-time commitment is implied.

Public transport source is pinned to an upstream candidate and must not become a
separate fork. Source equality is provenance, not independent security review.
Injected fetch/socket adapters and endpoint JavaScript are trusted integration
components; compromised client code is not contained by the transport wrapper.
Consume/cancel responses and close sockets deliberately; local cancellation is
not server rollback. Documentation describes exactly which byte, route, session
and ticket boundaries are implemented and tested.

No production-readiness, anonymity, legal compliance, availability or audit claim
follows from passing local tests. Full pinned-workspace, actual browser/server,
Rust/WASM and encrypted interoperability checks remain gates. Package publication
stays blocked pending licensing, source, compatibility and release review.
