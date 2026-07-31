# popover-middle-truncate-meeting-title - Work Plan

## TL;DR (For humans)

**What you'll get:** Long meeting titles in the popover list no longer stretch the narrow window. Titles longer than 12 characters are shortened in the **middle** so both the start and the end stay visible (for example `Weekly…ting`), while hovering still reveals the full title.

**Why this approach:** The popover is a fixed 360px list. CSS end-ellipsis already exists but does not preserve the distinctive end of a title (often the useful part: project name, room, time). A pure character-based middle-truncate helper keeps behavior deterministic, testable, and reusable later if the tray menu needs the same rule.

**What it will NOT do:** It will not change calendar data, join IDs, alerts, settings, tray native menu labels, tray countdown text, notifications, or how titles are stored. The full title remains available for accessibility and tooltips.

**Effort:** Small  
**Risk:** Low — pure display transform at the popover render boundary; no IPC, scheduler, or provider work.  
**Decisions to sanity-check:**

1. **Max length = 12 total characters** (including the ellipsis token), as specified for this task. That is intentionally aggressive in a 360px list (~half a short word + ellipsis + short tail). Confirm before shipping if product prefers a wider cap (e.g. 24–36) later.
2. **Ellipsis token:** single Unicode ellipsis `…` (`U+2026`, same family as tray truncation) so the budget for head/tail under 12 is larger than ASCII `" ... "` (5 chars). Display still reads as “start … end”.
3. **Scope = popover only** (upcoming + completed-today rows). Tray native menu and alert overlay keep full titles for this PR unless explicitly expanded.
4. **Count Unicode code points**, not UTF-16 code units, so emoji/title symbols do not split oddly.

Your next move: execute Wave 1 (pure helper + tests), then Wave 2 (wire popover render + CSS harden + body tests). Full execution detail follows below.

---

> TL;DR (machine): Small effort, low risk; pure `truncateMiddle` (max 12, code-point aware) in domain + apply in popover `renderBody` with full title retained in `title`/aria; no settings/IPC/scheduler.

## Background & problem

| Observation | Detail |
| --- | --- |
| Popover width | Fixed **360px** (`src/renderer/styles/main.css`, `src/renderer/AGENTS.md`) |
| Current title paint | `escapeHtml(event.title)` into `.meeting-title` in `src/renderer/rendering/body.ts` (upcoming **and** completed history) |
| Existing CSS | `.meeting-title` already has `white-space: nowrap; overflow: hidden; text-overflow: ellipsis` — **end** clip only |
| Flex risk | `.meeting-title` uses `flex: 1` without `min-width: 0`, so long unbreakable titles can still force the row wider than the window (classic flex overflow bug) |
| Full title already tooltipped | `title="${escapeHtml(event.title)}"` on the span — good place to keep the untruncated string |
| Join a11y | `aria-label="Join ${escapeHtml(event.title)}"` should keep the **full** title |
| Prior art (not middle) | Tray countdown uses **prefix** truncation (`title.slice(0, N) + "…"`) in `src/main/tray.ts` — different surface; do not conflate |

### Target visual contract

| Input length | Display |
| --- | --- |
| ≤ 12 code points | unchanged |
| > 12 code points | `head + "…" + tail` with `head.length + 1 + tail.length === 12` (when using single-char `…`) |

**Illustrative examples** (code-point length; `…` = 1):

| Full title | Displayed (max 12) |
| --- | --- |
| `Standup` | `Standup` |
| `Weekly Product Sync` | `Week… Sync` ≈ balanced head/tail (exact slices locked by unit tests) |
| `Q3 Planning – Design Systems Review` | `Q3 P…view` style middle clip |

User-facing mental model matches: *something at the beginning … something at the end*.

### Exact truncation algorithm (normative)

Implement as pure:

```ts
truncateMiddle(text: string, maxChars: number = 12, ellipsis: string = "…"): string
```

Rules:

1. Normalize input: if `text` is empty, return `""`.
2. Measure with **code points**: `const cps = Array.from(text)` (not `text.length` alone for surrogate pairs).
3. If `cps.length <= maxChars`, return `text` unchanged.
4. If `maxChars <= 0`, return `""`.
5. Let `e = Array.from(ellipsis)`; require `e.length >= 1`. If `maxChars <= e.length`, return only as much of the ellipsis as fits in `maxChars` (typically `"…"` when max is 1).
6. Let `budget = maxChars - e.length` (characters available for head + tail).
7. Prefer slightly longer head when budget is odd:  
   `headLen = Math.ceil(budget / 2)`, `tailLen = Math.floor(budget / 2)`.
8. Return `cps.slice(0, headLen).join("") + ellipsis + cps.slice(cps.length - tailLen).join("")`.
9. **Do not** trim spaces at the cut boundary in v1 (deterministic; avoids surprising word-boundary heuristics). Document that leading/trailing spaces inside head/tail may appear if the title itself has them at the cut.

Constants (export for tests/call sites):

| Constant | Value | Home |
| --- | --- | --- |
| `MEETING_TITLE_DISPLAY_MAX_CHARS` | `12` | same module as helper |
| Default ellipsis | `"…"` (`\u2026`) | same module |

## Scope

### Must have

- Pure domain (or domain-adjacent) helper `truncateMiddle` + exported max constant **12**.
- Unit tests covering: short titles, exact-12, exact-13, very long, empty, whitespace-only, multi-code-point emoji, custom max edge cases (`maxChars` 0/1/2/3), odd/even budget balance.
- Popover body renderer applies middle-truncation to **visible** title text for:
  - upcoming/active rows in `has-events`
  - completed-today history rows
- Preserve **full** `event.title` (escaped) on:
  - HTML `title` attribute (hover tooltip)
  - Join button `aria-label` (`Join ${fullTitle}`)
- Harden CSS so flex layout cannot grow past the row: `.meeting-title { min-width: 0; }` (keeps layout stable even if a future path paints untruncated text).
- Escape order: **truncate first, then `escapeHtml` on the display string**; separately `escapeHtml` the full title for attributes.

### Must NOT have (guardrails)

- Do **not** mutate `MeetingEvent.title` in providers, cache, domain entities, or publications.
- Do **not** change settings schema, IPC, scheduler, join paths, auto-open, or alert payloads.
- Do **not** change tray native menu labels or tray countdown truncation in this plan (separate follow-on if desired).
- Do **not** implement CSS-only middle ellipsis (unsupported portably; character truncate is the product requirement).
- Do **not** use word-boundary ML or locale-aware hyphenation.
- Do **not** truncate calendar names, relative time labels, or footer copy.
- Do **not** add a user-facing settings toggle for max length (fixed constant for v1).

## Architecture

```text
                    MeetingEvent.title (full, unchanged)
                              │
                              ▼
              domain/services/truncate-middle.ts
                 truncateMiddle(title, 12)
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
   displayTitle (≤12)                  full title
   escapeHtml → body text              escapeHtml → title= / aria-label=
              │
              ▼
   src/renderer/rendering/body.ts  (popover only)
```

| Layer | Change? | Why |
| --- | --- | --- |
| `src/domain/services/truncate-middle.ts` | **Add** | Pure, high coverage floor, reusable |
| `src/renderer/rendering/body.ts` | **Edit** | Sole popover paint site for titles |
| `src/renderer/styles/main.css` | **Edit** | `min-width: 0` flex harden |
| `tests/domain/truncate-middle.test.ts` | **Add** | Algorithm lock |
| `tests/renderer/rendering/body.test.ts` | **Edit** | Assert display vs tooltip |
| Providers / Swift / Google | No | Titles stay full fidelity |
| Tray / alert | No (this plan) | Explicit out of scope |

### Why domain, not renderer-only?

- Vitest project `domain` has high floors and no jsdom.
- Future tray/menu middle-truncate can import the same helper without renderer coupling.
- Matches existing pure display helpers (`meeting-time`, `time`).

## Verification strategy

> Zero human intervention — all verification is agent-executed.

- **Test decision:** tests-with-implementation (helper first), Vitest workspace `domain` + `renderer`.
- **Evidence:** `.omo/evidence/task-<N>-middle-truncate-title.txt` for each todo’s command output.
- **Assertions style:**
  - Helper: exact string equality for known fixtures.
  - Body: `textContent` / HTML contains truncated form; `title="..."` attribute still has full escaped title; Join aria still full; XSS still escaped after truncate.
- **Non-goals for verification:** no Electron screenshot gate required for this small display change; optional local `bun run dev` smoke is nice-to-have only.

## Execution strategy

### Parallel execution waves

- **Wave 1:** Todo 1 (helper + domain tests) — unblocks everything.
- **Wave 2:** Todos 2 and 3 in parallel after Todo 1 (wire body; CSS harden). Todo 3 has no code dep on Todo 2 but should land with it for one visual PR if preferred as a single commit.
- **Wave 3:** Todo 4 focused cross-suite verification.

### Dependency matrix

| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| 1 | None | 2, 4 | — |
| 2 | 1 | 4 | 3 |
| 3 | None (recommended after 1) | 4 | 2 |
| 4 | 1, 2, 3 | Final | None |

## Todos

> Implementation + Test = ONE todo. Never separate.

- [x] 1. Add pure middle-truncate helper and lock algorithm with domain tests  
  **What to do / Must NOT do:** Create `src/domain/services/truncate-middle.ts` exporting `MEETING_TITLE_DISPLAY_MAX_CHARS = 12`, default ellipsis `"…"`, and `truncateMiddle(text, maxChars?, ellipsis?)` implementing the normative algorithm above. Add `tests/domain/truncate-middle.test.ts` with fixtures for short, boundary 12/13, long ASCII, empty, emoji (e.g. `"🚀 Launch planning sync"`), and edge `maxChars` values. Do not import Electron/DOM. Do not wire renderers yet.  
  **Parallelization:** Wave 1 | Blocked by: none | Blocks: 2, 4  
  **References:** `src/domain/services/` (neighbor modules for style); `src/domain/AGENTS.md`; `tests/domain/AGENTS.md`; tray prefix truncate for contrast only (`src/main/tray.ts` `formatTrayCountdownLabel` — do not copy).  
  **Acceptance criteria:**  
  - `truncateMiddle("abcdefghijkl")` → same (12).  
  - `truncateMiddle("abcdefghijklm")` → length 12, starts with head of original, ends with tail of original, contains exactly one default ellipsis.  
  - Empty → `""`.  
  - Code-point: a string of 13 emoji code points truncates to 12 code points total including ellipsis.  
  - Domain suite green.  
  **QA:**  
  ```bash
  bunx vitest run -c vitest.workspace.ts --project domain tests/domain/truncate-middle.test.ts
  ```  
  Evidence: `.omo/evidence/task-1-middle-truncate-title.txt`  
  **Commit:** Y | `feat(domain): add middle-truncate helper for meeting titles`

- [x] 2. Apply middle-truncation in popover body (upcoming + completed)  
  **What to do / Must NOT do:** In `src/renderer/rendering/body.ts`, import `truncateMiddle` / `MEETING_TITLE_DISPLAY_MAX_CHARS`. For every user-visible meeting title span (upcoming row + `renderCompletedHistoryRow`), set:
  - span **text** = `escapeHtml(truncateMiddle(event.title, MEETING_TITLE_DISPLAY_MAX_CHARS))`
  - span **`title` attribute** = `escapeHtml(event.title)` (full)
  - Join **`aria-label`** = `Join ${escapeHtml(event.title)}` (full; only on upcoming rows with URL)  
  Do not truncate calendar name or time labels. Do not change `data-event-id`. Do not touch alert/settings/tray. Extend `tests/renderer/rendering/body.test.ts` with a long-title fixture asserting truncated visible text, full `title=` attribute, full join aria, and that XSS titles still escape after truncate.  
  **Parallelization:** Wave 2 | Blocked by: 1 | Blocks: 4  
  **References:** `src/renderer/rendering/body.ts` (~lines 41–55, 113–130); `tests/renderer/rendering/body.test.ts`; `src/shared/utils/escape-html.ts`; `src/renderer/AGENTS.md`.  
  **Acceptance criteria:**  
  - Long title fixture (length ≫ 12) appears middle-truncated in body HTML text.  
  - Same row’s `title="..."` still contains the full escaped original.  
  - Join button still present with full-title aria when `meetUrl` set.  
  - Malicious title `<script>` never appears raw in HTML.  
  - Short titles unchanged.  
  **QA:**  
  ```bash
  bunx vitest run -c vitest.workspace.ts --project renderer tests/renderer/rendering/body.test.ts
  ```  
  Evidence: `.omo/evidence/task-2-middle-truncate-title.txt`  
  **Commit:** Y | `feat(popover): middle-truncate long meeting titles`

- [x] 3. Harden popover title flex CSS so long content cannot widen the window  
  **What to do / Must NOT do:** On `.meeting-title` in `src/renderer/styles/main.css`, add `min-width: 0` (and keep existing nowrap/overflow/ellipsis as a secondary safety net for any untruncated path). Optionally add `overflow: hidden` already present. Do not change window width (360px). Do not redesign the Join button layout. No visual regression suite required beyond existing body tests.  
  **Parallelization:** Wave 2 | Blocked by: none | Blocks: 4  
  **References:** `src/renderer/styles/main.css` (`.meeting-item-row`, `.meeting-title` ~146–161).  
  **Acceptance criteria:** `.meeting-title` rule includes `min-width: 0` while retaining flex + ellipsis properties.  
  **QA:** Grep/assert in review; optional `bun run format:check` on CSS if required by CI.  
  Evidence: `.omo/evidence/task-3-middle-truncate-title.txt`  
  **Commit:** Y | `fix(popover): prevent title flex overflow in meeting rows`  
  *(May be squashed with Todo 2 if the branch prefers a single popover commit.)*

- [x] 4. Cross-layer focused verification  
  **What to do / Must NOT do:** Run domain + renderer focused suites together; ensure no accidental main/tray/test helper churn. Update `src/domain/AGENTS.md` and `src/renderer/AGENTS.md` with one-line pointers to the helper and the display rule (max 12, middle, full title on tooltip/aria). Do not add product docs beyond AGENTS. Do not bump app version.  
  **Parallelization:** Wave 3 | Blocked by: 1, 2, 3 | Blocks: final  
  **References:** all files from todos 1–3; `src/domain/AGENTS.md`; `src/renderer/AGENTS.md`.  
  **Acceptance criteria:** Focused suites green; AGENTS mention the contract; `git diff` limited to intended paths.  
  **QA:**  
  ```bash
  bunx vitest run -c vitest.workspace.ts --project domain tests/domain/truncate-middle.test.ts
  bunx vitest run -c vitest.workspace.ts --project renderer tests/renderer/rendering/body.test.ts
  bun run typecheck
  ```  
  Evidence: `.omo/evidence/task-4-middle-truncate-title.txt`  
  **Commit:** Y | `docs: note popover title middle-truncate contract in AGENTS`

## Test fixtures (suggested)

| Name | Title | Expected display (max 12, `…`) |
| --- | --- | --- |
| short | `1:1` | `1:1` |
| exact12 | `123456789012` | `123456789012` |
| exact13 | `1234567890123` | head/tail balance to total 12 with `…` |
| long | `Weekly Product Sync with Design` | middle form; length 12 |
| xss | `<img onerror=1>` | truncated **after** raw truncate then escaped entities in HTML |
| emoji | `🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀` (13 rockets) | 12 code points including `…` |

Exact expected strings for exact13/long must be asserted as **literals in the domain test file** once the head/tail formula is implemented (ceil/floor of budget) so they do not drift.

## Rollout / PR shape

| Option | When |
| --- | --- |
| **Single PR** on `truncated-meeting-title` | Preferred — feature is small and cohesive |
| Commits | 2–3 semantic commits as listed (domain → popover(+css) → docs) |

Suggested PR title: `feat(popover): middle-truncate meeting titles to 12 characters`

Suggested PR body bullets:

- Pure `truncateMiddle` (code-point aware, max 12, `…`)
- Popover list shows middle-truncated titles; full title on hover + Join aria
- CSS `min-width: 0` on `.meeting-title` to stop flex-induced wide layout

## Follow-ons (explicitly out of this plan)

| Idea | Why deferred |
| --- | --- |
| Apply same helper to tray native menu labels | Different surface; time suffix already competes for width; needs separate UX pass |
| Replace tray **prefix** countdown truncate with middle | Behavior change for menubar real estate; measure first |
| Configurable max length in Settings | Overkill for v1; constant is enough |
| Alert overlay truncation | Full-screen has room; full title is better for urgency |
| CSS `text-overflow: ellipsis` middle via experimental APIs | Not portable enough |

## Risks & mitigations

| Risk | Mitigation |
| --- | --- |
| Max 12 is too aggressive / looks sparse | Constant is one line; product can raise to 24/32 without API changes |
| Truncating before escape double-counts entities | Escape **after** truncate; never truncate HTML entities |
| Emoji / CJK width (display width ≠ code points) | Accept code-point model for v1; document; avoid CSS ch-based solutions |
| Tooltip missing on completed rows if attribute dropped | Keep `title=` on both row types |
| Screen readers only hear truncated text | Full title remains in `aria-label` on Join; consider `aria-label` on title span if future audit requires (optional follow-on) |

## Open question (resolve before or during Todo 1)

**Confirm max = 12 total** (this plan) vs **12 per side** (would yield ~12 + ellipsis + 12 ≈ 25–29 characters).  

This document implements **12 total** per the task statement. If product later chooses 12-per-side, only the constant and a few fixture expectations change — algorithm and call sites stay the same.

---

## Appendix: call-site checklist

| Call site | In scope? | Action |
| --- | --- | --- |
| `renderer/rendering/body.ts` upcoming title | Yes | Middle truncate display |
| `renderer/rendering/body.ts` completed title | Yes | Middle truncate display |
| `renderer/rendering/body.ts` Join aria | Yes | Keep full |
| `renderer/alert/index.ts` | No | Full title |
| `main/menu/meeting-menu.ts` | No | Full title |
| `main/tray.ts` countdown | No | Existing prefix truncate |
| Logs / notifications | No | Full title for diagnostics |

## Appendix: definition of done

- [x] Helper exported and covered under `tests/domain/`
- [x] Popover upcoming + completed titles middle-truncated at max 12
- [x] Full title on `title` attribute and Join `aria-label`
- [x] CSS flex overflow hardened
- [x] Focused domain + renderer tests green; typecheck green
- [x] AGENTS notes updated
- [x] No settings/IPC/provider/scheduler diffs
