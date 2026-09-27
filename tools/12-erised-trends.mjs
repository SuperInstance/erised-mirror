// 12 — erised-trends: the mirror diffed over waves.
//
// Realm: the community, over time.
//
// Tool 11 is a mirror; this is the SAME mirror (same senses — erised-lib.mjs,
// not a fork) asked a fourth question: what MOVED since the last sitting?
// Each run captures a WAVE SNAPSHOT — a deterministic JSON digest of the whole
// fleet (per-repo head sha / commit count / dirty count / receipt-chain
// lengths + tips through the Stone, open threads from the worklog, top
// kinship pairs, import edges) — into trends/, and diffs it against the most
// recent prior wave. First run on a fresh clone finds no prior wave and
// receipts the legitimate outcome: "baseline established". That is a finding,
// not a failure.
//
// Determinism contract: the `data` section of a snapshot is the comparison
// surface — fixed ordering (sorted repos, sorted walks, sorted keys), no wall
// clocks, no floats beyond the kinship cosines (rounded to 3 decimals). The
// `meta` section (wave label, ISO timestamp) is whitelisted OUT of comparison
// and out of the digest. Two captures inside one run must be byte-identical —
// and the tool proves that every run, because a diff against an unstable
// mirror is astrology.
//
// Engineer swap-in: point REPOS_ROOT/WORKLOG like tool 11; trends/ carries.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTool, check, done, WitnessLog, verifyChain, localEmbed, cosine, ANSI, fnv1a64 } from '../quilt-toolkit.mjs';
import { canonicalJSON } from '../../quilt-stone/stone.mjs';
import { sh, discoverRepos, scanChains, openThreads, kinship, importEdges } from './erised-lib.mjs';

setTool('erised-trends');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPOS_ROOT = path.resolve(__dirname, '..', '..');
const WORKLOG = path.join(REPOS_ROOT, '..', 'worklog.md');
const TRENDS = path.join(__dirname, '..', 'trends');
const SKIP = new Set(['node_modules', '.git', 'quilt-quant']);
const DIFF_ONLY = process.argv.includes('--diff-only');

// ── capture: one deterministic sitting of the mirror ────────────────────────
function captureData() {
  const repos = discoverRepos(REPOS_ROOT, SKIP);
  const chains = scanChains(repos, REPOS_ROOT);
  const threads = openThreads(WORKLOG);
  const kinships = kinship(repos, REPOS_ROOT, { localEmbed, cosine });
  const edges = importEdges(repos, REPOS_ROOT);
  return {
    edges,
    kinship_top3: kinships.slice(0, 3),
    open_threads: { count: threads.length, lines: threads },
    repos: repos.map((r) => ({
      name: r.name,
      head: sh('git rev-parse --short=12 HEAD', path.join(REPOS_ROOT, r.name)) || null,
      commits: r.commits,
      dirty: r.dirty,
      chains: chains.filter((c) => c.repo === r.name).map((c) => ({
        file: c.file, links: c.links, ok: c.ok, tip: c.tip, alg: c.alg, genesis: c.genesis,
      })).sort((x, y) => x.file.localeCompare(y.file)),
    })).sort((x, y) => x.name.localeCompare(y.name)),
  };
}

const snapshotPath = (wave) => path.join(TRENDS, `wave-${String(wave).padStart(3, '0')}.json`);
const latestWave = () => {
  if (!fs.existsSync(TRENDS)) return 0;
  const waves = fs.readdirSync(TRENDS).map((f) => /^wave-(\d{3})\.json$/.exec(f)).filter(Boolean).map((m) => parseInt(m[1], 10));
  return waves.length ? Math.max(...waves) : 0;
};
const digestOf = (data) => fnv1a64(canonicalJSON(data));

// ── diff: what MOVED, reported honestly ─────────────────────────────────────
function diffWaves(cur, prev, toLabel, fromLabel) {
  const d = { from: fromLabel, to: toLabel, repos_changed: [], repos_added: [], repos_removed: [], chains_grown: [], chains_shrunk: [], chains_new: [], chains_closed: [], threads: {}, kinship: {}, edges_added: [], edges_removed: [] };
  const prevRepos = new Map(prev.data.repos.map((r) => [r.name, r]));
  const curRepos = new Map(cur.data.repos.map((r) => [r.name, r]));
  for (const [name, c] of curRepos) {
    const p = prevRepos.get(name);
    if (!p) { d.repos_added.push(name); continue; }
    const rec = { repo: name };
    if (c.head !== p.head) rec.head = { from: p.head, to: c.head };
    if (c.commits !== p.commits) rec.commits = { from: p.commits, to: c.commits, delta: c.commits - p.commits };
    if (c.dirty !== p.dirty) rec.dirty = { from: p.dirty, to: c.dirty };
    if (rec.head || rec.commits || rec.dirty) d.repos_changed.push(rec);
    const pChains = new Map(p.chains.map((x) => [x.file, x]));
    for (const cc of c.chains) {
      const pc = pChains.get(cc.file);
      if (!pc) { d.chains_new.push({ repo: name, file: cc.file, links: cc.links, tip: cc.tip }); continue; }
      if (cc.links !== pc.links || cc.tip !== pc.tip) {
        (cc.links >= pc.links ? d.chains_grown : d.chains_shrunk).push({
          repo: name, file: cc.file,
          links: { from: pc.links, to: cc.links },
          tip: { from: pc.tip, to: cc.tip },
          tip_moved: pc.tip !== cc.tip,
        });
      }
    }
    for (const pc of p.chains) if (!c.chains.some((x) => x.file === pc.file)) d.chains_closed.push({ repo: name, file: pc.file, links: pc.links, tip: pc.tip });
  }
  for (const [name] of prevRepos) if (!curRepos.has(name)) d.repos_removed.push(name);
  // threads: set-diff on exact lines (stable identities; a new line is new work)
  const prevSet = new Set(prev.data.open_threads.lines);
  const curSet = new Set(cur.data.open_threads.lines);
  const newT = cur.data.open_threads.lines.filter((l) => !prevSet.has(l));
  const closedT = prev.data.open_threads.lines.filter((l) => !curSet.has(l));
  d.threads = { from: prev.data.open_threads.count, to: cur.data.open_threads.count, new: newT.length, closed: closedT.length, new_examples: newT.slice(0, 2).map((s) => s.slice(0, 90)), closed_examples: closedT.slice(0, 2).map((s) => s.slice(0, 90)) };
  // kinship drift on the top pairs (matched by unordered pair key)
  const key = (k) => [k.a, k.b].sort().join('~');
  const prevKin = new Map(prev.data.kinship_top3.map((k) => [key(k), k]));
  d.kinship = {
    top_changed: key(cur.data.kinship_top3[0] ?? {}) !== key(prev.data.kinship_top3[0] ?? {}),
    pairs: cur.data.kinship_top3.map((k) => {
      const p = prevKin.get(key(k));
      return { a: k.a, b: k.b, cos: k.cos, from: p ? p.cos : null, delta: p ? +(k.cos - p.cos).toFixed(3) : null };
    }),
  };
  const prevEdges = new Set(prev.data.edges);
  const curEdges = new Set(cur.data.edges);
  d.edges_added = cur.data.edges.filter((e) => !prevEdges.has(e));
  d.edges_removed = prev.data.edges.filter((e) => !curEdges.has(e));
  return d;
}

// ── run ──────────────────────────────────────────────────────────────────────
if (DIFF_ONLY) {
  const top = latestWave();
  if (top < 2) { console.log(`diff-only needs >= 2 waves on disk (found ${top})`); done(); process.exit(1); }
  const cur = JSON.parse(fs.readFileSync(snapshotPath(top), 'utf8'));
  const prev = JSON.parse(fs.readFileSync(snapshotPath(top - 1), 'utf8'));
  check('current snapshot intact (digest matches)', digestOf(cur.data) === cur.meta.digest, cur.meta.label);
  check('prior snapshot intact (digest matches)', digestOf(prev.data) === prev.meta.digest, prev.meta.label);
  console.log(JSON.stringify(diffWaves(cur, prev, cur.meta.label, prev.meta.label), null, 2));
  done();
} else {
  console.log(`${ANSI.bold}Erised-trends, next wave: ${String(latestWave() + 1).padStart(3, '0')}${ANSI.reset}`);

  const priorWave = latestWave();
  let prior = null;
  if (priorWave) {
    prior = JSON.parse(fs.readFileSync(snapshotPath(priorWave), 'utf8'));
    const pd = digestOf(prior.data);
    check('prior snapshot intact (digest matches)', pd === prior.meta.digest, `${path.basename(snapshotPath(priorWave))}: ${pd === prior.meta.digest ? 'ok' : `digest ${pd} != recorded ${prior.meta.digest}`}`);
  }

  const data1 = captureData();
  const data2 = captureData(); // determinism probe: same instant, same world
  const identical = canonicalJSON(data1) === canonicalJSON(data2);
  check('determinism: two consecutive captures byte-identical', identical, identical ? `digest ${digestOf(data1)}` : 'CAPTURE IS NONDETERMINISTIC — diffs would be astrology');
  const data = data1;
  const wave = priorWave + 1;
  const label = `wave-${String(wave).padStart(3, '0')}`;
  const digest = digestOf(data);

  fs.mkdirSync(TRENDS, { recursive: true });
  fs.writeFileSync(snapshotPath(wave), JSON.stringify({
    meta: { wave, label, tool: 'erised-trends', captured_at: new Date().toISOString(), digest, comparability: 'data only; meta whitelisted out of comparison' },
    data,
  }, null, 2) + '\n');
  const reread = JSON.parse(fs.readFileSync(snapshotPath(wave), 'utf8'));
  check('snapshot on disk digest-verifies', digestOf(reread.data) === digest, `${path.basename(snapshotPath(wave))} digest ${digest}`);
  check('fleet visible to the trend-tracker', data.repos.length >= 8, `${data.repos.length} repos`);
  const chainsAll = data.repos.flatMap((r) => r.chains);
  check('chains healthy through the stone (0 broken)', chainsAll.every((c) => c.ok), `${chainsAll.filter((c) => c.ok).length} chains ok, ${chainsAll.filter((c) => !c.ok).length} broken`);

  let diff = null;
  if (!prior) {
    console.log(`\n${ANSI.cyan}  no prior wave; baseline established.${ANSI.reset} The next sitting diffs against this one.`);
    check('diff mode: honest baseline outcome', true, `${label} is the reference wave (repos ${data.repos.length}, chains ${chainsAll.length}, threads ${data.open_threads.count})`);
  } else {
    diff = diffWaves({ data }, prior, label, prior.meta.label);
    const diffFile = path.join(TRENDS, `wave-${String(wave).padStart(3, '0')}.diff.json`);
    fs.writeFileSync(diffFile, JSON.stringify({ meta: { from: prior.meta.label, to: label, generated_at: new Date().toISOString(), comparability: 'derived from snapshot data only' }, diff }, null, 2) + '\n');
    console.log(`\n${ANSI.bold}Diff ${prior.meta.label} → ${label}${ANSI.reset}`);
    console.log(`  repos changed: ${diff.repos_changed.length}${diff.repos_changed.length ? '' : ' (none)'}`);
    for (const r of diff.repos_changed) {
      const bits = [];
      if (r.head) bits.push(`head ${r.head.from?.slice(0, 7) ?? '?'}→${r.head.to?.slice(0, 7) ?? '?'}`);
      if (r.commits) bits.push(`commits ${r.commits.from}→${r.commits.to} (${r.commits.delta >= 0 ? '+' : ''}${r.commits.delta})`);
      if (r.dirty) bits.push(`dirty ${r.dirty.from}→${r.dirty.to}`);
      console.log(`  · ${r.repo}: ${bits.join(', ')}`);
    }
    for (const a of diff.repos_added) console.log(`  + repo appeared: ${a}`);
    for (const r of diff.repos_removed) console.log(`  - repo gone: ${r}`);
    const chainMoves = [...diff.chains_grown, ...diff.chains_shrunk];
    console.log(`  chains: ${chainMoves.length} moved, ${diff.chains_new.length} new, ${diff.chains_closed.length} closed${chainMoves.length || diff.chains_new.length || diff.chains_closed.length ? '' : ' (all tips unchanged)'}`);
    for (const c of chainMoves) console.log(`  · ${c.repo}/${c.file} links ${c.links.from}→${c.links.to}, tip ${c.tip_moved ? `${c.tip.from}→${c.tip.to}` : `unchanged (${c.tip.to})`}`);
    for (const c of diff.chains_new) console.log(`  + chain ${c.repo}/${c.file} (${c.links} links, tip ${c.tip})`);
    for (const c of diff.chains_closed) console.log(`  - chain ${c.repo}/${c.file} no longer present`);
    console.log(`  threads: ${diff.threads.from}→${diff.threads.to} (+${diff.threads.new} new, -${diff.threads.closed} closed)`);
    for (const s of diff.threads.new_examples) console.log(`    + ${s}`);
    for (const s of diff.threads.closed_examples) console.log(`    - ${s}`);
    console.log(`  kinship: top pair ${diff.kinship.top_changed ? 'CHANGED' : 'stable'}; ${diff.kinship.pairs.map((k) => `${k.a}~${k.b} ${k.from ?? 'new'}→${k.cos}${k.delta !== null ? ` (Δ${k.delta >= 0 ? '+' : ''}${k.delta})` : ''}`).join('; ')}`);
    console.log(`  edges: ${diff.edges_added.length} added, ${diff.edges_removed.length} removed${[...diff.edges_added, ...diff.edges_removed].length ? ': ' + [...diff.edges_added.map((e) => '+' + e), ...diff.edges_removed.map((e) => '-' + e)].join(', ') : ''}`);
    check('diff emitted against prior wave', true, `${chainMoves.length} chain moves, ${diff.repos_changed.length} repo changes, threads ${diff.threads.from}→${diff.threads.to}`);
  }

  // ── the witness log: persistent, chained, verified from disk every run ────
  const witnessPath = path.join(TRENDS, 'witness.jsonl');
  let wl;
  if (fs.existsSync(witnessPath)) {
    const rows = fs.readFileSync(witnessPath, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    const v0 = verifyChain(rows);
    if (!v0.ok) { check('witness chain verifies before append', false, `broken at ${v0.brokenAt} — refusing to build on a broken chain`); done(); process.exit(1); }
    wl = new WitnessLog(rows);
  } else {
    wl = new WitnessLog();
    wl.append({ event: 'witness-open', by: 'erised-trends tool 12', law: 'every wave capture is receipted here; the mirror itself can read this chain back once it has >= 3 rows (mirror-visible from wave 003)' });
  }
  const diffSummary = diff ? `${diff.repos_changed.length} repo changes, ${[...diff.chains_grown, ...diff.chains_shrunk].length} chain moves, threads ${diff.threads.from}→${diff.threads.to}` : 'baseline';
  wl.append({ event: 'wave-capture', wave: label, digest,
    repos: data.repos.length,
    commits: data.repos.reduce((s, r) => s + r.commits, 0),
    chains: chainsAll.length,
    threads: data.open_threads.count,
    kin_top: data.kinship_top3[0] ? `${data.kinship_top3[0].a}~${data.kinship_top3[0].b}@${data.kinship_top3[0].cos}` : null,
    prior: prior ? prior.meta.label : null,
    diff: diffSummary,
  });
  fs.writeFileSync(witnessPath, wl.rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  const wv = verifyChain(wl.rows);
  check('witness chain verifies from disk', wv.ok, `${wl.length} rows, head ${wl.head.slice(0, 10)}`);

  fs.mkdirSync(path.join(__dirname, '..', 'outputs'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, '..', 'outputs', '12-erised-trends.json'), JSON.stringify({
    tool: 'erised-trends', run_at: new Date().toISOString(), mode: prior ? 'capture+diff' : 'capture+baseline',
    wave: label, snapshot_digest: digest, prior: prior ? prior.meta.label : null,
    witness: { verdict: wv, rows: wl.rows },
  }, null, 2) + '\n');

  console.log(`\n${ANSI.dim}The mirror held steady; what moved, moved.${ANSI.reset}`);
  done();
}
