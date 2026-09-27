# DEV-LOG — autonomous portability fix (2026-09-27)

Driven by a self-driving Python harness (`design → draft → apply → validate
→ commit`, ~11 iterations) calling the model roster directly via `curl`
against OpenAI-compatible `/chat/completions` endpoints, with resilient
per-role fallback chains. No changes were committed that broke a
previously-passing check.

## The problem this session found

A fresh clone of `erised-mirror` (this checkout) could not run **any** of
its 13 tools:

- `quilt-toolkit.mjs` had an unconditional, top-level `import { QuiltEngine }
  from '/home/z/my-project/quilt-playtest/packages/core/dist/index.js'` —
  an absolute path from the original multi-repo dev workspace. Because it's
  top-level, it poisoned the *whole module* for every importer, including
  tools 11/12/13, which never touch `sheet()`/`QuiltEngine` at all.
- `tools/erised-lib.mjs`, `tools/12-erised-trends.mjs`, and
  `tools/13-erised-embassy.mjs` each imported `../../quilt-stone/stone.mjs`
  or `verifyChain`/`canonicalJSON` from it — a sibling repo that doesn't
  exist in this standalone checkout.

None of this was a logic bug; it was a portability bug the README's own
promise ("no build step, no config") didn't yet cover for a single-repo
mirror clone.

## The fix

Rather than reimplement the missing `QuiltEngine` (a whole reactive-cell
engine — out of scope, too large to guess blindly) or the missing
`quilt-stone` module from scratch, the fix **reuses logic this repo already
carries and has already tested**:

1. `quilt-toolkit.mjs`: `QuiltEngine` is now loaded lazily inside `sheet()`
   via `await import(...)`, cached after first load, with a `QUILT_DIST`
   env override and a clear thrown error (naming the missing path and that
   it only affects tools 01-10) instead of a raw `ERR_MODULE_NOT_FOUND`.
   `sheet()` is now `async`; all 10 call sites in tools 01-10 got a
   mechanical `await` added (no LLM call needed for that one-token change).
2. `tools/erised-lib.mjs`: the missing `stoneVerify` import was replaced
   with a **local dialect-dispatch function of the same name**, so nothing
   else in the file changed. It reads `row_hash` hex length to pick a
   dialect: 16 hex chars → this repo's own fnv1a64 witness scheme
   (`verifyChain` from `quilt-toolkit.mjs` — confirmed by inspecting
   `trends/witness.jsonl`/`embassy/witness.jsonl`, whose row_hash values are
   16 hex chars) with `alg: 'quilt-fnv1a64'`; 64 hex chars → the `stone-v1`
   sha256 scheme (`verifyStoneV1` from `tools/embassy-lib.mjs`, which
   tool 13 already carries as a **KAT-gated, from-spec reimplementation**
   built specifically so tool 13 never had to import the missing module);
   anything else honestly reports `ok:false` with a reason, matching the
   repo's existing "honest verdict, never a silent guess" idiom.
3. `tools/12-erised-trends.mjs` and `tools/13-erised-embassy.mjs`: their
   `canonicalJSON` import was repointed at `tools/embassy-lib.mjs` (same
   STONE-SPEC §5 algorithm, already vendored there).
4. `tools/embassy-lib.mjs`: `loadToken()` now falls back to
   `process.env.GH_TOKEN` when the workspace-relative `.env` file isn't
   present (the normal case in a standalone checkout), never logging or
   throwing on the value.

Validated with isolated per-file smoke tests (a synthetic 3-row chain of
each dialect plus an unknown-dialect case run through the real
`scanChains()`, not just "imports without crashing"), then end-to-end: all
three previously-crashing tools (`11`, `12`, `13`) now run to completion,
and tools 01-10 now fail with one clear, actionable error instead of a raw
stack trace when the (out-of-scope) engine dist is genuinely absent.

## Per-model performance

| Role (chain) | Calls served | Provider that served | Fallbacks fired |
|---|---|---|---|
| design (zai → deepseek-reasoner → deepinfra) | 5/5 | **deepseek/deepseek-reasoner**, every time | **zai/glm-5.3 failed all 5/5** — `429 insufficient balance` (unfunded, exactly as the mission brief predicted); deepseek-reasoner picked up every one within ~10-16s |
| cheap (deepseek-chat → zai-flash → deepinfra-8B → deepinfra-70B) | 15/15 | **deepseek/deepseek-chat**, every time | none — deepseek-chat never failed |
| sound (deepinfra-405B → deepinfra-seed → deepseek) | 2/2 | **deepinfra/Hermes-3-Llama-3.1-405B**, every time | none |

- **z.ai (GLM-5.3) was unreachable for the entire session** — `HTTP 429
  {"code":"1113","message":"Insufficient balance or no resource package."}`
  on all 5 attempts. The resilient chain absorbed this transparently every
  time; deepseek-reasoner never noticeably degraded quality for the design
  role.
- **Kimi was never called** — it isn't in any of the three defined chains
  (present in env, unused by design).
- deepinfra's `NousResearch/Hermes-3-Llama-3.1-405B` served the sound role
  correctly both times (~7-26s latency); `ByteDance-Seed/Seed-OSS-36B-Instruct`
  was never needed.

## Cache / cost (O10)

All calls in a role shared a byte-identical ~4KB stable system-prompt prefix
(repo diagnosis + constraints); only the per-file task tail varied. DeepSeek
reports native prompt-cache accounting:

- 22 served calls total: **75,401 prompt tokens, 55,208 completion tokens**.
- **51,712 of the 75,401 prompt tokens were cache hits (~68.6%)** — later
  calls in the same role routinely hit 4,800-5,100 cached tokens out of
  ~5,300 prompt tokens, confirming the stable-prefix strategy worked as
  intended on DeepSeek's backend.
- deepinfra/Hermes-405B calls (sound role) don't report cache-hit
  accounting in their usage payload; no cache signal available there.

## Surprises

- **My own validation harness had two bugs, not the model's drafts.** The
  first cut of `draft_and_apply()` ran the *full* 3-tool suite as its
  pass/fail gate for every single-file edit; a genuinely-correct
  `quilt-toolkit.mjs` draft got rejected 3 times in a row because
  `erised-lib.mjs`'s *unrelated, not-yet-fixed* bug still crashed tools
  12/13. Fixed by isolating validation per file (import-only smoke tests,
  then one functional dispatch test for `erised-lib.mjs`, then a full
  end-to-end pass only at the very end). Second bug: my synthetic
  fnv1a64-dialect test chain used `JSON.stringify()` instead of
  `quilt-toolkit`'s own `canon()` (which sorts keys) to build row hashes —
  a hand-rolled hash that the real `verifyChain` correctly rejected as
  broken. Both were caught by reading the actual error rather than assuming
  the model was wrong.
- **Tool 13 (`erised-embassy`) does real, live network verification** — this
  run made genuine `raw.githubusercontent.com` CDN fetches of a stranger
  repo's chain artifact (`pong-quilt/checkpoints/stone-v1.json`) and
  independently re-verified its stone-v1 hash chain from published
  arithmetic alone. That worked end-to-end the first time the tool could
  even *run* in this checkout.
- **This session's GitHub token is scoped to `erised-mirror` only** (an
  explicit, intentional authorization boundary of this environment, not a
  bug). Tool 13's org-wide census (GraphQL, then REST-top-300 fallback)
  and tool 12's sibling-repo discovery both honestly report degraded/empty
  results here — `0 repos` census, `1 repo` (itself) for the mirror — not
  because the fix is wrong, but because this container is genuinely a
  single-repo mirror with a narrowly-scoped token, unlike the
  full multi-repo/full-org workspace the historical `wave-001..003` data
  was captured from.
- **Deliberately did not commit new wave/witness data.** Running tools
  12/13 in this validate pass produced real `trends/wave-004.json` and
  `embassy/wave-003.json` + witness-chain rows — but both reflect this
  session's narrower environment (1 repo instead of ~11-12; a 0-repo org
  census instead of ~5030), not genuine fleet activity. Appending those to
  the append-only historical ledgers would have permanently misrepresented
  the fleet's real history ("the org shrank to zero repos"). Those
  artifacts were generated, inspected, and then discarded rather than
  committed — the code fix is real and green; a legitimate *next* wave
  should be captured from the full workspace this tooling was designed for.
  `outputs/11-erised.json`, `outputs/12-erised-trends.json`, and
  `outputs/13-erised-embassy.json` (freely-overwritable latest-sweep
  snapshots, not historical ledgers) were updated to reflect that the tools
  now run, with their check failures honestly attributable to this
  environment rather than the code.

## What's still open (not attempted this session, out of scope)

- Tools 01-10 remain unable to *fully* run (they need the real `QuiltEngine`
  dist, which is a whole reactive-cell engine — sensor/formula/listener/
  program/value cells, `AsyncFunction`-executed program bodies, a
  `runtime.get/set` API — far too large to reimplement blindly without the
  reference source to check against). They now fail loudly and clearly
  instead of silently poisoning every other tool's import, which was this
  session's actual, bounded goal.
- A genuine next wave-004 (trends) / wave-003 (embassy) capture should be
  run from the full multi-repo SuperInstance workspace with an org-scoped
  token, not from this mirror-only checkout.
