# Image capture resource limits and feedback

New image downloads and popup image previews use the same bounded image pipeline.

- Maximum download: 20 MiB, checked using both Content-Length and actual streamed bytes.
  Reads stop and the request is aborted if the limit is exceeded; a missing or false
  Content-Length cannot bypass the streamed-byte limit.
- Download deadline: 15 seconds, including reading the response body.
- Maximum decoded dimensions: 24,000,000 pixels, and 16,384 pixels on either edge.
  Raster headers are inspected before native decoding; the decoded bitmap is checked again.
- Native decoding and preview/crop encoding each have a 15-second wait deadline.
  Bitmaps are closed on success and failure, including native decode results arriving late.
- One external image normalization runs at a time to bound concurrent memory consumption.
- Static PNG, JPEG, GIF and WebP are recognized from their bytes, not the response MIME label.
  SVG, unknown formats and animated PNG/GIF/WebP are rejected with a screenshot alternative.

These are conservative application limits, not a guarantee against every native decoder
bug or browser crash. A timed-out native decode/encode cannot be forcibly interrupted by
this API. Header preflight reduces allocation risk; late results are ignored and bitmaps
are released when available.

## User feedback

- Popup: localized errors stay visible until dismissed or replaced. Capture actions
  leave the busy state after errors or a 45-second missing-response deadline.
- Right-click image capture: failures appear in the isolated extension error iframe.
  A separate content-script watchdog also handles a missing background response.
- Region capture: both background errors and missing replies produce an on-page notice.
- Error notices offer region screenshot capture. They contain only fixed error codes/text;
  no item, category or tag data is exposed to the host page.
- If page injection is blocked, a toolbar badge marks the issue. Opening the popup shows
  the recent issue. Errors expire after five minutes and clear on navigation or successful
  capture. Session storage preserves recent issues across background restarts where supported.
- Download/decode failures no longer silently save a remote image URL and report success.
  Existing library records that contain remote URLs are unchanged.
- If the item was saved but its toast could not be delivered, the badge/popup says it was
  saved and directs the user to Library. It does not report the saved item as a failed capture.
- A no-response notice says the outcome is uncertain and asks the user to check Library
  before retrying. Ending the UI wait does not roll back a late background save.

If the browser kills both the extension and the page renderer, an in-page notice cannot
be guaranteed. The independent page watchdog covers background failures while the page
renderer remains alive.

## Verification

Unit coverage includes claimed and actual download-size limits, stalled headers/body,
pre-decode dimensions, unsupported/animated formats, bitmap cleanup, late native decode,
stuck encoding, concurrent downloads, and UI missing-response deadlines.

Build/type checks: `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm build:firefox`.
Browser smoke checks use a disposable Chromium profile and local fixtures to exercise
popup failure, right-click failure, toolbar badges, screenshot fallback, normal raster
capture, and a background response that never arrives. Firefox is build-checked; live
Firefox interaction still needs a separate smoke check.

Header parsing references: [PNG specification](https://www.w3.org/TR/png/) and
[WebP container specification](https://developers.google.com/speed/webp/docs/riff_container).
