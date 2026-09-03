// Wandful — apply.js: registered per-origin at document_start.
// Reads this origin's spells from chrome.storage.local and injects ONE <style>
// before first paint (no FOUC). Records match counts so stale spells surface
// in the Spellbook. Runs in the isolated world; no page JS is touched.
(() => {
  const STYLE_ID = "wandful-spells";

  function applyCss(css) {
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      (document.head || document.documentElement).appendChild(style);
    }
    style.textContent = css;
  }

  function collectSpells(spells) {
    const origin = location.origin;
    const path = location.pathname + location.search;
    const active = Object.values(spells || {}).filter(
      (s) =>
        s.status === "on" &&
        s.match.origin === origin &&
        s.effect?.kind === "css" &&
        globMatch(s.match.pathGlob || "*", path)
    );
    // Later spells can undo earlier ones; apply in creation order.
    active.sort((a, b) => a.createdAt - b.createdAt);
    return active;
  }

  function globMatch(glob, str) {
    if (glob === "*" || glob === "**") return true;
    const rx = new RegExp("^" + glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$");
    return rx.test(str);
  }

  function countMatches(spell) {
    let n = 0;
    for (const sel of spell.target.chain || []) {
      try {
        n = document.querySelectorAll(sel).length;
        if (n > 0) break;
      } catch { /* try next in chain */ }
    }
    return n;
  }

  function markStats(spells, active) {
    if (!active.length || !spells) return;
    const now = Date.now();
    for (const s of active) {
      const matched = countMatches(s);
      s.stats = s.stats || {};
      if (matched > 0) {
        s.stats.appliedCount = (s.stats.appliedCount || 0) + 1;
        s.stats.lastAppliedAt = now;
        if (s.status === "stale") s.status = "on";
      } else {
        s.stats.lastFailedAt = now;
        if (s.stats.appliedCount) s.status = "stale";
      }
    }
    chrome.storage.local.set({ spells });
  }

  function run(spells) {
    const active = collectSpells(spells);
    applyCss(active.map((s) => s.effect.css).join("\n"));
    if (document.readyState === "complete") markStats(spells, active);
    else addEventListener("load", () => markStats(spells, active), { once: true });
  }

  chrome.storage.local.get("spells", ({ spells }) => run(spells));

  // SPA route changes: re-apply (pathGlob may now match differently).
  let lastPath = location.pathname + location.search;
  const recheck = () => {
    const p = location.pathname + location.search;
    if (p === lastPath) return;
    lastPath = p;
    chrome.storage.local.get("spells", ({ spells }) => run(spells));
  };
  addEventListener("popstate", recheck);
  setInterval(() => {
    if (location.pathname + location.search !== lastPath) recheck();
  }, 1500);
})();
