# Quilt Tools — ten working prototypes, one reactive runtime

Ten tools built on [SuperInstance/quilt](https://github.com/SuperInstance/quilt)
(v0.3.0, the play-test-patched engine — 11 patches, all 36 upstream tests green).
Each tool is a single file, runs in seconds, ends with its own verification
verdict, and is deliberately shaped so an engineer can lift the pattern and
drop in their use case.

**Latest sweep: 75/75 checks green across all ten.**

```bash
node tools/01-fleet-pager.mjs        # any tool, no build step, no config
```

Most tools run fully offline. `04-triagedesk` upgrades itself to live GLM when
the model is reachable — the fence behaves identically in both modes and the
mode is printed, never silent.

## The portfolio

| # | Tool | Realm | The one-line pitch | Checks |
|---|------|-------|--------------------|--------|
| 01 | `fleet-pager` | DevOps / SRE | Golden signals → burn rates → one severity score → edge-triggered pages with hysteresis; every page receipted. | 7/7 |
| 02 | `ledger-seal` | Security / compliance | A tamper-evident audit ledger in ~60 lines: the verifier pins the *exact row* where a silent edit broke the chain. | 6/6 |
| 03 | `ocean-recall` | Knowledge management | Team memory with remember / recall / forget; honest misses ("absence is information"); the memory's own history is hash-chained. | 7/7 |
| 04 | `triagedesk` | Support / helpdesk | System One triage: Score / Choice / Noul with the schema fence in the adapter — the adversarial ticket's BANANA never reached the sheet. | 8/8 |
| 05 | `budget-tide` | Personal finance | Envelopes that *refuse*, not envelopes that judge: the tide-out gate stops the money before it moves; the refusal is itself a witnessed event. | 8/8 |
| 06 | `home-ecos` | IoT / smart home | A learned EWMA baseline catches the 2am forgotten heater that no fixed threshold can see; HVAC policy is a visible formula. | 6/6 |
| 07 | `driftwatch` | ML-ops / observability | Reads the *shape* of a metric — slope, variance, bending energy — and flagged a drift at accuracy 0.890 while the static threshold was still asleep (0.792). | 7/7 |
| 08 | `approvals` | SaaS workflow | One sheet, three tenants: caller-aware policy answers, cross-tenant approval refused at the cell, memoized per (tenant, input). | 9/9 |
| 09 | `habit-atlas` | Health / coaching | Habits as physics: momentum with slow gains and gentle decay, streaks for motivation, days append-only and fenced. | 8/8 |
| 10 | `pipeline-guard` | Data engineering | Schema as editable data: precise rejection reasons, a dead-letter cell you can fix and replay, schema evolution without a deploy. | 9/9 |

## The five idioms every tool shares

These are the reusable parts — the actual product an engineer takes away:

1. **Witness receipts.** Every consequential action appends a row to an
   fnv1a-64 hash chain (`seq, prev_hash, …, row_hash`). `verifyChain()` pins
   the exact row where tampering breaks the seal. Tamper-evident audit is ~15
   lines and belongs in everything.
2. **State in value cells, decisions in programs, policy in formulas.** The
   split is the architecture: policy cells are the part a non-engineer can
   edit; the dependency graph keeps everything consistent automatically.
3. **Listeners as edge-triggered state machines.** Watch a cell, compare
   `caller.metadata.prev` vs `current`, guard the first sample
   (`prev != null`) — clean escalation/hysteresis semantics with zero polling.
4. **The fence between model and sheet.** Schema-bounded decisions
   (clamped Score, letter-coded Choice, calibrated Noul) live in the adapter:
   the sheet can never receive model text outside its type. Prompt injection
   degrades into a *visible, incoherent receipt* instead of a wrong action.
5. **Ops carry event ids; reads are pure.** The engine memoizes per
   (caller, input) — reads are free on repeat, and effectful ops stay honest
   by carrying an `eid`. Memoization as a feature, not a footgun.

## What to swap for production

- The engine: `quilt-toolkit.mjs` imports the patched core dist — set
  `QUILT_DIST` or repoint the import to your build. (The 11 play-test patches
  are in `../quilt-playtest/patches/`; several — listener wiring, eager mode,
  effectful invalidation, schema passthrough — are required by these tools.)
- Integrations: every tool marks its seam ("engineer swap-in" in the header):
  pager webhooks, metric scrapers, real embeddings, bank feeds, MQTT bridges,
  Kafka topics, auth claims.
- The programs run via `new AsyncFunction` — fine for prototypes; wrap with
  `isolated-vm`/`worker_threads` before letting untrusted sheets in.

## Layout

```
quilt-toolkit.mjs     shared runtime: witness idiom, playtest harness, panels, SysOne, embedder
tools/01…10-*.mjs     the ten tools — each self-contained, each ends with its verdict
outputs/*.txt         captured output of the latest full sweep (75/75 green)
```
