// 11 — erised: the fleet's mirror.
//
// Realm: the community itself.
//
// Erised is the mirror that shows the fleet to itself. It walks every repo in
// the ecosystem and reports what IS (commits, chains, smokes-on-record, who
// imports whom), what is OPEN (parked briefs, blocked pushes, handoffs — read
// honestly from the shared worklog), and what RESONATES (local-embedding
// kinship between repo self-descriptions — no API, no network, just the
// toolkit's hasher). Nothing here judges; a mirror's whole job is to be
// accurate. The run itself is witness-logged, because the mirror is also part
// of the fleet.
//
// Engineer swap-in: point REPOS_ROOT at any multi-repo workspace and WORKLOG
// at any append-only team journal — the three sections (IS / OPEN / RESONATES)
// are the reusable shape. (Task 30-b: the sensing logic now lives in
// erised-lib.mjs, shared with tool 12 — one mirror, many sittings.)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTool, check, done, WitnessLog, localEmbed, cosine, ANSI } from '../quilt-toolkit.mjs';
import { discoverRepos, scanChains, openThreads, kinship, importEdges } from './erised-lib.mjs';

setTool('erised');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPOS_ROOT = path.resolve(__dirname, '..', '..');
const WORKLOG = path.join(REPOS_ROOT, '..', 'worklog.md');
const SKIP = new Set(['node_modules', '.git', 'quilt-quant']);

// ── section 1: what IS ───────────────────────────────────────────────────────
const repos = discoverRepos(REPOS_ROOT, SKIP);
console.log(`${ANSI.bold}Erised, section I — what IS${ANSI.reset}`);
for (const r of repos) {
  console.log(`  ${r.name.padEnd(16)} ${String(r.commits).padStart(3)} commits  ${r.first}..${r.last}  ${r.remote ? 'on-GitHub' : 'local-only'}${r.dirty ? `  ${ANSI.amber}${r.dirty} dirty${ANSI.reset}` : ''}`);
}
check('mirror found the fleet (>= 8 git repos)', repos.length >= 8, `${repos.length} repos`);

// chains: every receipt chain in every repo must verify — through the STONE,
// with genesis discovery. FINDING (receipted, Task 28): yiluodi seals its
// chains with per-experiment genesis ('YILUODI-E-L1-GENESIS'); a verifier that
// only tries the dialect default reads VALID chains as broken. Law: a chain
// must declare its genesis in its own sources; the mirror learns to read the
// declaration.
const chains = scanChains(repos, REPOS_ROOT);
const chainsOk = chains.filter((c) => c.ok).length;
const chainsBad = chains.filter((c) => !c.ok).length;
const chainsAsFound = chains.filter((c) => c.ok && c.asFound).length;
const badChains = chains.filter((c) => !c.ok).map((c) => `${c.repo}/${c.file}: ${c.why}`);
check('every receipt chain in the fleet verifies', chainsBad === 0, `${chainsOk} chains ok (${chainsAsFound} via declared genesis), ${chainsBad} broken${badChains.length ? ': ' + badChains.slice(0, 3).join(' | ') : ''}`);

// ── section 2: what is OPEN (the fleet's desires, read honestly) ────────────
console.log(`\n${ANSI.bold}Erised, section II — what is OPEN${ANSI.reset}`);
const desires = openThreads(WORKLOG);
for (const d of desires) console.log(`  · ${d.slice(0, 110)}`);
check('worklog desires readable (>= 1 open thread)', desires.length >= 1, `${desires.length} open threads the mirror can see`);

// ── section 3: what RESONATES (local-embedding kinship, zero network) ───────
console.log(`\n${ANSI.bold}Erised, section III — what RESONATES${ANSI.reset}`);
const kinships = kinship(repos, REPOS_ROOT, { localEmbed, cosine });
for (const k of kinships.slice(0, 6)) console.log(`  ${k.a} ~ ${k.b}  (cos ${k.cos})`);
check('kinship scan produced signal', kinships.length >= 1, `${kinships.length} resonant pairs above cos 0.55`);

const edges = importEdges(repos, REPOS_ROOT);
console.log(`\n  edges: ${edges.join(', ') || '(none)'}`);
check('the fleet leans on itself (>= 1 cross-repo edge)', edges.length >= 1, `${edges.length} edges`);

// ── the mirror's own witness log (WitnessLog already chains internally) ─────
const wl = new WitnessLog();
// FINDING (receipted Task 30-b): the Task-28 run called append('mirror-run', {...}) —
// but append(fields) takes ONE object; the string label was spread char-by-char
// into the row, so the mirror's witness chain verified while receipting nothing
// but {"0":"m","1":"i",...}. Fixed at the call site; toolkit untouched.
wl.append({ event: 'mirror-run', repos: repos.length, chains_ok: chainsOk, chains_bad: chainsBad, desires: desires.length, edges });
const v = wl.verify();
check('the mirror is itself receipted', v.ok, `witness chain ${wl.length} rows, head ${wl.head.slice(0, 10)}`);
fs.mkdirSync(path.join(__dirname, '..', 'outputs'), { recursive: true });
fs.writeFileSync(path.join(__dirname, '..', 'outputs', '11-erised.json'), JSON.stringify({
  tool: 'erised', run_at: new Date().toISOString(),
  is: repos, chains: { ok: chainsOk, bad: chainsBad, asFound: chainsAsFound },
  open: desires, resonates: kinships, edges,
  witness: { verdict: v, rows: wl.rows },
}, null, 2) + '\n');

console.log(`\n${ANSI.dim}The mirror asks only: look, and keep building what you see.${ANSI.reset}`);
done();
