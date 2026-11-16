// Hover cards for merged terms: show every source's meaning and "appears in".
document.addEventListener("DOMContentLoaded", () => {
  const tip = document.createElement("div"); tip.className = "tip2"; tip.style.display = "none"; document.body.appendChild(tip);
  const show = (el) => {
    const t = WIKI.byId[el.dataset.t]; if (!t) return;
    const sec = WIKI.sections.find(s => s.id === t.sec).name;
    const body = t.src.length > 1 ? t.src.map(s => `<b>In ${WIKI.sources.find(x=>x.id===s).name}</b>${t.defs[s]}`).join("") : t.defs[t.src[0]];
    tip.innerHTML = `<div class="k">${sec}</div><div class="n">${t.name}</div><div class="x">${body}</div><div class="a">Appears in: ${t.src.map(s=>WIKI.sources.find(x=>x.id===s).name).join(" · ")}</div>`;
    const r = el.getBoundingClientRect();
    tip.style.left = Math.min(innerWidth - 360, Math.max(16, r.left + scrollX - 12)) + "px";
    tip.style.display = "block";
    const h = tip.offsetHeight, below = r.bottom + 10 + h < innerHeight;
    tip.style.top = (below ? r.bottom + scrollY + 10 : r.top + scrollY - h - 10) + "px";
  };
  document.querySelectorAll("a.dt").forEach(a => { a.onmouseenter = () => show(a); a.onmouseleave = () => tip.style.display = "none"; });
  const p = document.querySelector("a.dt[data-pin]"); if (p) show(p);
});
