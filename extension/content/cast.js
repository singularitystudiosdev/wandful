// Wandful — the Cast: lasso-to-select overlay + intent panel.
// Gesture rules: lasso selects everything its stroke crosses; an overlapping
// lasso NARROWS the current selection; Alt+click toggles one element; when the
// narrowed set shares a signature, offer "…and N more like them".
// The overlay lives in the top layer via [popover] so dialogs can't cover it.
(() => {
  if (self.__wandfulCastActive) return;
  const FP = self.WandfulFingerprint;

  const state = {
    active: false,
    selection: new Set(),
    stroke: [],
    drawing: false,
    raf: 0,
  };

  let host, canvas, ctx, hiLayer, panel;

  // ---------- overlay scaffolding ----------

  function buildOverlay() {
    host = document.createElement("div");
    host.dataset.wandful = "cast";
    host.setAttribute("popover", "manual");
    host.style.cssText = `all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none;`;
    host.innerHTML = `
      <style data-wandful>
        .wf-dim { position:fixed;inset:0;background:rgba(12,10,26,.18);transition:opacity .15s; }
        .wf-hi { position:fixed;pointer-events:none;outline:2px solid #7c3aed;background:rgba(124,58,237,.14);border-radius:2px;transition:opacity .12s; }
        .wf-hi.hit { animation: wfpop .18s ease-out; }
        @keyframes wfpop { from { transform:scale(1.06); } to { transform:none; } }
        .wf-panel { position:fixed;left:50%;bottom:28px;transform:translateX(-50%);
          display:flex;gap:10px;align-items:center;padding:10px 12px;border-radius:14px;
          background:#14101f;color:#f4f1ff;font:13px/1.4 system-ui,sans-serif;
          box-shadow:0 12px 40px rgba(0,0,0,.45);border:1px solid #35275c;pointer-events:auto; }
        .wf-count { font-weight:700;color:#c4b5fd;white-space:nowrap;min-width:64px;text-align:center; }
        .wf-more { display:none;background:#2b1d55;color:#ddd6fe;border:1px solid #7c3aed;border-radius:8px;padding:5px 9px;cursor:pointer;white-space:nowrap; }
        .wf-input { flex:1;min-width:260px;background:#1e1636;border:1px solid #3c2d68;border-radius:9px;
          color:#fff;padding:8px 10px;font:13px system-ui,sans-serif;outline:none; }
        .wf-input:focus { border-color:#8b5cf6; }
        .wf-cast { background:#7c3aed;color:#fff;border:0;border-radius:9px;padding:8px 14px;font-weight:600;cursor:pointer; }
        .wf-cast:disabled { opacity:.45;cursor:default; }
        .wf-cancel { background:transparent;color:#a89ec9;border:0;cursor:pointer;padding:8px 6px; }
        .wf-status { position:fixed;left:50%;bottom:84px;transform:translateX(-50%);background:#14101f;color:#fde68a;
          border:1px solid #7c3aed;border-radius:10px;padding:7px 12px;font:12px system-ui;pointer-events:auto;display:none; }
      </style>
      <div class="wf-dim"></div>
      <div class="wf-his" data-wandful></div>
      <canvas data-wandful style="position:fixed;inset:0;"></canvas>
      <div class="wf-panel" data-wandful>
        <span class="wf-count">0 targets</span>
        <button class="wf-more" type="button">+ more like them</button>
        <input class="wf-input" type="text" placeholder="What should happen? e.g. “remove all of these”" />
        <button class="wf-cast" type="button" disabled>Cast ✨</button>
        <button class="wf-cancel" type="button" title="Esc">Cancel</button>
      </div>
      <div class="wf-status" data-wandful></div>`;
    document.documentElement.appendChild(host);
    try { host.showPopover(); } catch { /* top layer unsupported — still works via z-index */ }
    canvas = host.querySelector("canvas");
    hiLayer = host.querySelector(".wf-his");
    ctx = canvas.getContext("2d");
    sizeCanvas();
  }

  function sizeCanvas() {
    canvas.width = innerWidth * devicePixelRatio;
    canvas.height = innerHeight * devicePixelRatio;
    canvas.style.width = innerWidth + "px";
    canvas.style.height = innerHeight + "px";
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  }

  // ---------- selection ----------

  function visible(el) {
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  }

  function pickAt(x, y) {
    const stack = document.elementsFromPoint(x, y).filter(
      (el) => el.nodeType === 1 && !FP.SKIP_TAGS.has(el.tagName) && !FP.isWandfulUi(el)
    );
    let el = stack[0];
    // Pierce open shadow roots down to the innermost hit.
    while (el?.shadowRoot) {
      const inner = el.shadowRoot.elementsFromPoint(x, y).find(
        (n) => n.nodeType === 1 && !FP.SKIP_TAGS.has(n.tagName)
      );
      if (!inner || inner === el) break;
      el = inner;
    }
    return el || null;
  }

  function hitTestStroke(pts) {
    const hits = new Set();
    for (const p of pts) {
      const el = pickAt(p.x, p.y);
      if (el) hits.add(el);
    }
    return hits;
  }

  function addSelection(hits) {
    for (const el of hits) {
      if (!state.selection.has(el)) {
        state.selection.add(el);
        markHighlight(el, true);
      }
    }
  }

  function markHi(el, hitAnim) {
    let hi = el.__wfHi;
    if (!hi) {
      hi = document.createElement("div");
      hi.className = "wf-hi";
      el.__wfHi = hi;
      hiLayer.appendChild(hi);
    }
    const r = el.getBoundingClientRect();
    hi.style.left = r.left + "px";
    hi.style.top = r.top + "px";
    hi.style.width = r.width + "px";
    hi.style.height = r.height + "px";
    if (hitAnim) { hi.classList.remove("hit"); void hi.offsetWidth; hi.classList.add("hit"); }
    return hi;
  }

  function refreshHighlights() {
    for (const el of state.selection) markHi(el, false);
  }

  function updatePanel() {
    host.querySelector(".wf-count").textContent = state.selection.size + " target" + (state.selection.size === 1 ? "" : "s");
    host.querySelector(".wf-cast").disabled = state.selection.size === 0;
    offerGeneralize();
  }

  // Rule 3: ≥3 siblings sharing a signature → offer to expand to the pattern.
  function offerGeneralize() {
    const more = host.querySelector(".wf-more");
    const g = FP.generalizePattern([...state.selection]);
    state.generalized = g;
    more.style.display = g ? "inline-block" : "none";
    if (g) more.textContent = `and ${g.total - state.selection.size} more like them`;
  }

  // ---------- stroke drawing ----------

  function drawStroke() {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    if (state.stroke.length > 1) {
      ctx.beginPath();
      ctx.moveTo(state.stroke[0].x, state.stroke[0].y);
      for (const p of state.stroke.slice(1)) ctx.lineTo(p.x, p.y);
      ctx.strokeStyle = "#a78bfa";
      ctx.lineWidth = 2.5;
      ctx.lineCap = "round";
      ctx.setLineDash([6, 5]);
      ctx.stroke();
      const last = state.stroke[state.stroke.length - 1];
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(last.x, last.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = "#7c3aed";
      ctx.fill();
    }
  }

  function onKeyDown(e) {
    if (e.key === "Escape") { e.preventDefault(); teardown(false); }
  }

  function onPointerDown(e) {
    if (e.button !== 0) return;
    if (e.altKey) {
      e.preventDefault();
      const el = pickAt(e.clientX, e.clientY);
      if (el && state.selection.has(el)) { state.selection.delete(el); el.__wfHi?.remove(); delete el.__wfHi; }
      else if (el) { state.selection.add(el); markHi(el, true); }
      updatePanel();
      return;
    }
    if (host.querySelector(".wf-panel").contains(e.target)) return;
    e.preventDefault();
    state.drawing = true;
    state.stroke = [{ x: e.clientX, y: e.clientY }];
    drawStroke();
  }

  function onPointerMove(e) {
    if (!state.drawing) return;
    const last = state.stroke[state.stroke.length - 1];
    if (Math.hypot(e.clientX - last.x, e.clientY - last.y) < 4) return;
    state.stroke.push({ x: e.clientX, y: e.clientY });
    drawStroke();
  }

  function onPointerUp() {
    if (!state.drawing) return;
    state.drawing = false;
    drawStroke();
    const pts = state.stroke;
    state.stroke = [];
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    if (pts.length < 6) return;
    const hits = hitTestStroke(pts);
    if (!hits.size) return;
    // Rule 2: stroke touching current selection narrows it; otherwise fresh select.
    const touchesSelection = [...hits].some(
      (el) => state.selection.has(el) || [...state.selection].some((s) => s.contains(el) || el.contains(s))
    );
    if (touchesSelection) {
      const kept = new Set();
      for (const el of hits) {
        const owner = [...state.selection].find((s) => s === el || s.contains(el) || el.contains(s));
        if (owner) kept.add(owner === el || el.contains(owner) ? owner : el);
      }
      if (kept.size) {
        for (const el of state.selection) if (!kept.has(el)) { el.__wfHi?.remove(); delete el.__wfHi; }
        state.selection = kept;
      } else {
        addSelection(hits);
      }
    } else {
      addSelection(hits);
    }
    updatePanel();
  }

  // ---------- spell assembly + submit ----------

  function collectTargets() {
    const els = [...state.selection];
    const g = state.generalized;
    if (g) {
      return {
        kind: "pattern",
        selector: g.selector,
        total: g.total,
        chain: [g.selector],
        fingerprint: FP.signature(els[0]),
        evidence: [FP.evidenceSample(els[0]), FP.evidenceSample(els[1] || els[0])],
      };
    }
    return {
      kind: "elements",
      count: els.length,
      chain: FP.buildChain(els[0]),
      fingerprint: FP.signature(els[0]),
      evidence: els.slice(0, 3).map((el) => FP.evidenceSample(el)),
    };
  }

  async function ensurePermission(origin) {
    const pat = origin + "/*";
    const has = await chrome.permissions.contains({ origins: [pat] });
    if (has) return true;
    try {
      return await chrome.permissions.request({ origins: [pat] });
    } catch {
      return false;
    }
  }

  function toast(msg, ms = 2600) {
    const s = host.querySelector(".wf-status");
    s.textContent = msg;
    s.style.display = "block";
    clearTimeout(toast._t);
    toast._t = setTimeout(() => (s.style.display = "none"), ms);
  }

  async function submit() {
    const btn = host.querySelector(".wf-cast");
    const intent = host.querySelector(".wf-input").value.trim();
    if (!intent || !state.selection.size) return;
    btn.disabled = true;
    const origin = location.origin;
    if (!/^https?:/.test(origin)) { toast("Wandful works on http(s) pages only."); btn.disabled = false; return; }
    const granted = await ensurePermission(origin);
    if (!granted) { toast("Needs site permission to persist."); btn.disabled = false; return; }
    const draft = {
      match: { origin, pathGlob: "*" },
      intent,
      target: collectTargets(),
    };
    let res;
    try {
      res = await chrome.runtime.sendMessage({ type: "wandful:submit", draft });
    } catch (err) {
      toast("Wandful background error: " + err.message);
      btn.disabled = false;
      return;
    }
    if (!res?.ok) {
      toast(res?.error || "Could not cast that spell.");
      btn.disabled = false;
      return;
    }
    toast(res.engine === "heuristic" ? "Cast with built-in recipe — saved ✓" : "Cast with your AI key — saved ✓");
    setTimeout(() => teardown(true), 900);
  }

  // ---------- lifecycle ----------

  function tick() {
    if (!state.active) return;
    refreshHighlights();
    state.raf = requestAnimationFrame(tick);
  }

  function teardown(applied) {
    state.active = false;
    self.__wandfulCastActive = false;
    cancelAnimationFrame(state.raf);
    removeEventListener("keydown", onKeyDown, true);
    removeEventListener("pointerdown", onPointerDown, true);
    removeEventListener("pointermove", onPointerMove, true);
    removeEventListener("pointerup", onPointerUp, true);
    removeEventListener("resize", sizeCanvas);
    host?.hidePopover?.();
    host?.remove();
    if (!applied) document.getElementById("wandful-live")?.remove();
  }

  self.__wandfulCast = function startCast() {
    if (state.active) return;
    state.active = true;
    self.__wandfulCastActive = true;
    buildOverlay();
    addEventListener("keydown", onKeyDown, true);
    addEventListener("pointerdown", onPointerDown, true);
    addEventListener("pointermove", onPointerMove, true);
    addEventListener("pointerup", onPointerUp, true);
    addEventListener("resize", sizeCanvas);
    host.querySelector(".wf-input").focus();
    host.querySelector(".wf-cast").addEventListener("click", submit);
    host.querySelector(".wf-cancel").addEventListener("click", () => teardown(false));
    host.querySelector(".wf-more").addEventListener("click", () => {
      if (!state.generalized) return;
      const els = [...document.querySelectorAll(state.generalized.selector)].filter(
        (el) => !FP.isWandfulUi(el)
      );
      for (const el of state.selection) { el.__wfHi?.remove(); delete el.__wfHi; }
      state.selection = new Set(els);
      state.generalized = null;
      addSelection(new Set());
      refreshHighlights();
      updatePanel();
    });
    host.querySelector(".wf-input").addEventListener("keydown", (e) => {
      if (e.key === "Enter") submit();
    });
    tick();
  };

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "wandful:cast") self.__wandfulCast();
  });
})();
