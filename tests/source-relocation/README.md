# Source relocation browser checks

`run.mjs` serves the fixed fixture through the Vite already used by WXT and exercises real layout, Range geometry, scroll containers, mutation handling, trusted input and cleanup. It does not replace geometry with DOM mocks.

Use an installed Playwright package (or pass its absolute `index.mjs` path in `PLAYWRIGHT_MODULE`). A browser executable can be selected with `CHROMIUM_PATH` or `BROWSER=firefox FIREFOX_PATH=…`.

```sh
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs CHROMIUM_PATH=/path/to/chromium node tests/source-relocation/run.mjs
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs BROWSER=firefox FIREFOX_PATH=/path/to/firefox node tests/source-relocation/run.mjs
```

To include the real Chrome extension capture/ready-handshake tests, build first and set `EXTENSION_CHROMIUM_PATH` to a Chromium executable that supports loading unpacked extensions. The test uses a temporary profile and removes it afterward. No user profile is accessed. Use a Playwright version compatible with the selected browser.

```sh
npm run build
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs CHROMIUM_PATH=/path/to/chromium EXTENSION_CHROMIUM_PATH=/path/to/chromium node tests/source-relocation/run.mjs
```

The optional runner requires a free loopback port and permission to launch browsers. The fixture image reuses the repository's existing icon; URL identities deliberately differ even when pixels match. Ordinary relocation uses saved content evidence. Observed detail-link verification additionally requires identical raster file bytes (SHA-256); it does not use visual similarity. A second fixture serves different bytes to assert fallback to the original source.

## Live Sportag reproduction (opt-in)

`tests/source-relocation/sportag.mjs` opens the supplied public event album in a disposable Chrome profile with the actual built extension. It clicks a photo preview, captures through the trusted library API, revisits the source, verifies the exact thumbnail's persistent active outline, and dismisses it. A second revisit changes only the saved signing envelope to test expired evidence with the same resource and photo label. It does not invoke private site APIs, log in, or purchase anything; no signing query values are printed.

```sh
npm run build
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs EXTENSION_CHROMIUM_PATH=/path/to/chromium node tests/source-relocation/sportag.mjs
```

The generic foreground-preview behavior and node reuse have deterministic local regressions in `run.mjs`; external page/network availability is required only for this opt-in smoke test. `CASE_FILTER` can select a local check by name. Site-specific test selectors are confined to the live reproduction, never production rules.

## Missing automatic script registration regression

Set `NO_AUTO_CONTENT_SCRIPT=1` with `EXTENSION_CHROMIUM_PATH` to copy the built extension into the disposable profile and remove only its manifest `content_scripts` entries. This reproduces the missing registration condition without modifying the actual built extension. Capture still uses its normal on-demand injection; source revisits must recover through the new page-ready probe/injection path.

Both native integration runners now click the actual library link. The live runner defaults to the reported photo ID `29340315`; override `SPORTAG_PHOTO_ID` for another loaded photo. It also verifies repeated capture returns the same item. Diagnostic failures report page status without image signing queries.

## Live in-place pagination reproduction (opt-in)

`zsport.mjs` waits for a second-page photo absent from the initial list, opens its preview, captures via the built extension, and checks that a genuinely observed adjacent same-origin link opens the matching standalone image with active styling. Only the test contains site selectors. Production neither guesses photo routes nor calls private APIs.

```sh
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs EXTENSION_CHROMIUM_PATH=/path/to/chromium node tests/source-relocation/zsport.mjs
```

Local fixtures also cover manual pagination followed by retry, byte-identical images across distinct URLs, verified-link persistence, original-source preservation, and different-byte rejection/fallback.
