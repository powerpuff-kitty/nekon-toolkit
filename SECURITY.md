# Security status and reporting

This is an unpublished public toolkit source preview. The initial package
contains design tokens and developer build tooling, not an audited communication
SDK. Local tests do not establish NEKON's encryption, authorization, availability,
anonymity, legal compliance or production readiness.

Do not include secrets, private keys, recovery material, customer messages or
sensitive logs in public issues or pull requests. GitHub private vulnerability
reporting has not yet been verified for this new repository. Use the repository's
private reporting option only when available; otherwise open a content-free
request for the maintainer to establish a private reporting channel. Do not post
exploit details publicly while that channel is unresolved. Setup is tracked in #28.

Future SDK extraction must retain existing security invariants and run real
browser/Rust/WASM integration checks. Public tokens never grant identity,
permissions, membership or decryption authority. Package publication remains
blocked pending source, licensing and release review (#3/#21/#28).
