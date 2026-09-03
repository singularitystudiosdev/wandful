// Wandful — options: BYOK key management, site grants, data controls.
const $ = (id) => document.getElementById(id);

async function load() {
  const { byok = {}, spells = {} } = await chrome.storage.local.get(["byok", "spells"]);
  $("provider").value = byok.provider || "openai";
  $("key").value = byok.key || "";
  $("model").value = byok.model || "";
  const origins = [...new Set(Object.values(spells).map((s) => s.match.origin))];
  $("sites").textContent = origins.length
    ? origins.map((o) => o.replace(/^https?:\/\//, "")).join(" · ")
    : "No sites wanded yet.";
}

function status(msg, ok = true) {
  $("status").textContent = msg;
  $("status").style.color = ok ? "#a7f3d0" : "#fca5a5";
  clearTimeout(status._t);
  status._t = setTimeout(() => ($("status").textContent = ""), 4000);
}

$("save").addEventListener("click", async () => {
  const byok = {
    provider: $("provider").value,
    key: $("key").value.trim(),
    model: $("model").value.trim(),
  };
  await chrome.storage.local.set({ byok });
  status("saved ✓");
});

$("test").addEventListener("click", async () => {
  const provider = $("provider").value;
  const key = $("key").value.trim();
  if (!key) return status("enter a key first", false);
  status("testing…");
  try {
    if (provider === "anthropic") {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: $("model").value.trim() || "claude-haiku-4-5-20251001",
          max_tokens: 8,
          messages: [{ role: "user", content: "say ok" }],
        }),
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
    } else {
      const base = provider === "openrouter" ? "https://openrouter.ai/api/v1" : "https://api.openai.com/v1";
      const res = await fetch(base + "/models", { headers: { authorization: "Bearer " + key } });
      if (!res.ok) throw new Error("HTTP " + res.status);
    }
    status("key works ✓");
  } catch (err) {
    status("failed: " + err.message, false);
  }
});

$("export").addEventListener("click", async () => {
  const { spells = {} } = await chrome.storage.local.get("spells");
  const blob = new Blob([JSON.stringify(Object.values(spells), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "wandful-spells.json";
  a.click();
  URL.revokeObjectURL(url);
});

$("wipe").addEventListener("click", async () => {
  if (!confirm("Delete every spell, key and setting? This cannot be undone.")) return;
  await chrome.storage.local.clear();
  const registered = await chrome.scripting.getRegisteredContentScripts();
  await chrome.scripting.unregisterContentScripts({ ids: registered.map((r) => r.id) }).catch(() => {});
  status("wiped ✓");
  load();
});

load();
