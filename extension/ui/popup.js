// Wandful — the Spellbook popup. Per-site spells, recipe library, quick cast.
import { RECIPES, recipeCss } from "./recipes.js";

const $ = (sel) => document.querySelector(sel);

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function originOf(tab) {
  try {
    return new URL(tab.url).origin;
  } catch {
    return null;
  }
}

async function render() {
  const tab = await activeTab();
  const origin = originOf(tab);
  $("#site").textContent = origin || "This page can’t be wanded";
  $("#cast").disabled = !/^https?:/.test(tab.url || "");

  const { spells = {} } = await chrome.storage.local.get("spells");
  const mine = Object.values(spells)
    .filter((s) => s.match.origin === origin)
    .sort((a, b) => b.createdAt - a.createdAt);

  const box = $("#spells");
  box.innerHTML = "";
  if (!mine.length) {
    box.innerHTML = `<div class="empty">No spells here yet. Cast one — or install a recipe below.</div>`;
  }
  for (const s of mine) {
    const row = document.createElement("div");
    row.className = "spell";
    const stale = s.status === "stale";
    row.innerHTML = `
      <input type="checkbox" ${s.status !== "off" ? "checked" : ""} title="Toggle spell" />
      <div class="txt">
        <div class="intent" title="${escapeHtml(s.intent)}">${escapeHtml(s.intent)}</div>
        <div class="meta">${escapeHtml(s.engine || "")} · ${s.stats?.appliedCount || 0} applied
          ${stale ? '· <span class="stale">stale — re-cast?</span>' : ""}</div>
      </div>
      <button class="iconbtn" data-act="recast" title="Re-cast">↻</button>
      <button class="iconbtn" data-act="delete" title="Delete">✕</button>`;
    row.querySelector("input").addEventListener("change", async (e) => {
      s.status = e.target.checked ? "on" : "off";
      s.updatedAt = Date.now();
      const { spells = {} } = await chrome.storage.local.get("spells");
      spells[s.id] = s;
      await chrome.storage.local.set({ spells });
    });
    row.querySelector('[data-act="delete"]').addEventListener("click", async () => {
      const { spells = {} } = await chrome.storage.local.get("spells");
      delete spells[s.id];
      await chrome.storage.local.set({ spells });
      render();
    });
    row.querySelector('[data-act="recast"]').addEventListener("click", async () => {
      const res = await chrome.runtime.sendMessage({ type: "wandful:recast", id: s.id });
      row.querySelector(".meta").textContent = res?.ok ? "re-cast ✓ (reload page)" : res?.error || "failed";
    });
    box.appendChild(row);
  }

  // Recipe library: one click installs the recipe as spells on its origins.
  const rbox = $("#recipes");
  rbox.innerHTML = "";
  for (const r of RECIPES) {
    const installed = r.origins.length && Object.values(spells).some((s) => s.recipeId === r.id);
    const row = document.createElement("div");
    row.className = "recipe";
    row.innerHTML = `
      <div class="txt">
        <div class="title">${escapeHtml(r.title)}</div>
        <div class="desc">${escapeHtml(r.desc)}</div>
      </div>
      <button class="install">${installed ? "installed ✓" : "install"}</button>`;
    row.querySelector(".install").addEventListener("click", () => installRecipe(r, row));
    if (installed) row.querySelector(".install").disabled = true;
    rbox.appendChild(row);
  }
}

async function installRecipe(recipe, btn) {
  const tab = await activeTab();
  const origin = originOf(tab);
  const targets = recipe.anyOrigin && origin ? [origin] : recipe.origins;
  if (!targets.length && !recipe.anyOrigin) return;
  if (recipe.anyOrigin && !/^https?:/.test(tab.url || "")) return;
  const { spells = {} } = await chrome.storage.local.get("spells");
  const now = Date.now();
  for (const origin of targets) {
    const id = "rc-" + recipe.id + "-" + origin.replace(/\W/g, "");
    spells[id] = {
      id,
      match: { origin, pathGlob: "*" },
      intent: recipe.title,
      target: { kind: "pattern", selector: recipe.chain.join(", "), chain: recipe.chain, fingerprint: null, evidence: [] },
      effect: { kind: "css", css: recipeCss(recipe) },
      status: "on",
      stats: { appliedCount: 0 },
      engine: "recipe",
      recipeId: recipe.id,
      createdAt: now,
      updatedAt: now,
    };
  }
  await chrome.storage.local.set({ spells });
  // Register the applier on the current tab's origin right away (SW owns it).
  await chrome.runtime.sendMessage({ type: "wandful:register-origin", origin }).catch(() => {});
  btn.textContent = "installed ✓ — reload page";
  btn.disabled = true;
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

$("#cast").addEventListener("click", async () => {
  const tab = await activeTab();
  if (!tab?.id) return;
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["lib/fingerprint.js", "content/cast.js"],
  }).catch(() => {});
  chrome.tabs.sendMessage(tab.id, { type: "wandful:cast" }).catch(() => {});
  window.close();
});

$("#open-options").addEventListener("click", (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

$("#export").addEventListener("click", async (e) => {
  e.preventDefault();
  const { spells = {} } = await chrome.storage.local.get("spells");
  const blob = new Blob([JSON.stringify(Object.values(spells), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "wandful-spells.json";
  a.click();
  URL.revokeObjectURL(url);
});

render();
