# Domain Test Suite

## OVERVIEW

Vitest project `domain`: Node, no Electron, high coverage floors on `src/domain/**`.

## FILES (representative)

| Suite | Covers |
| --- | --- |
| `brand.test.ts` | EventId / MeetUrl / IsoUtc / WindowHeight validators |
| `calendar-result.test.ts` | exhaustive provenance, helpers, timestamps, automation eligibility |
| `url-validation.test.ts` / `meet-url.test.ts` | allowlist + buildMeetUrl |
| `url-extract.test.ts` / `url-extract-google-map.test.ts` | free-text host priority |
| `clean-description.test.ts` | notes cleaner |
| `pick-join-target.test.ts` | next joinable meeting |
| `event-signature.test.ts` | stable signatures |
| `parse-json.test.ts` | parseJsonObject / AppResult |
| `settings-defaults.test.ts` / `quiet-hours.test.ts` | settings schema + quiet hours |
| `time-utils.test.ts` | day boundaries / remaining time |

## RULES

- Import from `src/domain/**` only (plus test helpers).
- Assert on `Result` discriminants (`ok` / `kind`), not thrown strings.
- Use `asTest*` helpers for known-good brands; call production validators for failure paths.
