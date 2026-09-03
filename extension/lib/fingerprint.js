// Wandful — target fingerprinting and robust selector chains.
// A spell stores the REFERENT (chain + fingerprint + evidence), not just CSS:
// CSS is a cached compile output that can be regenerated when selectors drift.
(() => {
  const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "META", "LINK", "HEAD", "TITLE", "TEMPLATE", "BR", "WBR"]);

  function isWandfulUi(el) {
    return el.closest?.("[data-wandful]");
  }

  // A stable-ish per-element signature: tag + significant classes + identifying attrs.
  function signature(el) {
    const classes = [...el.classList].filter(
      (c) => !/[0-9a-f]{6,}/i.test(c) // drop generated hashes like css-1x2y3z
    );
    const attrs = {};
    for (const a of el.attributes) {
      if (/^(id|data-(test|testid|cy|qa|component|slot)|aria-label|role|name|href|alt|title)$/.test(a.name)) {
        attrs[a.name] = a.value.slice(0, 80);
      }
    }
    return {
      tag: el.tagName.toLowerCase(),
      classes,
      attrs,
      id: el.id || null,
      textSample: (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 60),
      siblingIndex: el.parentElement
        ? [...el.parentElement.children].filter((c) => c.tagName === el.tagName).indexOf(el)
        : 0,
    };
  }

  function tagPath(el, depth = 4) {
    const parts = [];
    let cur = el;
    while (cur && cur.tagName !== "BODY" && parts.length < depth) {
      let part = cur.tagName.toLowerCase();
      if (cur.id) {
        part += "#" + cur.id;
        parts.unshift(part);
        break;
      }
      if (cur.classList.length) part += "." + [...cur.classList].slice(0, 2).join(".");
      parts.unshift(part);
      cur = cur.parentElement;
    }
    return parts.join(" > ");
  }

  // Robust selector: prefer id / stable attrs, fall back to structural path.
  function robustSelector(el) {
    if (el.id) return `#${CSS.escape(el.id)}`;
    for (const a of el.attributes) {
      if (/^(data-(test|testid|cy|qa|component|slot))$/.test(a.name)) {
        return `${el.tagName.toLowerCase()}[${a.name}="${CSS.escape(a.value)}"]`;
      }
    }
    const sig = signature(el);
    if (sig.classes.length) {
      const sel = `${sig.tag}.${sig.classes.map(CSS.escape).join(".")}`;
      try {
        if (document.querySelectorAll(sel).length <= 3) return sel;
      } catch { /* invalid selector — fall through */ }
    }
    return cssPath(el);
  }

  function cssPath(el) {
    const parts = [];
    let cur = el;
    while (cur && cur.nodeType === 1 && cur.tagName !== "BODY") {
      let sel = cur.tagName.toLowerCase();
      if (cur.id) {
        parts.unshift(`#${CSS.escape(cur.id)} > ${sel}`.replace(" > *", ""));
        break;
      }
      const parent = cur.parentElement;
      if (parent) {
        const sameTag = [...parent.children].filter((c) => c.tagName === cur.tagName);
        if (sameTag.length > 1) sel += `:nth-of-type(${sameTag.indexOf(cur) + 1})`;
      }
      parts.unshift(sel);
      cur = cur.parentElement;
    }
    return "body > " + parts.join(" > ");
  }

  // Ordered fallback chain tried at apply time.
  function buildChain(el) {
    return [robustSelector(el), cssPath(el), tagPath(el)];
  }

  // Does `el` still look like the fingerprint we recorded? (structural match)
  function matchesFingerprint(el, fp) {
    if (!fp) return false;
    if (el.tagName.toLowerCase() !== fp.tag) return false;
    const sig = signature(el);
    if (fp.id && el.id !== fp.id) return false;
    const classOverlap = fp.classes.filter((c) => sig.classes.includes(c)).length;
    if (fp.classes.length && classOverlap / fp.classes.length < 0.5) return false;
    if (fp.attrs.id === "" && el.id) return false;
    for (const [k, v] of Object.entries(fp.attrs || {})) {
      if (v && el.getAttribute(k) !== v) return false;
    }
    return true;
  }

  // Resolve a chain against the live DOM: first hit wins.
  function resolveChain(chain, fp) {
    for (const sel of chain) {
      try {
        const el = document.querySelector(sel);
        if (el && !isWandfulUi(el)) {
          if (!fp || matchesFingerprint(el, fp)) return el;
        }
      } catch { /* invalid selector — try next */ }
    }
    // Structural fallback: scan candidates against the fingerprint.
    if (fp) {
      const tagSel = fp.tag;
      for (const el of document.querySelectorAll(tagSel)) {
        if (matchesFingerprint(el, fp)) return el;
      }
    }
    return null;
  }

  // Trimmed outerHTML sample for the LLM (svg/style innards stripped).
  function evidenceSample(el, maxLen = 2000) {
    const clone = el.cloneNode(true);
    for (const n of clone.querySelectorAll("svg, style, script, path, noscript")) n.remove();
    for (const n of clone.querySelectorAll("*")) {
      [...n.attributes].forEach((a) => {
        if (!/^(class|id|href|role|aria-[a-z-]+|data-[a-z-]+|alt|title)$/.test(a.name)) n.removeAttribute(a.name);
      });
    }
    let html = clone.outerHTML.replace(/\s+/g, " ").trim();
    if (html.length > maxLen) html = html.slice(0, maxLen) + "…";
    return html;
  }

  // Shared-pattern inference: the signature shared by ≥3 similar siblings.
  function generalizePattern(els) {
    if (els.length < 3) return null;
    const [first, ...rest] = els.map(signature);
    if (!rest.every((s) => s.tag === first.tag)) return null;
    const commonClasses = first.classes.filter((c) =>
      rest.every((s) => s.classes.includes(c))
    );
    if (!commonClasses.length) return null;
    const sel = `${first.tag}.${commonClasses.map(CSS.escape).join(".")}`;
    let all;
    try {
      all = [...document.querySelectorAll(sel)].filter((el) => !isWandfulUi(el));
    } catch {
      return null;
    }
    if (all.length <= els.length) return null;
    return { selector: sel, total: all.length };
  }

  self.WandfulFingerprint = {
    SKIP_TAGS,
    isWandfulUi,
    signature,
    buildChain,
    resolveChain,
    evidenceSample,
    generalizePattern,
    matchesFingerprint,
  };
})();
