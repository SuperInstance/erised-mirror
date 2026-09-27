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
// are the reusable shape.

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTool, check, done, WitnessLog, check as _check, localEmbed, cosine, ANSI } from '../quilt-toolkit.mjs';
import { verifyChain as stoneVerify } from '../../quilt-stone/stone.mjs'; // THE STONE: one verifier for every dialect

setTool('erised');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPOS_ROOT = path.resolve(__dirname, '..', '..');
const WORKLOG = path.join(REPOS_ROOT, '..', 'worklog.md');
const SKIP = new Set(['node_modules', '.git', 'quilt-quant']);

const sh = (cmd, cwd) => { try { return execSync(cmd, { cwd, encoding: 'utf8' }).trim(); } catch { return null; } };

// ── section 1: what IS ───────────────────────────────────────────────────────
const repos = [];
for (const d of fs.readdirSync(REPOS_ROOT, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
  if (!d.isDirectory() || SKIP.has(d.name)) continue;
  const p = path.join(REPOS_ROOT, d.name);
  if (!fs.existsSync(path.join(p, '.git'))) continue;
  const count = sh('git rev-list --count HEAD', p);
  repos.push({
    name: d.name,
    commits: count ? parseInt(count, 10) : 0,
    first: sh('git log --reverse --format=%ad --date=short | head -1', p) || '?',
    last: sh('git log -1 --format=%ad --date=short', p) || '?',
    subject: (sh('git log -1 --format=%s', p) || '').slice(0, 72),
    dirty: (sh('git status --porcelain', p) || '').split('\n').filter((s) => s.trim()).length,
    remote: sh('git remote get-url origin', p) ? true : false,
  });
}
console.log(`${ANSI.bold}Erised, section I — what IS${ANSI.reset}`);
for (const r of repos) {
  console.log(`  ${r.name.padEnd(16)} ${String(r.commits).padStart(3)} commits  ${r.first}..${r.last}  ${r.remote ? 'on-GitHub' : 'local-only'}${r.dirty ? `  ${ANSI.yellow}${r.dirty} dirty${ANSI.reset}` : ''}`);
}
check('mirror found the fleet (>= 8 git repos)', repos.length >= 8, `${repos.length} repos`);

// chains: every receipt chain in every repo must verify — through the STONE,
// with genesis discovery. FINDING (receipted): yiluodi seals its chains with
// per-experiment genesis ('YILUODI-E-L1-GENESIS'); a verifier that only tries
// the dialect default reads VALID chains as broken. Law: a chain must declare
// its genesis in its own sources; the mirror learns to read the declaration.
const genesisOf = (repoRoot) => {
  const cands = new Set(['GENESIS']);
  const walk = (dir, depth = 0) => {
    if (depth > 4) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith('.') || e.name === 'node_modules') continue;
      const fp = path.join(dir, e.name);
      if (e.isDirectory()) walk(fp, depth + 1);
      else if (/\.(mjs|js|py)$/.test(e.name)) {
        const src = fs.readFileSync(fp, 'utf8');
        for (const m of src.matchAll(/new (?:[A-Za-z_$]+\.)?(?:Chain|Receipts)\('([^']+)'\)|sealChain\([^,]+,\s*'([^']+)'|genesis:\s*'([^']+)'|genesis\s*=\s*'([^']+)'/g))
          for (const g of m.slice(1)) if (g) cands.add(g);
      }
    }
  };
  walk(repoRoot);
  return [...cands].slice(0, 40);
};
let chainsOk = 0, chainsBad = 0, chainsAsFound = 0;
const badChains = [];
for (const r of repos) {
  const root = path.join(REPOS_ROOT, r.name);
  const walk = (dir, depth = 0) => {
    if (depth > 4) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith('.') || e.name === 'node_modules') continue;
      const fp = path.join(dir, e.name);
      if (e.isDirectory()) walk(fp, depth + 1);
      else if (e.name.endsWith('.jsonl')) {
        const rows = fs.readFileSync(fp, 'utf8').trim().split('\n').map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
        if (rows.length >= 3 && rows.every((x) => x && typeof x === 'object' && ('row_hash' in x || 'hash' in x || 'prev_hash' in x))) {
          const cands = genesisOf(root);
          let v = stoneVerify(rows);
          let asFound = false;
          if (!v.ok) {
            for (const g of cands) { const v2 = stoneVerify(rows, g); if (v2.ok) { v = v2; asFound = true; break; } }
          }
          if (v.ok) { chainsOk++; if (asFound) chainsAsFound++; }
          else { chainsBad++; badChains.push(`${r.name}/${path.relative(root, fp)}: ${v.why}`); }
        }
      }
    }
  };
  walk(root);
}
check('every receipt chain in the fleet verifies', chainsBad === 0, `${chainsOk} chains ok (${chainsAsFound} via declared genesis), ${chainsBad} broken${badChains.length ? ': ' + badChains.slice(0, 3).join(' | ') : ''}`);

// ── section 2: what is OPEN (the fleet's desires, read honestly) ────────────
console.log(`\n${ANSI.bold}Erised, section II — what is OPEN${ANSI.reset}`);
let desires = [];
if (fs.existsSync(WORKLOG)) {
  const lines = fs.readFileSync(WORKLOG, 'utf8').split('\n');
  const want = /(parked|handoff|PUSH BLOCKED|push blocked|NOT pushed|local commit.*ready|needs? a rolled token|next wave|next:|unassigned)/i;
  desires = lines.filter((l) => want.test(l)).map((l) => l.trim()).filter((l) => l.length > 12 && l.length < 300);
  desires = [...new Set(desires)].slice(-12);
  for (const d of desires) console.log(`  · ${d.slice(0, 110)}`);
}
check('worklog desires readable (>= 1 open thread)', desires.length >= 1, `${desires.length} open threads the mirror can see`);

// ── section 3: what RESONATES (local-embedding kinship, zero network) ───────
console.log(`\n${ANSI.bold}Erised, section III — what RESONATES${ANSI.reset}`);
const embeddings = [];
for (const r of repos) {
  const readme = ['README.md', 'readme.md'].map((n) => path.join(REPOS_ROOT, r.name, n)).find((p) => fs.existsSync(p));
  const text = readme ? fs.readFileSync(readme, 'utf8').slice(0, 600) : r.subject;
  embeddings.push({ name: r.name, vec: localEmbed(text) });
}
const kinships = [];
for (let i = 0; i < embeddings.length; i++) {
  for (let j = i + 1; j < embeddings.length; j++) {
    const c = cosine(embeddings[i].vec, embeddings[j].vec);
    if (c > 0.55) kinships.push({ a: embeddings[i].name, b: embeddings[j].name, cos: +c.toFixed(3) });
  }
}
kinships.sort((x, y) => y.cos - x.cos);
for (const k of kinships.slice(0, 6)) console.log(`  ${k.a} ~ ${k.b}  (cos ${k.cos})`);
check('kinship scan produced signal', kinships.length >= 1, `${kinships.length} resonant pairs above cos 0.55`);

// cross-repo import edges: who leans on whom
const edges = new Set();
for (const r of repos) {
  const root = path.join(REPOS_ROOT, r.name);
  const walk = (dir, depth = 0) => {
    if (depth > 4) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith('.') || e.name === 'node_modules') continue;
      const fp = path.join(dir, e.name);
      if (e.isDirectory()) walk(fp, depth + 1);
      else if (/\.(mjs|js|py)$/.test(e.name)) {
        const src = fs.readFileSync(fp, 'utf8');
        for (const m of src.matchAll(/(?:from\s+|import\s*\(\s*)['"]([^'"]+)['"]/g)) {
          const segs = m[1].split('/');
          const target = m[1].startsWith('.') ? segs.find((s) => s !== '..' && s !== '.') : null;
          if (target && target !== r.name && repos.some((x) => x.name === target)) edges.add(`${r.name}->${target}`);
        }
      }
    }
  };
  walk(root);
}
console.log(`\n  edges: ${[...edges].sort().join(', ') || '(none)'}`);
check('the fleet leans on itself (>= 1 cross-repo edge)', edges.size >= 1, `${edges.size} edges`);

// ── the mirror's own witness log (WitnessLog already chains internally) ─────
const wl = new WitnessLog();
wl.append('mirror-run', { repos: repos.length, chains_ok: chainsOk, chains_bad: chainsBad, desires: desires.length, edges: [...edges] });
const v = wl.verify();
check('the mirror is itself receipted', v.ok, `witness chain ${wl.length} rows, head ${wl.head.slice(0, 10)}`);
fs.mkdirSync(path.join(__dirname, '..', 'outputs'), { recursive: true });
fs.writeFileSync(path.join(__dirname, '..', 'outputs', '11-erised.json'), JSON.stringify({
  tool: 'erised', run_at: new Date().toISOString(),
  is: repos, chains: { ok: chainsOk, bad: chainsBad, asFound: chainsAsFound },
  open: desires, resonates: kinships, edges: [...edges].sort(),
  witness: { verdict: v, rows: wl.rows },
}, null, 2) + '\n');

console.log(`\n${ANSI.dim}The mirror asks only: look, and keep building what you see.${ANSI.reset}`);
done();
