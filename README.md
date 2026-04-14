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
│   └── main.js             # Loads header/footer into pages
└── images/
    ├── hslu-logo.svg
    ├── favicon.ico
    └── projects/           # Student project images
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

## Local Development

```bash
python3 -m http.server 8090
```

Then open `http://localhost:8090` in your browser. A local server is required because the shared header/footer are loaded via `fetch()`.
