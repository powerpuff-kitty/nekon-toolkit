# @nekon/client-runtime — application-event codec preview

This staging package contains only the existing canonical application-event codec.
Its one export is `@nekon/client-runtime/application-event`. The normal runtime
root, transports, vault, synchronization, Room controllers and WASM adapters are
not included. The SDK wrapper in `@nekon/sdk/application-event` is the recommended
consumer surface; it imports this package instead of copying the codec.

There are no runtime dependencies. Build tools and tests stay in the repository,
outside the packed artifact. Package version `0.1.0-extraction.0` is private and
unpublished pending licensing/release review.

The emitted bytes are **not encrypted**. Decoder validation does not authenticate
participants or authorize operations. Content remains opaque and independently
owned; clearing an inspected buffer does not erase other copies. See the SDK
package guide for scope binding, lifecycle and security limitations.

The source is unchanged from the pinned upstream Git blob recorded in
`application-event-extraction.json`. The private messenger still uses its existing
implementation until coordinated source-ownership cutover; do not independently
modify this staging copy. A necessary fix requires an explicit upstream and public
review, not silently breaking the source-equivalence test.
