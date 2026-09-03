// Wandful — MV3 service worker. Stateless by design: spells live in
// chrome.storage.local and are applied by content scripts, so everything
// survives worker death. Duties: compile intents (LLM or heuristic), persist
// spells, keep per-origin content-script registrations in sync.
import { heuristicCss } from "../content/heuristics.js";

const APPLY_JS = "content/apply.js";
const MAX_CSS = 20000;

chrome.runtime.onInstalled.addListener(() => syncRegistrations());

chrome.commands?.onCommand.addListener((cmd) => {
  if (cmd === "start-cast") castInActiveTab();
});

chrome.action?.onClicked?.addListener?.(castInActiveTab); // no-op while a popup exists

async function castInActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !/^https?:/.test(tab.url || "")) return;
  chrome.tabs.sendMessage(tab.id, { type: "wandful:cast" }).catch(async () => {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: false },
      files: ["lib/fingerprint.js", "content/cast.js"],
    });
    chrome.tabs.sendMessage(tab.id, { type: "wandful:cast" }).catch(() => {});
  });
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "wandful:submit") {
    submitSpell(msg.draft).then(sendResponse);
    return true; // async response
  }
  if (msg?.type === "wandful:recast") {
    recast(msg.id).then(sendResponse);
    return true;
  }
  if (msg?.type === "wandful:register-origin") {
    registerOrigin(msg.origin).then(() => sendResponse({ ok: true }));
    return true;
  }
  return false;
});

// ---------- spell store ----------

async function saveSpell(spell) {
  const { spells = {} } = await chrome.storage.local.get("spells");
  spells[spell.id] = spell;
  await chrome.storage.local.set({ spells });
  await registerOrigin(spell.match.origin);
  return spell;
}

async function registerOrigin(origin) {
  if (!/^https?:/.test(origin)) return;
  const id = "wandful-" + hashId(origin);
  const registered = await chrome.scripting.getRegisteredContentScripts();
  if (registered.some((r) => r.id === id)) return;
  try {
    await chrome.scripting.registerContentScripts([
      {
        id,
        matches: [origin + "/*"],
        js: [APPLY_JS],
        runAt: "document_start",
        persistAcrossSessions: true,
      },
    ]);
  } catch (err) {
    console.warn("Wandful: registerContentScripts failed for", origin, err);
  }
}

async function syncRegistrations() {
  const { spells = {} } = await chrome.storage.local.get("spells");
  const origins = [...new Set(Object.values(spells).map((s) => s.match.origin))];
  for (const origin of origins) await registerOrigin(origin);
}

function hashId(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

// ---------- compile: LLM or heuristic ----------

async function compile(intent, target, origin) {
  const { byok = null } = await chrome.storage.local.get("byok");
  if (byok?.key) {
    try {
      const css = await llmCss(byok, intent, target, origin);
      return { css, engine: "byok:" + byok.provider };
    } catch (err) {
      // Fall back to recipes rather than dead-ending the free-tier UX.
      const fallback = heuristicCss(intent, target);
      if (fallback) return { css: fallback, engine: "heuristic", note: "AI failed, used recipe: " + err.message };
      return { error: "AI call failed: " + err.message };
    }
  }
  const css = heuristicCss(intent, target);
  if (css) return { css, engine: "heuristic" };
  return { error: "No recipe for that wording yet — add an API key in options (or Pro, soon) for full power." };
}

function buildPrompt(intent, target, origin) {
  const summary =
    target.kind === "pattern"
      ? `The user circled several elements; the generalized pattern is the CSS selector: ${target.selector}`
      : `The user circled specific element(s). Primary selector: ${target.chain?.[0]}`;
  const samples = (target.evidence || []).map((s, i) => `Sample ${i + 1}: ${s}`).join("\n");
  return {
    system:
      "You convert a user's plain-English website change into CSS. The elements are ALREADY resolved — your only job is scoping and the effect. " +
      "Respond with STRICT JSON: {\"css\": string}. Use the provided selector exactly. CSS only — no <style> tags, no JS, no comments longer than one line. " +
      "Use !important sparingly where sites need it. Keep it under 60 lines.",
    user: `Site: ${origin}\n${summary}\nUser wants: "${intent}"\n${samples}`,
  };
}

async function llmCss(byok, intent, target, origin) {
  const { system, user } = buildPrompt(intent, target, origin);
  let text;
  if (byok.provider === "anthropic") {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": byok.key,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: byok.model || "claude-haiku-4-5-20251001",
        max_tokens: 1500,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });
    if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    text = data.content?.[0]?.text ?? "";
  } else {
    const base =
      byok.provider === "openrouter" ? "https://openrouter.ai/api/v1" : "https://api.openai.com/v1";
    const res = await fetch(base + "/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer " + byok.key },
      body: JSON.stringify({
        model: byok.model || "gpt-4o-mini",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    text = data.choices?.[0]?.message?.content ?? "";
  }
  const css = parseCss(text);
  if (!css) throw new Error("model returned no parseable CSS");
  return css;
}

function parseCss(text) {
  const m = text.match(/\{[\s\S]*"css"[\s\S]*\}/);
  let obj = null;
  try {
    obj = JSON.parse(m ? m[0] : text);
  } catch {
    return null;
  }
  const css = typeof obj?.css === "string" ? obj.css.trim() : null;
  if (!css || css.length > MAX_CSS) return null;
  if (/<\/?style|<script|javascript:|expression\(/i.test(css)) return null;
  return css;
}

// ---------- message handlers ----------

async function submitSpell(draft) {
  const { css, engine, error, note } = await compile(draft.intent, draft.target, draft.match.origin);
  if (error) return { ok: false, error };
  const now = Date.now();
  const spell = {
    id: "sp-" + now.toString(36) + "-" + Math.random().toString(36).slice(2, 8),
    match: draft.match,
    intent: draft.intent,
    target: draft.target,
    effect: { kind: "css", css },
    status: "on",
    stats: { appliedCount: 0 },
    engine,
    createdAt: now,
    updatedAt: now,
    ...(note ? { note } : {}),
  };
  await saveSpell(spell);
  return { ok: true, css, engine, id: spell.id };
}

// One-click recompile from the Spellbook: same intent + evidence, fresh CSS.
async function recast(id) {
  const { spells = {} } = await chrome.storage.local.get("spells");
  const spell = spells[id];
  if (!spell) return { ok: false, error: "spell not found" };
  const { css, engine, error } = await compile(spell.intent, spell.target, spell.match.origin);
  if (error) return { ok: false, error };
  spell.effect = { kind: "css", css };
  spell.engine = engine;
  spell.status = "on";
  spell.updatedAt = Date.now();
  await saveSpell(spell);
  return { ok: true, css, engine };
}
