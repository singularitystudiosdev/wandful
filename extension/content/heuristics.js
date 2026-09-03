// Wandful — no-key intent recipes. The targets are ALREADY resolved by the
// Cast; the recipe only needs the verb. Free tier works with zero setup.
// Anything unmatched returns null → UI prompts for a key or Pro.

// A CSS edit is inert by construction — worst case is a broken-looking page,
// never executed code. Keep the recipe set conservative.

export function heuristicCss(intent, target) {
  const t = intent.toLowerCase();
  const sel = target.kind === "pattern" ? target.selector : (target.chain?.[0] ?? "");
  if (!sel) return null;

  const rules = [];

  if (/\b(remove|hide|delete|get rid of|block|clean|clean up|less|annoy)\w*\b/.test(t) && !/\bdont\b|\bdon't\b/.test(t)) {
    rules.push(`${sel} { display: none !important; }`);
  }
  if (/\bblur\b/.test(t)) {
    rules.push(`${sel} { filter: blur(8px); }`);
  }
  if (/\b(dimmer|darker|tone down|fade)\b/.test(t)) {
    rules.push(`${sel} { opacity: 0.45; }`);
  }
  if (/\b(big|bigg|larger|bigger|increase).{0,12}(font|text|size)\b/.test(t)) {
    rules.push(`${sel} { font-size: 1.25em; }`);
  }
  if (/\b(smaller).{0,12}(font|text|size)\b/.test(t)) {
    rules.push(`${sel} { font-size: 0.85em; }`);
  }
  if (/\bwider\b|\bfull width\b/.test(t)) {
    rules.push(`${sel} { width: 100% !important; max-width: 100% !important; }`);
  }
  if (/\bnarrower\b/.test(t)) {
    rules.push(`${sel} { max-width: 640px; margin-inline: auto; }`);
  }
  if (/\bdark mode\b|\bdarker theme\b/.test(t)) {
    rules.push(`${sel} { background: #14101f !important; color: #e8e4f8 !important; }`);
  }
  if (/\bround(ed)?\b/.test(t)) {
    rules.push(`${sel} { border-radius: 14px !important; }`);
  }
  if (/\b(underline|highlight)\b/.test(t)) {
    rules.push(`${sel} { outline: 3px solid #f59e0b; outline-offset: 2px; }`);
  }

  if (!rules.length) return null;
  return rules.join("\n");
}
