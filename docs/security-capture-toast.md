# Capture toast isolation

The on-page capture toast runs in `capture-toast.html`, an extension-origin iframe.
The host content script positions the frame but does not receive organizer data or
captured image records. The existing popup remains an extension-owned interface.

## Authorization

- The background creates a random, five-minute capability for one captured item and tab.
- The content script delivers it directly to the iframe with an exact target origin.
  It never appears in DOM attributes, URLs, or messages to the host window.
- The iframe authenticates over a runtime port. The background verifies the browser-
  supplied extension URL, extension ID, tab and non-top-level frame ID, then binds
  the capability to that frame once. Invented and replayed capabilities are rejected.
- The port allows only organization, opening the library, and undo for its bound item.
  A requested item ID cannot select another record. Duplicate captures cannot be undone.
- Embedded documents and content scripts cannot use the full popup/library message API.
- Closing/removing the iframe, navigation, tab closure, replacement and expiry revoke
  authorization. Background restarts discard capabilities and fail closed.
- Synthetic click/input/key events are blocked in the toast. Region capture submission
  also requires a trusted click or key event.

Only the toast HTML is web-accessible; being able to embed that URL does not authorize
access to any item. Parent-window messages carry only close/height notifications.

## Verification

`pnpm test` includes capability checks for wrong secrets/tabs/frames, replay, expiry,
replacement and revocation. Run `pnpm typecheck`, `pnpm build`, and
`pnpm build:firefox` for compile/package checks.

Browser smoke checks use a separate Chromium profile and a local test page:

1. Capture a region; confirm the preview and organizer render in the extension frame.
2. Confirm host `iframe.contentDocument` is null, no private toast DOM is present in
   the host document, and the frame URL contains no capability.
3. Expand the organizer, create/select a collection, add a tag and save.
4. Embed another copy of the toast URL and supply an invented capability; it stays blank.
5. A synthetic click on Undo does nothing; the embedded frame cannot call the general
   organizer message API. A genuine Undo deletes the new item and closes the toast.
6. Check both mouse and keyboard interaction in a visible browser. The cached headless
   Chromium used during development did not dispatch mouse events to extension frames.

Firefox packaging is checked separately; live Firefox interaction requires a manual
smoke check with the packaged extension.

## Remaining boundary

The host still controls iframe placement and can hide, remove or cover it. This design
protects data from host DOM reads and blocks synthetic actions; it does not eliminate
clickjacking involving actual user clicks. The toolbar popup offers stronger UI isolation.
