// 13 — erised-embassy: the fleet's OUTWARD eye.
//
// Realm: the org, beyond the fence.
//
// Tool 11/12 are the mirror and its memory — they sense OUR ~11 repos. The
// user's wave-32 directive: "study deeply what the other agents are pushing
// to superinstance; synergize and contribute." The org is 5030 repos with
// many foreign fleets pushing daily. This tool is the embassy: a census of
// the org, stranger-verification of foreign receipt chains, and a blunt
// synergy map of who names whom. Doctrine: receipts-first, gifts not demands,
// zero force-pushes, letters between houses.
//
// PRE-REGISTERED GATES (written BEFORE the first run; the run is judged
// against these, not the other way around):
//   G1 census covers >= 200 repos, or GraphQL pages exhausted with the
//      partial+stop_reason receipted in meta (honest truncation, never silent).
//   G2 >= 1 foreign stone-shaped chain detected on a stranger's disk (via raw
//      CDN — pong-quilt r37 sealed checkpoints/stone-v1.json at birth).
//   G3 the pong-quilt chain receives a NAMED verdict from the re-implemented
//      published arithmetic: verified | broken:<why> | not-stone-shaped |
//      unstable-across-reads. 'not-stone-shaped' is an honest verdict. The
//      arithmetic must first pass its KAT against reference-sealed vectors.
//   G4 the crown-jewel artifact is byte-identical across two CDN reads before
//      verification (capture-twice-prove-stable, tool 12's law on the wire),
//      and the derived wave data is byte-identical across two derivations.
//   G5 self-referential smoke: our own portfolio repo (erised-mirror) is
//      visible in census scope; from wave 002 on, its pushed_at must postdate
//      the prior wave (the fleet's own push must be seen by its own embassy).
//   G6 the embassy witness chain (embassy/witness.jsonl) verifies from disk
//      every run and refuses to build on a broken chain.
//
// Scope honesty: probe paths are DECLARED per watchlist repo (<= 6 each —
// asserted); a 404 is a not-found receipt, not an error; the synergy method
// is name-mention-in-README, which is blunt: mention != dependency.
//
// Engineer swap-in: ORGAN / WATCHLIST below; embassy-lib.mjs does the sensing.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTool, check, done, WitnessLog, verifyChain, fnv1a64, ANSI } from '../quilt-toolkit.mjs';
import { canonicalJSON } from './embassy-lib.mjs'; // OUR digest bookkeeping only (as tool 12) -- same STONE-SPEC §5 canonicalJSON, vendored locally (quilt-stone is not a sibling repo in this checkout)
import { sh } from './erised-lib.mjs';                        // reuse, not fork: local head probe for the smoke
import { loadToken, censusRepos, rawCDN, selfTestArithmetic, verifyStoneV1, parseChainArtifact, shapeOf } from './embassy-lib.mjs';

setTool('erised-embassy');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const EMBASSY = path.join(ROOT, 'embassy');
const ENV_PATH = path.resolve(__dirname, '..', '..', '..', '.env');
const ORGAN = 'SuperInstance';

// The 12 repos WE know are ours (tool 12's fleet + the mirror). Everything
// else in the census is treated as foreign for vitals and top-20.
const OURS = new Set(['exoj', 'quilt-dba', 'quilt-murmur', 'quilt-arch', 'quilt-raw', 'quilt-silicon',
  'quilt-stone', 'ropesight', 'yiluodi', 'fleet-seeds', 'erised-mirror', 'quilt-tools']);

// Declared watchlist. Probes are root-level candidates for chain artifacts,
// chosen from census/README evidence gathered BEFORE this run (receipted in
// the worklog); <= 6 per repo, asserted below.
const WATCHLIST = [
  { repo: 'pong-quilt', why: 'foreign fleet ADOPTED stone-v1: r37 seals checkpoints/stone-v1.json at birth (verify-before-write) — the crown-jewel stranger-verification target',
    probes: ['checkpoints/stone-v1.json', 'stone.json', 'receipts/ledger.jsonl'] },
  { repo: 'jev-quilt', why: 'G-theory credentials with mmr_root-style hashes (attest.py/diploma.py) — a DIFFERENT dialect; honest not-found expected at stone probe paths',
    probes: ['checkpoints/stone-v1.json', 'stone.json', 'witness.jsonl', 'receipts/ledger.jsonl'] },
  { repo: 'quilt-canon-witness', why: 'census candidate: "Cryptographic witness log — append-only ledger for canon events"; examples/seed-witness.jsonl confirmed present in a pre-run look',
    probes: ['examples/seed-witness.jsonl', 'stone.json', 'witness.jsonl'] },
];
for (const w of WATCHLIST) check('probe discipline (<= 6 declared probes)', w.probes.length <= 6, `${w.repo}: ${w.probes.length}`);

const SYNERGY_RX = /(?:quilt|jev|stone|erised|murmur|yiluodi|exoj|flux|plato|moth)[a-z0-9-]*/g;

// ── sensing: fetch the org's world once, gently; artifacts twice ────────────
async function sense() {
  const token = loadToken(ENV_PATH);
  console.log(`token: ${token ? 'loaded (in-memory only)' : 'MISSING — REST fallback scope (top 300)'}`);
  const log = (s) => console.log(`  · ${s}`);
  const census = await censusRepos({ login: ORGAN, token, log });
  // Capture-twice law, adapted honestly to the wire (declared in the wave
  // meta): re-fetching all 51 census pages doubles org load for zero
  // epistemics, so the CENSUS is fetched once; the capture-twice law is
  // carried by the chain artifacts (byte-identical across two CDN reads,
  // below) and by running the derivation twice. A census re-read page-1
  // probe is a future thread, not silent truncation.
  const foreignChains = [];
  for (const w of WATCHLIST) {
    for (const p of w.probes) {
      const a = await rawCDN(ORGAN, w.repo, p);
      if (a.status !== 200 || a.text === null) {
        foreignChains.push({ repo: w.repo, path: p, found: false, http_status: a.status, ...(a.error ? { error: a.error } : {}) });
        await new Promise((r) => setTimeout(r, 150));
        continue;
      }
      // capture-twice on the wire: byte-identical across two reads or no verdict
      const b = await rawCDN(ORGAN, w.repo, p);
      await new Promise((r) => setTimeout(r, 150));
      if (b.status !== 200 || b.text !== a.text) {
        foreignChains.push({ repo: w.repo, path: p, found: true, bytes: a.bytes, stable: false, shape: null, verdict: 'unstable-across-reads', links: null, tip: null, why: 'two CDN reads disagreed — artifact moved mid-run; refusing to judge a moving target' });
        continue;
      }
      const rows = parseChainArtifact(a.text);
      const receipt = { repo: w.repo, path: p, found: true, bytes: a.bytes, stable: true };
      if (!rows) { receipt.verdict = 'unparsable'; receipt.shape = null; receipt.why = 'neither JSON nor JSONL'; }
      else {
        receipt.shape = shapeOf(rows);
        if (receipt.shape === 'stone-v1' || receipt.shape === 'stone-v1-headerless') {
          const g = receipt.shape === 'stone-v1' ? (rows[0].genesis ?? undefined) : undefined;
          const v = verifyStoneV1(rows, g);
          receipt.verdict = v.ok ? 'verified' : `broken: ${v.why}`;
          receipt.links = v.links; receipt.tip = v.tip; receipt.genesis = v.genesis;
          if (!v.ok) { receipt.first_bad_index = v.firstBadIndex; receipt.why = v.why; }
        } else if (receipt.shape === 'hash-linked-other') {
          const fields = [...new Set(rows.flatMap((r) => Object.keys(r ?? {}).filter((k) => /hash|witness_id|^prev$/.test(k))))].sort();
          receipt.verdict = 'not-stone-shaped';
          receipt.why = `hash-linked chain in a foreign dialect (link fields: ${fields.join(', ')}) — stone-v1 arithmetic not applicable; a stranger dialect deserves its own published-spec reader`;
        } else {
          receipt.verdict = 'not-stone-shaped';
          receipt.why = `shape '${receipt.shape}' carries no link fields — not a chain`;
        }
      }
      foreignChains.push(receipt);
    }
  }
  const synergy = [];
  for (const w of WATCHLIST) {
    const r = await rawCDN(ORGAN, w.repo, 'README.md');
    await new Promise((res) => setTimeout(res, 150));
    if (r.status !== 200 || r.text === null) { synergy.push({ repo: w.repo, readme: 'not-found', edges: [] }); continue; }
    const text = r.text.toLowerCase();
    const counts = {};
    for (const m of text.matchAll(SYNERGY_RX)) {
      const t = m[0].replace(/-+$/, '');
      if (t === w.repo.toLowerCase()) continue; // no self-edge
      counts[t] = (counts[t] || 0) + 1;
    }
    synergy.push({ repo: w.repo, readme_bytes: r.bytes, edges: Object.keys(counts).sort().map((t) => ({ token: t, mentions: counts[t] })) });
  }
  return { census, foreignChains, synergy };
}

// ── derivation: pure function of the observations (deterministic capture) ──
function derive(obs, nowAnchor) {
  const { census, foreignChains, synergy } = obs;
  const names = new Set(census.repos.map((r) => r.name.toLowerCase()));
  const dayAgo = nowAnchor - 864e5, weekAgo = nowAnchor - 7 * 864e5;
  const pushed = (r) => Date.parse(r.pushed_at) || 0;
  const foreign = census.repos.filter((r) => !OURS.has(r.name));
  const top20 = [...foreign].sort((a, b) => pushed(b) - pushed(a) || a.name.localeCompare(b.name)).slice(0, 20)
    .map((r) => ({ name: r.name, pushed_at: r.pushed_at, description: (r.description ?? '').slice(0, 90) }));
  const within = (r, t) => pushed(r) >= t;
  const oursSeen = census.repos.filter((r) => OURS.has(r.name)).map((r) => ({ name: r.name, pushed_at: r.pushed_at })).sort((a, b) => a.name.localeCompare(b.name));
  const edges = [];
  const unresolved = {};
  for (const s of synergy) {
    if (!s.edges) continue;
    for (const e of s.edges) {
      if (names.has(e.token)) edges.push({ from: s.repo, to: e.token, mentions: e.mentions, how: 'name-mention-in-readme' });
      else unresolved[e.token] = e.mentions;
    }
  }
  edges.sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
  return {
    census: { org: ORGAN, method: census.method, pages: census.pages, total: census.total, partial: census.partial, ...(census.stop_reason ? { stop_reason: census.stop_reason } : {}) },
    vitals: {
      repos_total: census.repos.length, forks: census.repos.filter((r) => r.fork).length, private_repos: census.repos.filter((r) => r.private).length,
      active_today: census.repos.filter((r) => within(r, dayAgo)).length, active_week: census.repos.filter((r) => within(r, weekAgo)).length,
      foreign_total: foreign.length, foreign_active_today: foreign.filter((r) => within(r, dayAgo)).length, foreign_active_week: foreign.filter((r) => within(r, weekAgo)).length,
      top20_foreign_active: top20, ours_seen_in_census: oursSeen,
    },
    foreign_chains: foreignChains,
    synergy: {
      method: 'README.md name-mention via org-name-anchored regex; BLUNT by construction — mention != dependency',
      edges, unresolved_tokens: { count: Object.keys(unresolved).length, top: Object.entries(unresolved).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([token, mentions]) => ({ token, mentions })) },
    },
    watchlist: WATCHLIST.map((w) => ({ repo: w.repo, why: w.why, probes: w.probes })),
  };
}

// ── run ──────────────────────────────────────────────────────────────────────
console.log(`${ANSI.bold}Erised-embassy — the outward eye on ${ORGAN}${ANSI.reset}`);
const kat = selfTestArithmetic();
check('G3a arithmetic KAT: re-implemented stone-v1 math matches reference-sealed vectors', kat.ok, kat.detail);

const obs = await sense();
const nowAnchor = Date.parse(obs.census.fetched_at);
const c = obs.census;
console.log(`\n${ANSI.bold}Census${ANSI.reset} — ${c.method}`);
console.log(`  ${c.repos.length} repos (org reports ${c.total}) in ${c.pages} pages${c.partial ? ` — PARTIAL: ${c.stop_reason}` : ''}`);
check('G1 census coverage: >= 200 repos or pages exhausted honestly', c.repos.length >= 200 || c.partial, `${c.repos.length} repos, ${c.pages} pages, partial=${c.partial}${c.stop_reason ? ` (${c.stop_reason})` : ''}`);
check('census self-describes its method (meta carries it out of the digest)', typeof c.method === 'string' && c.method.length > 0, c.method);

const v0 = derive(obs, nowAnchor);
const v1 = derive(obs, nowAnchor); // capture-twice: same world, derived twice
const stable = canonicalJSON(v0) === canonicalJSON(v1);
check('G4a derivation deterministic: two captures byte-identical', stable, stable ? `digest ${fnv1a64(canonicalJSON(v0))}` : 'NONDETERMINISTIC — refusing to write a wave');
const data = v0;

const vit = data.vitals;
console.log(`\n${ANSI.bold}Org vitals${ANSI.reset} — ${vit.repos_total} repos (${vit.forks} forks, ${vit.private_repos} private)`);
console.log(`  active: ${vit.active_today} today / ${vit.active_week} this week · foreign: ${vit.foreign_total} repos, ${vit.foreign_active_today} today / ${vit.foreign_active_week} this week`);
console.log(`  top-5 most-active foreign: ${vit.top20_foreign_active.slice(0, 5).map((r) => `${r.name}@${r.pushed_at.slice(0, 16)}`).join(', ')}`);
check('G5a self-referential: our portfolio (erised-mirror) in census scope', vit.ours_seen_in_census.some((r) => r.name === 'erised-mirror'),
  `erised-mirror pushed ${vit.ours_seen_in_census.find((r) => r.name === 'erised-mirror')?.pushed_at ?? 'ABSENT'}`);

console.log(`\n${ANSI.bold}Foreign chains${ANSI.reset} — ${obs.foreignChains.length} probe receipts`);
const found = data.foreign_chains.filter((r) => r.found);
for (const r of data.foreign_chains) {
  const line = r.found
    ? `${r.repo}/${r.path}: ${r.verdict}${r.links !== null && r.links !== undefined ? ` (${r.links} links, tip ${(r.tip ?? '?').slice(0, 16)}…)` : ''}${r.why ? ` — ${r.why}` : ''}`
    : `${r.repo}/${r.path}: not-found (http ${r.http_status})`;
  console.log(`  · ${line}`);
}
const stoneChains = found.filter((r) => r.shape === 'stone-v1' || r.shape === 'stone-v1-headerless');
check('G2 >= 1 foreign stone-shaped chain detected', stoneChains.length >= 1, `${stoneChains.length} stone-shaped, ${found.length} found, ${data.foreign_chains.length - found.length} not-found`);
const crown = data.foreign_chains.find((r) => r.repo === 'pong-quilt' && r.path === 'checkpoints/stone-v1.json' && r.found);
const NAMED = ['verified', 'unstable-across-reads', 'unparsable', 'not-stone-shaped'];
const namedVerdict = (r) => !!r && (NAMED.includes(r.verdict) || String(r.verdict).startsWith('broken:'));
check('G3 crown jewel: pong-quilt stone-v1 verdict issued with a named reason', namedVerdict(crown),
  crown ? `${crown.verdict} — ${crown.links ?? '?'} links, tip ${(crown.tip ?? '?').slice(0, 24)}…${crown.why ? ` (${crown.why})` : ''}` : 'pong-quilt/checkpoints/stone-v1.json NOT FOUND on the stranger\'s disk');
check('G4b crown-jewel artifact stable across two CDN reads', !!crown && crown.stable === true, crown ? `${crown.bytes} bytes, byte-identical twice` : 'no artifact');
if (crown?.verdict === 'verified') console.log(`\n${ANSI.green}  CROWN JEWEL: pong-quilt's stone-v1 chain VERIFIES under the stone's published arithmetic${ANSI.reset}\n${ANSI.green}  re-implemented from STONE-SPEC alone — our standard holds under a stranger's roof.${ANSI.reset}`);

console.log(`\n${ANSI.bold}Synergy edges${ANSI.reset} — ${data.synergy.method}`);
for (const s of data.synergy.edges) console.log(`  · ${s.from} → ${s.to} (${s.mentions}×)`);
console.log(`  unresolved tokens: ${data.synergy.unresolved_tokens.count}${data.synergy.unresolved_tokens.top.length ? ` (top: ${data.synergy.unresolved_tokens.top.map((t) => `${t.token}(${t.mentions})`).join(', ')})` : ''}`);
check('synergy map present with its bluntness declared', Array.isArray(data.synergy.edges) && data.synergy.method.includes('mention != dependency'), `${data.synergy.edges.length} edges, ${data.synergy.unresolved_tokens.count} unresolved tokens`);

// ── persist the wave (analog of trends/wave-NNN.json) ───────────────────────
if (!stable) { done(); process.exit(1); }
fs.mkdirSync(EMBASSY, { recursive: true });
const waves = fs.existsSync(EMBASSY) ? fs.readdirSync(EMBASSY).map((f) => /^wave-(\d{3})\.json$/.exec(f)).filter(Boolean).map((m) => parseInt(m[1], 10)) : [];
const wave = waves.length ? Math.max(...waves) + 1 : 1;
const label = `wave-${String(wave).padStart(3, '0')}`;
const digest = fnv1a64(canonicalJSON(data));
const snapshotPath = path.join(EMBASSY, `${label}.json`);
fs.writeFileSync(snapshotPath, JSON.stringify({
  meta: { wave, label, tool: 'erised-embassy', captured_at: new Date().toISOString(), digest, comparability: 'data only; meta whitelisted out of comparison; network law: census+READMEs fetched once, chain artifacts fetched twice, derivation run twice' },
  data,
}, null, 2) + '\n');
const reread = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
check('wave snapshot on disk digest-verifies', fnv1a64(canonicalJSON(reread.data)) === digest, `${label} digest ${digest}`);
const self = vit.ours_seen_in_census.find((r) => r.name === 'erised-mirror');
if (waves.length >= 1) {
  const prior = JSON.parse(fs.readFileSync(path.join(EMBASSY, `wave-${String(wave - 1).padStart(3, '0')}.json`), 'utf8'));
  check('prior wave intact (digest matches)', fnv1a64(canonicalJSON(prior.data)) === prior.meta.digest, prior.meta.label);
  const priorTs = Date.parse(prior.meta.captured_at);
  check('G5b self-referential smoke: the embassy sees the fleet\'s own push', self && Date.parse(self.pushed_at) > priorTs,
    self ? `erised-mirror pushed ${self.pushed_at} > ${prior.meta.label} captured_at (${new Date(priorTs).toISOString()})` : 'erised-mirror absent from census');
}

// ── the embassy witness: persistent, chained, verified from disk every run ──
const witnessPath = path.join(EMBASSY, 'witness.jsonl');
let wl;
if (fs.existsSync(witnessPath)) {
  const rows = fs.readFileSync(witnessPath, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const v = verifyChain(rows);
  if (!v.ok) { check('G6 witness chain verifies before append', false, `broken at ${v.brokenAt} — refusing to build on a broken chain`); done(); process.exit(1); }
  wl = new WitnessLog(rows);
} else {
  wl = new WitnessLog();
  wl.append({ event: 'witness-open', by: 'erised-embassy tool 13', law: 'every embassy wave is receipted here; inter-fleet contact happens through letters, not force-pushes' });
}
wl.append({
  event: 'embassy-wave', wave: label, digest,
  census_repos: vit.repos_total, foreign_repos: vit.foreign_total,
  foreign_active_today: vit.foreign_active_today, foreign_active_week: vit.foreign_active_week,
  probes: data.foreign_chains.length, chains_found: found.length, chains_verified: found.filter((r) => r.verdict === 'verified').length,
  edges: data.synergy.edges.length,
  self: self ? `${self.name}@${self.pushed_at}` : null,
});
fs.writeFileSync(witnessPath, wl.rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
const wv = verifyChain(wl.rows);
check('G6 witness chain verifies from disk', wv.ok, `${wl.rows.length} rows, head ${wv.head.slice(0, 10)}`);

fs.mkdirSync(path.join(ROOT, 'outputs'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'outputs', '13-erised-embassy.json'), JSON.stringify({
  tool: 'erised-embassy', run_at: new Date().toISOString(), wave: label, snapshot_digest: digest,
  local_head: sh('git rev-parse --short=12 HEAD', ROOT) || null,
  crown_jewel: crown ? { repo: crown.repo, path: crown.path, verdict: crown.verdict, links: crown.links, tip: crown.tip, bytes: crown.bytes } : null,
  witness: { verdict: wv, rows: wl.rows },
}, null, 2) + '\n');

console.log(`\n${ANSI.dim}The fence is not a wall; the embassy keeps the guest list.${ANSI.reset}`);
done();
