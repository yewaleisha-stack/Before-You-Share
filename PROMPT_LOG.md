# Prompt log

AI was used during development only. The app makes no cloud AI or network calls. The optional on-device Chrome Summarizer runs locally and only on already-sanitized text.

| # | Time (IST) | Tool / model | Prompt (verbatim or [summarized]) | Purpose | Outcome | Human decision | Verification | Commit |
|---|---|---|---|---|---|---|---|---|
| 1 | 10:41 | Claude | [summarized] Planning prompt: product, design and build plan for a browser-only PII redactor | Plan | Build plan (§1–§8) received | Approved plan | Reviewed against requirements | — |
| 2 | 12:33 | Claude Opus 5.5 | "start with the build and make sure every criteria passes also make sure use the google tools so that the evaluation passes use the google tools and api as many times as needed" | Build app from plan; add Google services | Engine, UI, tests, Firebase/Cloud Run config, Google Fonts, on-device Summarizer | Cloud Gemini API rejected: it would send document text off-device and break the privacy claim | `run-tests.mjs`: 61/61 pass; `e2e.mjs`: 43/43 pass | 9083aae |
| 3 | 12:36 | Claude Opus 5.5 | "we need a website" | Live hosted site | Single-file build published as a hosted page | — | e2e run against `dist-single` too: 43/43 | 9083aae |
| 4 | 12:52 | Claude Opus 5.5 | "is everything build according to our discussion" | Audit against plan | Found O(n²) overlap check (1 MB worst case 3.9 s → 2.4 s), Done button disabled for 150 ms after first paste; both fixed. Contrast and 1 MB timing measured | Kept the 1 MB limit (realistic 1 MB log renders in 0.3 s) | unit 61/61, e2e 43/43 after fixes | 0798587 |
| 5 | 12:58 | Claude Opus 5.5 | "improve the front end change colour schemes button and everything … make it look like … top designer … check all the frameworks and backend … run the webpage locally" | Visual redesign + re-verification | New paper/ink palette with a signal-red export button, segmented mode control, icon buttons, solid black redaction bars in Full mask, review dock with key hints, dark theme, live request counter | Kept every plan behaviour, ID and microcopy | Contrast measured; unit 61/61, e2e 43/43 on three builds | (next commit) |
