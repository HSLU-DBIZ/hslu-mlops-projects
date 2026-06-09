# HSLU MLOps Student Projects

Public showcase website for student projects from the Machine Learning Operations (MLOps) course at Hochschule Luzern.

Hosted via GitHub Pages.

## Project Structure

```
├── index.html              # Landing page (course info + semester links)
├── semesters/              # One HTML file per semester
│   └── fs26.html           # Frühlingssemester 2026
├── components/             # Shared HTML fragments (loaded via JS)
│   ├── header.html
│   └── footer.html
├── css/
│   └── style.css
├── js/
│   └── main.js             # Loads header/footer, image fallback chain
├── tools/
│   └── fetch-arch-images.js # Collects repo architecture diagrams (see below)
└── images/
    ├── hslu-logo.svg
    ├── favicon.ico
    └── projects/           # Student project images (incl. collected diagrams)
        └── fs26/
```

## Adding a New Semester

1. Copy an existing semester file, e.g. `semesters/fs26.html` → `semesters/hs26.html`
2. Update the semester title and eyebrow text in the new file
3. Clear out the example project cards
4. For each student project, copy the card template (at the bottom of the file) and fill in:
   - `IMAGE.png` — project screenshot
   - `PROJECT TITLE`
   - `STUDENT NAME`
   - `PROJECT SUMMARY` (2–3 sentences)
   - `GITHUB_URL`
5. Add project images to `images/projects/hs26/`
6. Add a semester card link in `index.html`
7. Add a nav link in `components/header.html`
8. Push to GitHub

## Adding a Project Card

Copy this block into the semester HTML file inside the `<div class="project-grid">`:

```html
<div class="project-card">
    <img class="card-image" src="../images/projects/fs26/IMAGE.png" alt="Project screenshot">
    <div class="card-body">
        <h2 class="card-title">PROJECT TITLE</h2>
        <p class="card-author">STUDENT NAME</p>
        <p class="card-summary">
            PROJECT SUMMARY (2-3 sentences)
        </p>
        <a class="card-link" href="GITHUB_URL" target="_blank" rel="noopener">
            GitHub →
        </a>
    </div>
</div>
```

## Collecting Architecture Diagrams

Many student repos include an architecture diagram in their README/`docs/`.
`tools/fetch-arch-images.js` collects these and wires them into the cards.

```bash
# preview picks without downloading or editing anything
node tools/fetch-arch-images.js --dry-run

# download diagrams into images/projects/fs26/ and rewrite the cards
GITHUB_TOKEN="$(gh auth token)" node tools/fetch-arch-images.js
```

For each repo linked from `semesters/fs26.html`, the script scans the README,
scores image candidates (heading/alt/filename signals, badges excluded), and
downloads the best match to `images/projects/fs26/{owner}-{repo}.{ext}`. The
card's `<img>` is rewritten so its `src` points at the local diagram and a
`data-fallback-src` attribute holds the GitHub OpenGraph URL. Cards with no
detected diagram keep the OpenGraph URL as their `src`.

### Diagrams the README scan can't find

Some diagrams live outside the root README — in `docs/`, an `ARCHITECTURE.md`,
a GitHub user-attachment, or a Mermaid block. For those, **drop the image in by
hand** and re-run: the script honors any file already at
`images/projects/fs26/{owner}-{repo}.{ext}` (the *local override*) and wires the
card to it instead of reverting to the OpenGraph thumbnail. Naming must match
the repo's `owner` and `name` exactly. To render a Mermaid diagram to PNG, paste
the source into <https://mermaid.ink> or use `@mermaid-js/mermaid-cli`.

Large images can be downscaled for the web (the lightbox needs no more than
~1800px wide), e.g. `sips --resampleWidth 1800 images/projects/fs26/*.png`.

This gives each card a three-tier image fallback (handled in `js/main.js`):

1. **Architecture diagram** (local file), else
2. **GitHub OpenGraph** thumbnail (`data-fallback-src`), else
3. **HSLU logo** (`is-fallback` styling).

The script is re-runnable/idempotent — review the report and `git diff`, then
commit. `GITHUB_TOKEN` is optional (raises the API rate limit; `gh auth token`
works if the GitHub CLI is logged in). It never deletes downloaded files.

## Local Development

```bash
python3 -m http.server 8090
```

Then open `http://localhost:8090` in your browser. A local server is required because the shared header/footer are loaded via `fetch()`.
