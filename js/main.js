document.addEventListener("DOMContentLoaded", function () {
    // Determine base path: pages in subdirectories need "../" prefix
    const isSubdir = window.location.pathname.includes("/semesters/");
    const base = isSubdir ? "../" : "";

    const prefersReducedMotion = window.matchMedia
        && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function loadComponent(id, file, done) {
        const el = document.getElementById(id);
        if (!el) return;

        fetch(base + "components/" + file)
            .then(function (res) {
                if (!res.ok) throw new Error(res.status);
                return res.text();
            })
            .then(function (html) {
                el.innerHTML = html;
                // Fix relative links inside loaded components
                el.querySelectorAll("[data-base-href]").forEach(function (a) {
                    a.href = base + a.getAttribute("data-base-href");
                });
                el.querySelectorAll("[data-base-src]").forEach(function (img) {
                    img.src = base + img.getAttribute("data-base-src");
                });
                if (typeof done === "function") done(el);
            })
            .catch(function () {
                // Silently fail — page content remains readable
            });
    }

    // Highlight the nav link matching the current page
    function setActiveNav(headerEl) {
        const path = window.location.pathname.replace(/\/+$/, "");
        const current = path.split("/").pop() || "index.html";
        const atRoot = current === "" || current === "index.html";

        headerEl.querySelectorAll("nav a[data-base-href]").forEach(function (a) {
            const target = a.getAttribute("data-base-href").split("/").pop();
            const isHome = target === "index.html";
            if ((isHome && atRoot) || (!isHome && current === target)) {
                a.classList.add("active");
            }
        });
    }

    // Staggered fade-up as cards scroll into view (progressive enhancement)
    function initScrollReveal() {
        const items = document.querySelectorAll(".project-card, .semester-card");
        if (!items.length) return;

        if (prefersReducedMotion || !("IntersectionObserver" in window)) {
            return; // leave content as-is, fully visible
        }

        const observer = new IntersectionObserver(function (entries, obs) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    entry.target.classList.add("is-visible");
                    obs.unobserve(entry.target);
                }
            });
        }, { threshold: 0.1, rootMargin: "0px 0px -40px 0px" });

        items.forEach(function (item, i) {
            item.classList.add("reveal");
            item.style.transitionDelay = Math.min(i, 8) * 45 + "ms";
            observer.observe(item);
        });
    }

    // Live text filter for the FS26 project grid
    function initProjectSearch() {
        const input = document.getElementById("project-search");
        const grid = document.querySelector(".project-grid");
        if (!input || !grid) return;

        const cards = Array.prototype.slice.call(grid.querySelectorAll(".project-card"));
        const total = cards.length;
        const countEl = document.getElementById("project-count");
        const emptyEl = document.getElementById("project-empty");

        // Pre-compute searchable text per card
        const haystacks = cards.map(function (card) {
            return card.textContent.toLowerCase().replace(/\s+/g, " ");
        });

        function setCount(shown) {
            if (!countEl) return;
            countEl.innerHTML = "Showing <strong>" + shown + "</strong> of " + total;
        }

        function apply() {
            const q = input.value.trim().toLowerCase();
            let shown = 0;
            cards.forEach(function (card, i) {
                const match = q === "" || haystacks[i].indexOf(q) !== -1;
                card.classList.toggle("is-hidden", !match);
                if (match) shown++;
            });
            setCount(shown);
            if (emptyEl) emptyEl.classList.toggle("is-visible", shown === 0);
        }

        input.addEventListener("input", apply);
        setCount(total);
    }

    // Swap broken GitHub OpenGraph thumbnails for a branded placeholder
    function initImageFallbacks() {
        document.querySelectorAll("img.card-image").forEach(function (img) {
            img.addEventListener("error", function handle() {
                img.removeEventListener("error", handle);
                img.classList.add("is-fallback");
                img.src = base + "images/hslu-logo.svg";
                img.alt = "HSLU project";
            });
        });
    }

    loadComponent("header", "header.html", setActiveNav);
    loadComponent("footer", "footer.html");

    initImageFallbacks();
    initProjectSearch();
    initScrollReveal();
});
