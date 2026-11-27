# Before You Share

Before You Share redacts emails, phone numbers, IP addresses, PAN, Aadhaar and card numbers in your browser. Before you send a ticket, log or CSV, it shows you every removal and what replaces it.

Built for **PromptWars × NIAT Pune** (Google for Developers · H2S).

## What it does

- **Three modes.** Full mask (`[REDACTED]`), Partial mask (last 4 digits, email domain, first IP octets), and Pseudonymize (`EMAIL_01`, where repeated values share one alias).
- **Linked review.** Select any highlight in either pane and its counterpart is outlined in the other, linked by match ID rather than character offset. Keyboard: focus a pane, then use ↓/↑ (or J/K), Home/End and Esc.
- **Live privacy seal.** The header counts network requests made after load, using the browser's own resource timing (web-font files excluded). It stays at 0 while you work.
- **Shows what it left alone.** A card-shaped number that fails the Luhn check is marked "NOT CARD" and reported in the status line.
- **CSV-safe.** Replacements are made in the raw text, so headers, quoting, CRLF line endings, leading zeros and a BOM all come through unchanged.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # Vitest unit tests
npm run build      # dist/ with Content-Security-Policy
npm run test:e2e   # browser acceptance checks (needs: npx playwright install chromium)
```

## Google services

| Service | Use | Privacy impact |
|---|---|---|
| **Firebase Hosting** (`firebase.json`) | Static hosting with CSP and security headers | Serves files only |
| **Google Cloud Run** (`Dockerfile`, `nginx.conf`) | Alternative container deploy: `npm run deploy:cloudrun` | Serves files only |
| **Google Fonts** | Instrument Sans / JetBrains Mono | Font files only; falls back to system fonts offline |
| **Chrome built-in AI: Summarizer API (Gemini Nano)** | Optional "Summarize sanitized text on this device" | Runs on-device. Receives only the *sanitized* result. Hidden when the browser doesn't support it |
| **GitHub Action → Firebase Hosting** | CI: test, build, deploy | — |

The app makes **no cloud AI calls**. That is deliberate: sending the raw document anywhere would break the privacy promise.

## Privacy model and how to verify it

- All detection and redaction runs in the page. There is no `fetch`, `XMLHttpRequest`, `sendBeacon`, `WebSocket` or `localStorage`.
- The production build ships a CSP with `connect-src 'none'`, so the page cannot send data anywhere even if it tried.
- To verify it yourself: open DevTools → Network, clear it, load the sample, switch modes and download. Nothing new appears except the `blob:` download. Then turn on Offline mode; everything still works.

## Detection scope

The tool detects six types only: email, phone (India-first, plus `+` international numbers), IPv4/IPv6, PAN, Aadhaar and payment card. **It does not detect names, addresses or other free text.**

Conflicts are resolved in this order: a Luhn-failing card-shaped run suppresses numeric matches inside it; the longest span wins; ties go by priority EMAIL > CARD > IP > AADHAAR > PAN > PHONE; a 12-digit `91[6-9]…` value is a phone.

## Known limitations

- Aadhaar is a format match only. There is no Verhoeff checksum, so 12-digit numbers such as `202611271042` are over-redacted.
- PAN is a format match only.
- Phone coverage is India-first. US numbers without `+` aren't detected, and landlines aren't supported.
- There is no card IIN check. Luhn lets about 10% of random 13–19 digit numbers through, and those are over-redacted.
- Filenames aren't scanned.
- Editing in the textarea converts CRLF to LF; a notice appears when this happens.
- Pseudonyms are a pure function of the current text, so an edit can renumber them.
- Source text that already contains a token like `EMAIL_01` is ambiguous in the output.

## Tests

The unit tests in `tests/` use the Vitest API. In the build environment vitest couldn't be installed (no network), so they were run through `scripts/offline/run-tests.mjs`, which maps the same tests onto `node:test`:

```
ℹ tests 61
ℹ suites 16
ℹ pass 61
ℹ fail 0
```

Browser acceptance checks (`scripts/e2e.mjs`, Playwright/Chromium) were run against the built site:

```
43 passed, 0 failed
```

They cover T1, T2, T16–T19, T21–T26, plus a 375 px layout check.

## Measured

- **1 MB input**, from paste to the review render in headless Chromium: about **0.3 s** for a realistic log (1,950 matches) and about **2.4 s** for a worst case with a match every ~25 characters (40,539 matches). The detection engine alone takes ~0.17 s; the rest is DOM rendering. The 1 MB limit stays.
- **Contrast (light / dark):** entity colors 5.5–6.9:1 / 7.7–10.1:1; text on highlight tints ≥ 15.5:1 / ≥ 11.5:1; the Download button 5.4:1; muted text ≥ 4.9:1 (WCAG AA needs 4.5:1).
- **Light and dark themes** follow the system setting.

## Licences

Instrument Sans and JetBrains Mono are licensed under the SIL Open Font License 1.1 and served by Google Fonts.
