#!/usr/bin/env node
/*
 * fetch-arch-images.js — collect architecture diagrams for FS26 project cards.
 *
 * For each repo linked from semesters/fs26.html, scans the README for an
 * architecture diagram image, downloads the best match into
 * images/projects/fs26/{owner}-{repo}.{ext}, and rewrites the card <img> to
 *   src               = local diagram path
 *   data-fallback-src = GitHub OpenGraph URL
 * When no diagram is found the card is left on the OpenGraph URL (no
 * data-fallback-src), so the runtime fallback chain stays diagram → OG → logo.
 *
 * Usage:
 *   node tools/fetch-arch-images.js [--dry-run]
 *   GITHUB_TOKEN=ghp_… node tools/fetch-arch-images.js   (avoids rate limits)
 *
 * Zero dependencies. Requires Node 18+ (global fetch). Re-runnable / idempotent.
 */

"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const HTML_PATH = path.join(ROOT, "semesters", "fs26.html");
const IMG_DIR = path.join(ROOT, "images", "projects", "fs26");

const DRY_RUN = process.argv.includes("--dry-run");
const TOKEN = process.env.GITHUB_TOKEN || "";

const API = "https://api.github.com";
const UA = "hslu-mlops-arch-fetch";
// Floor of 4 means "Architecture/Overview heading + >=1 corroborating signal"
// or two non-heading signals. A heading match alone (+3) is too weak — it lets
// in tool-UI screenshots that merely sit under an "Overview" section.
const SCORE_FLOOR = 4;

// Content-Type → file extension for downloaded images.
const CONTENT_EXT = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/svg+xml": "svg",
    "image/webp": "webp",
    "image/gif": "gif",
};

const BADGE_RE = /img\.shields\.io|\/actions\/workflows\/|badge|\.svg\?|codecov|circleci|travis|licen[sc]e/i;
const HEADING_RE = /architect|system design|overview|pipeline|data flow|high.?level/i;
const TEXT_RE = /architect|diagram|overview|pipeline|system|flow/i;
const NEGATIVE_RE = /screenshot|demo|ui|dashboard|logo|preview/i;
const GITHUB_HOSTS = /^https?:\/\/(raw\.githubusercontent\.com|user-images\.githubusercontent\.com)\//i;

function ghHeaders(raw) {
    const h = { "User-Agent": UA, Accept: raw ? "application/vnd.github.raw" : "application/vnd.github+json" };
    if (TOKEN) h.Authorization = "Bearer " + TOKEN;
    return h;
}

// Abort cleanly on rate-limit rather than half-rewriting the HTML.
function checkRateLimit(res) {
    if (res.status === 403 && res.headers.get("x-ratelimit-remaining") === "0") {
        const reset = Number(res.headers.get("x-ratelimit-reset") || 0) * 1000;
        const when = reset ? new Date(reset).toISOString() : "unknown";
        throw new Error(`GitHub rate limit hit. Resets at ${when}. Set GITHUB_TOKEN to raise the limit.`);
    }
}

async function ghFetch(url, raw) {
    const res = await fetch(url, { headers: ghHeaders(raw) });
    checkRateLimit(res);
    return res;
}

// --- repo list ------------------------------------------------------------

function parseRepos(html) {
    const re = /href="https:\/\/github\.com\/([^/"]+)\/([^/"?#]+)"/g;
    const seen = new Set();
    const repos = [];
    let m;
    while ((m = re.exec(html))) {
        const key = m[1] + "/" + m[2];
        if (!seen.has(key)) {
            seen.add(key);
            repos.push({ owner: m[1], repo: m[2] });
        }
    }
    return repos;
}

// --- candidate extraction --------------------------------------------------

function extractCandidates(md) {
    const out = [];
    // Markdown: ![alt](path "title")
    const mdRe = /!\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)/g;
    let m;
    while ((m = mdRe.exec(md))) {
        out.push({ alt: m[1] || "", rawPath: m[2], index: m.index });
    }
    // Inline HTML: <img ... src="path" ... alt="...">
    const imgRe = /<img\b[^>]*>/gi;
    while ((m = imgRe.exec(md))) {
        const tag = m[0];
        const src = (tag.match(/\bsrc=["']([^"']+)["']/i) || [])[1];
        if (!src) continue;
        const alt = (tag.match(/\balt=["']([^"']*)["']/i) || [])[1] || "";
        out.push({ alt, rawPath: src, index: m.index });
    }
    return out;
}

function nearestHeading(md, index) {
    const before = md.slice(0, index);
    const headings = before.match(/^#{1,6}\s+.*$/gm);
    return headings && headings.length ? headings[headings.length - 1] : "";
}

function basename(p) {
    const clean = p.split(/[?#]/)[0];
    return clean.substring(clean.lastIndexOf("/") + 1);
}

function scoreCandidate(c, md) {
    const heading = nearestHeading(md, c.index);
    const file = basename(c.rawPath);
    let score = 0;
    if (HEADING_RE.test(heading)) score += 3;
    if (TEXT_RE.test(c.alt)) score += 2;
    if (TEXT_RE.test(file)) score += 2;
    if (/(^|\/)(docs|images|assets|img)\//i.test(c.rawPath)) score += 1;
    if (NEGATIVE_RE.test(file)) score -= 1;
    return score;
}

function pickDiagram(md) {
    const candidates = extractCandidates(md).filter((c) => {
        if (BADGE_RE.test(c.rawPath)) return false;
        // External absolute URLs: only re-host GitHub-hosted images.
        if (/^https?:\/\//i.test(c.rawPath) && !GITHUB_HOSTS.test(c.rawPath)) return false;
        return true;
    });
    let best = null;
    for (const c of candidates) {
        const score = scoreCandidate(c, md);
        if (score < SCORE_FLOOR) continue;
        if (!best || score > best.score) best = { ...c, score };
        // ties keep the earliest (extraction order is document order)
    }
    return best;
}

// --- path resolution + download -------------------------------------------

function resolveRawUrl(owner, repo, branch, rawPath) {
    if (GITHUB_HOSTS.test(rawPath)) return rawPath; // already absolute & hostable
    let p = rawPath.replace(/^\.\//, "");
    if (p.split("/").includes("..")) return null; // escapes repo root
    const encoded = p.split("/").map(encodeURIComponent).join("/");
    return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${encoded}`;
}

async function download(url, owner, repo) {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) return { ok: false, reason: `download HTTP ${res.status}` };
    const ct = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    const ext = CONTENT_EXT[ct];
    if (!ext) return { ok: false, reason: `unsupported content-type ${ct || "?"}` };
    const buf = Buffer.from(await res.arrayBuffer());
    const file = `${owner}-${repo}.${ext}`;
    if (!DRY_RUN) {
        fs.mkdirSync(IMG_DIR, { recursive: true });
        fs.writeFileSync(path.join(IMG_DIR, file), buf);
    }
    return { ok: true, file };
}

// Manual override: an image already collected at images/projects/fs26/{owner}-{repo}.*
// is honored even when the README scan finds nothing. Some diagrams live outside the
// root README (docs/, ARCHITECTURE.md, mermaid renders, GitHub user-attachments) and
// are dropped in by hand; this keeps them across reruns instead of reverting to OG.
function findLocalImage(owner, repo) {
    const prefix = `${owner}-${repo}.`;
    let files = [];
    try {
        files = fs.readdirSync(IMG_DIR);
    } catch (e) {
        return null;
    }
    const hit = files.find(
        (f) => f.startsWith(prefix) && /\.(png|jpg|jpeg|svg|webp|gif)$/i.test(f)
    );
    return hit || null;
}

// --- HTML rewrite (per-card, no DOM parser) --------------------------------

function ogUrl(owner, repo) {
    return `https://opengraph.githubassets.com/1/${owner}/${repo}`;
}

const IND = "                    "; // matches the card <img> indentation in fs26.html

// A diagram card wraps the <img> in .card-media so a hover zoom badge can be
// positioned and the runtime can toggle is-zoomable. Non-diagram cards stay a
// bare <img> on the OpenGraph URL. is-zoomable means "currently showing a real
// diagram"; js/main.js removes it if the diagram image fails to load.
function buildMedia(owner, repo, file) {
    if (file) {
        const local = `../images/projects/fs26/${file}`;
        const og = ogUrl(owner, repo);
        return (
            `<div class="card-media is-zoomable">\n` +
            `${IND}    <img class="card-image" src="${local}" data-fallback-src="${og}" alt="Project screenshot">\n` +
            `${IND}    <span class="card-zoom-badge" aria-hidden="true">⤢</span>\n` +
            `${IND}</div>`
        );
    }
    return `<img class="card-image" src="${ogUrl(owner, repo)}" alt="Project screenshot">`;
}

// Rewrite the card-image region in each card chunk. Matches either a bare
// <img class="card-image"> or an already-wrapped .card-media block, so reruns
// are idempotent and a repo gaining/losing a diagram flips cleanly.
function rewriteHtml(html, results) {
    const marker = 'class="project-card"';
    const mediaRe = /<div class="card-media[^"]*">[\s\S]*?<\/div>|<img\b[^>]*\bclass="card-image"[^>]*>/;
    const parts = html.split(marker);
    for (let i = 1; i < parts.length; i++) {
        let chunk = parts[i];
        const link = chunk.match(/href="https:\/\/github\.com\/([^/"]+)\/([^/"?#]+)"/);
        const block = chunk.match(mediaRe);
        if (!link || !block) continue;
        const owner = link[1];
        const repo = link[2];
        const r = results.get(owner + "/" + repo);
        chunk = chunk.replace(block[0], buildMedia(owner, repo, r && r.file ? r.file : null));
        parts[i] = chunk;
    }
    return parts.join(marker);
}

// --- main ------------------------------------------------------------------

async function scanRepo(owner, repo) {
    const key = owner + "/" + repo;
    const metaRes = await ghFetch(`${API}/repos/${owner}/${repo}`, false);
    if (!metaRes.ok) return { key, status: "err", note: `repo ${metaRes.status}` };
    const meta = await metaRes.json();
    const branch = meta.default_branch || "main";

    const readmeRes = await ghFetch(`${API}/repos/${owner}/${repo}/readme`, true);
    if (!readmeRes.ok) return { key, status: "none", note: `no README (${readmeRes.status})` };
    const md = await readmeRes.text();

    const pick = pickDiagram(md);
    if (!pick) {
        const note = /```mermaid/.test(md) ? "mermaid only" : "no diagram";
        return { key, status: "none", note };
    }

    const rawUrl = resolveRawUrl(owner, repo, branch, pick.rawPath);
    if (!rawUrl) return { key, status: "none", note: `bad path ${pick.rawPath}` };

    const dl = await download(rawUrl, owner, repo);
    if (!dl.ok) return { key, status: "err", note: dl.reason, picked: pick.rawPath };
    return { key, status: "ok", file: dl.file, picked: pick.rawPath, score: pick.score };
}

async function processRepo(owner, repo) {
    const key = owner + "/" + repo;
    const result = await scanRepo(owner, repo);
    if (result.status === "ok") return result;
    // README scan found nothing usable — honor a manually collected image if present.
    const local = findLocalImage(owner, repo);
    if (local) return { key, status: "ok", file: local, picked: "(local override)", score: 0 };
    return result;
}

(async function main() {
    const html = fs.readFileSync(HTML_PATH, "utf8");
    const repos = parseRepos(html);
    console.log(`${repos.length} repos${DRY_RUN ? " (dry-run)" : ""}${TOKEN ? " [authenticated]" : ""}\n`);

    const results = new Map();
    const rows = [];
    for (const { owner, repo } of repos) {
        let r;
        try {
            r = await processRepo(owner, repo);
        } catch (e) {
            // Rate-limit or network: stop before partial rewrite.
            console.error(`\nAborted: ${e.message}`);
            process.exit(1);
        }
        results.set(r.key, r);
        rows.push(r);
        const tag = r.status === "ok" ? "ok " : r.status === "none" ? "-- " : "err";
        const detail = r.status === "ok"
            ? `${r.picked}  score=${r.score}  -> images/projects/fs26/${r.file}`
            : (r.note || "");
        console.log(`[${tag}] ${r.key.padEnd(46)} ${detail}`);
    }

    if (!DRY_RUN) {
        const updated = rewriteHtml(html, results);
        if (updated !== html) fs.writeFileSync(HTML_PATH, updated);
    }

    const ok = rows.filter((r) => r.status === "ok").length;
    console.log(`\n${ok}/${repos.length} diagrams collected${DRY_RUN ? " (no files written)" : ""}.`);
})();
