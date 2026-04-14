document.addEventListener("DOMContentLoaded", function () {
    // Determine base path: pages in subdirectories need "../" prefix
    const depth = window.location.pathname.replace(/\/+$/, "").split("/").length - 1;
    const isSubdir = window.location.pathname.includes("/semesters/");
    const base = isSubdir ? "../" : "";

    function loadComponent(id, file) {
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
            })
            .catch(function () {
                // Silently fail — page content remains readable
            });
    }

    loadComponent("header", "header.html");
    loadComponent("footer", "footer.html");
});
