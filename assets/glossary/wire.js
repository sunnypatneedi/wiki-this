// Glossary shell glue: A to Z list, source chips, drawer, and events for map.js.
// Expects window.WIKI (sources, sections, byId with related[] and used[]) and #terms.
(function () {
  const W = window.WIKI;
  if (!W || !W.byId) return;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const root = document.getElementById("terms");
  const srcName = (id) => (W.sources.find((x) => x.id === id) || { name: id }).name;

  function paintList(src) {
    if (!root) return;
    const only = new URLSearchParams(location.search).get("term");
    const terms = Object.values(W.byId)
      .filter((t) => !src || t.src.includes(src))
      .sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
    root.innerHTML = terms
      .map((t) => {
        const names = t.src.map(srcName).join(" · ");
        const open = only === t.id ? " open" : "";
        const defs = t.src
          .map((s) => `<p><b>${srcName(s)}</b> ${t.defs[s]}</p>`)
          .join("");
        const related = (t.related || [])
          .map((id) => {
            const r = W.byId[id];
            return r
              ? `<a class="see" href="glossary.html?term=${id}" data-term-link="${id}">${r.name}</a>`
              : "";
          })
          .filter(Boolean)
          .join(" · ");
        const see = related
          ? `<p class="see-row">See also ${related}</p>`
          : "";
        return `<details class="more"${open} id="${t.id}" data-term="${t.id}"><summary>${t.name} <span class="mute">${names}</span></summary><div class="body">${defs}${see}</div></details>`;
      })
      .join("");
  }

  function setFilter(src, push) {
    $$("[data-src]").forEach((b) =>
      b.setAttribute("aria-pressed", String((b.dataset.src || "") === src))
    );
    if (push) {
      const u = new URL(location.href);
      src ? u.searchParams.set("src", src) : u.searchParams.delete("src");
      history.replaceState(history.state, "", u);
    }
    paintList(src);
    document.dispatchEvent(new CustomEvent("wiki:filter", { detail: src }));
  }

  $$("[data-src]").forEach((b) =>
    b.addEventListener("click", () => setFilter(b.dataset.src || "", true))
  );

  // Mobile drawer (glossary collapses the sidebar into the drawer).
  const dr = $(".drawer");
  const sc = $(".scrimd");
  const setDr = (o) => {
    if (!dr) return;
    dr.classList.toggle("open", o);
    if (sc) sc.classList.toggle("open", o);
    $$("[data-act=menu]").forEach((b) =>
      b.setAttribute("aria-expanded", String(o))
    );
  };
  $$("[data-act=menu]").forEach((b) =>
    b.addEventListener("click", () => setDr(!dr.classList.contains("open")))
  );
  sc && sc.addEventListener("click", () => setDr(false));

  // Sound toggle (map.js reads aria-pressed; no AudioContext until the user turns it on).
  $$("[data-sound-toggle]").forEach((b) => {
    const rm = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (rm) {
      b.setAttribute("aria-disabled", "true");
      b.setAttribute("aria-pressed", "false");
      b.title = "Sound is off while reduced motion is on";
      b.setAttribute("aria-label", b.title);
    }
    b.addEventListener("click", () => {
      if (b.getAttribute("aria-disabled") === "true") return;
      const on = b.getAttribute("aria-pressed") !== "true";
      $$("[data-sound-toggle]").forEach((x) => {
        x.setAttribute("aria-pressed", String(on));
        x.title = on ? "Sound on" : "Sound off";
        x.setAttribute("aria-label", on ? "Turn sound off" : "Turn sound on");
      });
    });
  });

  // Cmd+K focuses search when present.
  const q = $("#q");
  if (q) {
    document.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        q.focus();
      }
    });
  }

  // Deep link: ?term= opens the sheet via map.js (wiki:term) once the map is ready.
  const boot = new URLSearchParams(location.search);
  const src0 = boot.get("src") || "";
  setFilter(src0, false);
  const term0 = boot.get("term");
  if (term0 && W.byId[term0]) {
    const fire = () =>
      document.dispatchEvent(new CustomEvent("wiki:term", { detail: term0 }));
    if (window.__graph) fire();
    else requestAnimationFrame(() => requestAnimationFrame(fire));
  }

  root &&
    root.addEventListener("click", (e) => {
      const a = e.target.closest("[data-term-link]");
      if (!a) return;
      e.preventDefault();
      document.dispatchEvent(
        new CustomEvent("wiki:term", { detail: a.dataset.termLink })
      );
    });
})();
