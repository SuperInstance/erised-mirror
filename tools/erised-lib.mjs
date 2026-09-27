// erised-lib.mjs — the mirror's shared senses.
//
// Extracted (Task 30-b) from tool 11's inline logic so the mirror and the
// trend-tracker read the fleet through ONE implementation — reuse, not fork.
// Every function here is pure read: no writes, no network, no judgment.
//
// Consumers:
//   tools/11-erised.mjs        the mirror (IS / OPEN / RESONATES)
//   tools/12-erised-trends.mjs the mirror diffed over waves (trends/)
//
// Engineer swap-in: everything takes explicit roots, so pointing these at any
// multi-repo workspace is a two-constant change.

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { verifyChain as stoneVerify } from '../../quilt-stone/stone.mjs'; // THE STONE

// sh(): probe runner. stderr silenced (a missing 'origin' remote is an
// expected honest null, not console noise — receipted Task 30-b); parsed
// results are stdout-only, so silencing changes nothing measured.
export const sh = (cmd, cwd) => { try { return execSync(cmd, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return null; } };

// ── vitals: what IS ─────────────────────────────────────────────────────────
// Sorted readdir + fixed git probes => deterministic given repo state.
export function discoverRepos(REPOS_ROOT, SKIP) {
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
  return repos;
}

// ── genesis discovery (the Task-28 law: a chain must announce its genesis
// where a verifier can look) ─────────────────────────────────────────────────
export const genesisOf = (repoRoot) => {
  const cands = new Set(['GENESIS']);
  const walk = (dir, depth = 0) => {
    if (depth > 4) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
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

// ── chains: every receipt chain, verified through THE STONE ────────────────
// Same detection predicate as tool 11 (>= 3 rows carrying link fields); the
// mirror counts what it reports, the trend-tracker records tips and lengths.
export function scanChains(repos, REPOS_ROOT) {
  const chains = [];
  for (const r of repos) {
    const root = path.join(REPOS_ROOT, r.name);
    const walk = (dir, depth = 0) => {
      if (depth > 4) return;
      for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
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
            const rec = {
              repo: r.name,
              file: path.relative(root, fp),
              links: rows.length,
              ok: v.ok,
              asFound,
              tip: v.ok ? v.tip : null,
              alg: v.ok ? v.alg : null,
              genesis: v.ok ? v.genesis : null,
              why: v.ok ? null : v.why,
            };
            chains.push(rec);
          }
        }
      }
    };
    walk(root);
  }
  return chains;
}

// ── open threads: the fleet's desires, read honestly from the worklog ──────
export function openThreads(WORKLOG) {
  if (!fs.existsSync(WORKLOG)) return [];
  const lines = fs.readFileSync(WORKLOG, 'utf8').split('\n');
  const want = /(parked|handoff|PUSH BLOCKED|push blocked|NOT pushed|local commit.*ready|needs? a rolled token|next wave|next:|unassigned)/i;
  let desires = lines.filter((l) => want.test(l)).map((l) => l.trim()).filter((l) => l.length > 12 && l.length < 300);
  return [...new Set(desires)].slice(-12);
}

// ── kinship: local-embedding resonance between repo self-descriptions ──────
export function kinship(repos, REPOS_ROOT, { localEmbed, cosine }) {
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
  kinships.sort((x, y) => y.cos - x.cos || (x.a + x.b).localeCompare(y.a + y.b));
  return kinships;
}

// ── import edges: who leans on whom ─────────────────────────────────────────
export function importEdges(repos, REPOS_ROOT) {
  const edges = new Set();
  for (const r of repos) {
    const root = path.join(REPOS_ROOT, r.name);
    const walk = (dir, depth = 0) => {
      if (depth > 4) return;
      for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
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
  return [...edges].sort();
}
