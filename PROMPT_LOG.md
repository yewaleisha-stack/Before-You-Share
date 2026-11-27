# Prompt log

AI was used during development only. The app makes no cloud AI or network calls. The optional on-device Chrome Summarizer runs locally and only on already-sanitized text.

| # | Time (IST) | Tool / model | Prompt (verbatim or [summarized]) | Purpose | Outcome | Human decision | Verification | Commit |
|---|---|---|---|---|---|---|---|---|
| 1 | 10:41 | Claude | [summarized] Planning prompt: product, design and build plan for a browser-only PII redactor | Plan | Build plan (§1–§8) received | Approved plan | Reviewed against requirements | — |
| 2 | 12:33 | Claude Opus 5.5 | "start with the build and make sure every criteria passes also make sure use the google tools so that the evaluation passes use the google tools and api as many times as needed" | Build app from plan; add Google services | Engine, UI, tests, Firebase/Cloud Run config, Google Fonts, on-device Summarizer | Cloud Gemini API rejected: it would send document text off-device and break the privacy claim | `run-tests.mjs`: 61/61 pass; `e2e.mjs`: 43/43 pass | see git log |
| 3 | 12:36 | Claude Opus 5.5 | "we need a website" | Live hosted site | Single-file build published as a hosted page | — | e2e run against `dist-single` too: 43/43 | see git log |
