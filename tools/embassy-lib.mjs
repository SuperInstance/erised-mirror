// embassy-lib.mjs — the embassy's OUTWARD senses (org-facing, over the wire).
//
// Task 32-b. erised-lib.mjs senses OUR local repos; this module senses the ORG
// (5030 repos, many foreign fleets pushing daily) and the strangers' chains.
// New logic — no fork of the mirror's sensing. The one law carried over:
// the stranger's chain is verified from PUBLISHED ARITHMETIC ONLY
// (STONE-SPEC.md §§4.6/5), re-implemented here, never by importing the
// stranger's code — the way challenge C4-field-singer-02 verified dba chains.
//
// Network law (this wave's rate-limit lesson): GraphQL for census (light),
// raw.githubusercontent.com/<owner>/<repo>/HEAD/<path> for file contents
// (CDN, no API quota), ZERO REST contents calls, sequential fetches
// (concurrency 1 ≪ 8) with small sleeps. The GH token is read in-memory
// only — never echoed, never written, never logged.
//
// Consumers: tools/13-erised-embassy.mjs (the embassy).

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { sleep } from '../quilt-toolkit.mjs';

const RAW = 'https://raw.githubusercontent.com';
const GQL = 'https://api.github.com/graphql';

// ── token: in-memory only ───────────────────────────────────────────────────
// Reads GH_TOKEN from a .env file at envPath if present; otherwise falls back
// to process.env.GH_TOKEN. Never logs, echoes, or throws on the token value.
export function loadToken(envPath) {
  try {
    const m = /^GH_TOKEN=(.*)$/m.exec(fs.readFileSync(envPath, 'utf8').trim());
    if (m) return m[1].trim();
  } catch { /* file missing/unreadable — fall through to env */ }
  const env = process.env.GH_TOKEN;
  return env ? env.trim() : null;
}

// ── raw CDN fetch (no API quota; 404 is an honest not-found, not an error) ──
export async function rawCDN(owner, repo, filePath) {
  const url = `${RAW}/${owner}/${repo}/HEAD/${filePath.replace(/^\/+/, '')}`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
    const text = r.status === 200 ? await r.text() : null;
    return { status: r.status, bytes: text === null ? 0 : Buffer.byteLength(text, 'utf8'), text };
  } catch (e) {
    return { status: 0, bytes: 0, text: null, error: String(e?.message ?? e).slice(0, 80) };
  }
}

// ── census: GraphQL user repositories, 100/page, gentle (0.3s sleep) ────────
// Fallback when GraphQL fights (or no token): REST /users/<login>/repos
// ?per_page=100&sort=pushed&page=1..3 — top 300 by push, DECLARED scope.
// Never silent: the return carries method, pages, and partial-honesty flags.
export async function censusRepos({ login, token, sleepMs = 300, log = () => {} }) {
  if (token) {
    const repos = [];
    let cursor = null; let page = 0; let partial = false; let stopReason = null; let total = null;
    const t0 = Date.now();
    while (true) {
      page++;
      const q = `query($c:String){ user(login:"${login}"){ repositories(first:100, after:$c, orderBy:{field:PUSHED_AT,direction:DESC}){ totalCount pageInfo{ endCursor hasNextPage } nodes{ name pushedAt description isPrivate isFork } } } }`;
      let j = null;
      try {
        const r = await fetch(GQL, { method: 'POST', signal: AbortSignal.timeout(30000),
          headers: { authorization: `bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify({ query: q, variables: { c: cursor } }) });
        j = await r.json();
        if (r.status !== 200) j = { errors: j?.errors ?? [{ message: `http ${r.status}` }] };
      } catch (e) { j = { errors: [{ message: String(e?.message ?? e).slice(0, 120) }] }; }
      if (j.errors) { partial = true; stopReason = `page ${page}: ${j.errors[0]?.message ?? 'graphql error'}`; break; }
      const rep = j.data.user.repositories;
      total = rep.totalCount;
      for (const n of rep.nodes) repos.push({ name: n.name, pushed_at: n.pushedAt, description: n.description, fork: n.isFork, private: n.isPrivate });
      log(`census page ${page}: ${repos.length} repos (t+${((Date.now() - t0) / 1000).toFixed(0)}s)`);
      if (!rep.pageInfo.hasNextPage) break;
      cursor = rep.pageInfo.endCursor;
      await sleep(sleepMs);
    }
    if (repos.length > 0) {
      return { method: 'graphql-user-repositories-orderBy:PUSHED_AT-DESC', pages: page, partial, stop_reason: stopReason, total: total ?? repos.length, fetched_at: new Date().toISOString(), repos };
    }
    log('graphql yielded nothing — falling back to REST top-300 (declared scope)');
  }
  // REST fallback: top 300 by pushed (3 pages × 100), works unauthenticated.
  const repos = [];
  for (let p = 1; p <= 3; p++) {
    try {
      const r = await fetch(`https://api.github.com/users/${login}/repos?per_page=100&sort=pushed&page=${p}`, { signal: AbortSignal.timeout(30000), headers: token ? { authorization: `bearer ${token}` } : {} });
      if (r.status !== 200) break;
      const arr = await r.json();
      for (const n of arr) repos.push({ name: n.name, pushed_at: n.pushed_at, description: n.description, fork: n.fork, private: n.private });
      if (arr.length < 100) break;
      await sleep(sleepMs);
    } catch { break; }
  }
  return { method: 'rest-users-repos-per_page:100-sort:pushed-pages:1-3 (DECLARED top-300 scope)', pages: Math.min(3, Math.ceil(repos.length / 100)), partial: repos.length >= 300, stop_reason: repos.length ? null : 'rest fallback failed', total: repos.length, fetched_at: new Date().toISOString(), repos };
}

// ═════════════════════════════════════════════════════════════════════════════
// STRANGER VERIFICATION — stone-v1 arithmetic re-implemented from the PUBLISHED
// spec (quilt-stone/STONE-SPEC.md §§4.6, 5) ONLY. No import from stone.mjs.
//   hash = sha256(canonicalJSON([prev, row minus row_hash]))  (UTF-8 bytes)
//   canonicalJSON: recursive key sort, undefined-valued keys skipped,
//   arrays ordered, no whitespace. Genesis default 'STONE-GENESIS-1',
//   or the stone.header row's own recorded genesis.
// Faithfulness is pinned by KAT_VECTOR below: sealed by the REFERENCE
// stone.mjs (alg stone-v1) during tool development; this reimplementation
// must reproduce those row_hash values before it may judge any stranger.
// ═════════════════════════════════════════════════════════════════════════════
export const KAT_VECTOR = {
  provenance: 'sealed by quilt-stone/stone.mjs sealChain(alg stone-v1) during Task 32-b tool development',
  genesis: 'STONE-GENESIS-1',
  rows: [
    { kind: 'stone.header', alg: 'stone-v1', genesis: 'STONE-GENESIS-1', note: 'embassy KAT vector', zeta: { b: 1, a: [2, 1] }, row_hash: 'bb1487cb4b0b4eca95f0a7bd385165921522acd7f9c7982d5ee3f7d0009f50ab' },
    { kind: 'kat.payload', seq: 1, nested: { y: 'γ', x: 2 }, row_hash: '0c064021d4f289d2425042394ae1a9c9e98b31b111e1278eacd83141e0141e2b' },
  ],
};

export function canonicalJSON(value) { // STONE-SPEC §5 answer #2 (exoj/stone-v1)
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return '[' + value.map(canonicalJSON).join(',') + ']';
  const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalJSON(value[k])).join(',') + '}';
}

const sha256Hex = (s) => createHash('sha256').update(s, 'utf8').digest('hex');

export function verifyStoneV1(rows, genesis) {
  let prev = genesis ?? 'STONE-GENESIS-1';
  if (!Array.isArray(rows)) return { ok: false, firstBadIndex: 0, why: 'rows is not an array', links: 0, tip: null, genesis: prev };
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!r || typeof r !== 'object' || Array.isArray(r)) return { ok: false, firstBadIndex: i, why: 'row is not an object', links: rows.length, tip: i > 0 ? prev : null, genesis: prev };
    if (r.row_hash === undefined) return { ok: false, firstBadIndex: i, why: 'missing row_hash', links: rows.length, tip: i > 0 ? prev : null, genesis: prev };
    const { row_hash, ...rest } = r; // rest-destructure, per spec
    const want = sha256Hex(canonicalJSON([prev, rest]));
    if (want !== row_hash) return { ok: false, firstBadIndex: i, why: 'hash mismatch', links: rows.length, tip: i > 0 ? prev : null, genesis: prev };
    prev = row_hash;
  }
  return { ok: true, firstBadIndex: null, why: null, links: rows.length, tip: rows.length > 0 ? prev : null, genesis: prev };
}

export function selfTestArithmetic() {
  const v = verifyStoneV1(KAT_VECTOR.rows, KAT_VECTOR.genesis);
  // negative control: a one-bit tamper must be caught at its index
  const tampered = JSON.parse(JSON.stringify(KAT_VECTOR.rows));
  tampered[1].nested.x = 3;
  const neg = verifyStoneV1(tampered, KAT_VECTOR.genesis);
  return { ok: v.ok && !neg.ok && neg.firstBadIndex === 1, detail: `KAT tip ${v.tip?.slice(0, 12)}…; tamper caught at ${neg.firstBadIndex} (${neg.why})` };
}

// ── chain artifact parsing + shape detection (honest verdicts, not exceptions) ──
export function parseChainArtifact(text) {
  const t = text.trim();
  try { // whole-file JSON: array, {rows:[...]}, or single object
    const j = JSON.parse(t);
    if (Array.isArray(j)) return j;
    if (j && Array.isArray(j.rows)) return j.rows;
    return [j]; // single object → "single-object" shape, honest not-a-chain
  } catch { /* fall through to JSONL */ }
  const rows = [];
  for (const line of t.split('\n')) {
    const s = line.trim();
    if (!s) continue;
    try { rows.push(JSON.parse(s)); } catch { return null; } // malformed line → unparsable
  }
  return rows.length ? rows : null;
}

// Shape verdicts:
//   'stone-v1'            row 0 is a stone.header naming alg:'stone-v1' (the spec-mandated shape)
//   'stone-v1-headerless' no header, but every row carries a 64-hex row_hash
//   'hash-linked-other'   link-ish fields present but not the stone shapes
//   'single-object'       one JSON object — not a chain
export function shapeOf(rows) {
  const h0 = rows[0];
  if (h0 && typeof h0 === 'object' && h0.kind === 'stone.header' && h0.alg === 'stone-v1') return 'stone-v1';
  if (rows.length > 1 && rows.every((r) => r && typeof r === 'object' && typeof r.row_hash === 'string' && /^[0-9a-f]{64}$/.test(r.row_hash))) return 'stone-v1-headerless';
  if (rows.some((r) => r && typeof r === 'object' && ('row_hash' in r || 'hash' in r || 'prev_hash' in r || 'prev' in r || 'witness_id' in r))) return 'hash-linked-other';
  return 'single-object';
}
