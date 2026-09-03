# Wandful — launch kit (v0.1.0)

Site: https://singularitystudiosdev.github.io/wandful/
Extension zip: https://singularitystudiosdev.github.io/wandful/wandful-extension.zip

Positioning line: **Circle it. Say the change. It sticks.**
Wedge vs Tweeks (closed, all-sites permission, inference on their dime): open-core BYOK, per-origin permission grants, spells stored as repairable referents (intent + fingerprint), not compiled blobs.

## X / Twitter launch thread

Post 1:
> I got tired of websites deciding what I see.
> So I built Wandful: circle the thing that annoys you, type what should happen instead, and it sticks — on every reload, on any site.
>
> "Remove Shorts from my recommendations" → circled → gone. Forever.
>
> Free, bring-your-own-key. 🪄

Post 2:
> How it works:
> 1. Press 🪄 (Alt+Shift+W)
> 2. Lasso the element — or slash through a whole row. Overlap the lasso to narrow: 40 targets → 12 → exactly these.
> 3. Wandful offers "…and 28 more like them?" when it spots the pattern.
> 4. Say the change. Cast. It persists.

Post 3:
> No "all sites" permission — Wandful only asks for the site you're casting on.
> No compiled blob — a spell stores what you MEANT, so when YouTube redesigns, one click re-casts it.
> No key needed to start — free recipes + plain-English "hide/blur/enlarge" work out of the box.
>
> https://singularitystudiosdev.github.io/wandful/

## Show HN draft

Title: Show HN: Wandful – circle any element, describe the change, it persists

Body:
> Wandful is a browser extension that lets non-coders reshape any website: draw a lasso around elements, describe the change in plain English, and the edit applies as CSS and persists per site.
>
> Design choices that differ from Tweeks/Stylus/Tampermonkey:
> - Selection is the intelligence, not the prompt. The lasso + overlap-to-narrow resolves WHICH elements deterministically; the LLM only emits the effect, scoped to a selector it's handed. Free tier works keyless (recipes + verb heuristics); BYOK (OpenAI/Anthropic/OpenRouter) for anything.
> - Spells store the referent (selector chain + DOM fingerprint + intent + evidence), so a site redesign makes a spell "stale" and one click re-casts it, instead of silently dying like a compiled userscript.
> - Permission model: no all_urls at install — per-origin grants requested at first cast, content scripts registered per origin at document_start (no FOUC).
> - CSS-only by default (inert by construction); JS tier behind Chrome 138's per-extension user-scripts opt-in, clearly labeled.
>
> Stack: MV3, vanilla JS, no build step, ~800 lines. Chrome for Testing smoke-tested (SW boot, cast→compile→persist→register path).
>
> Known rough edges: shadow-DOM piercing only reaches open roots; iframes are out for v0.1; the lasso generalizer is conservative (only fires on ≥3 strong-signature siblings).
>
> Site: https://singularitystudiosdev.github.io/wandful/
> Zip: https://singularitystudiosdev.github.io/wandful/wandful-extension.zip

## Reddit r/salesforce comment (the wedge segment)

> You can hide the Ask Agentforce button yourself in 10 seconds with Wandful (load-unpacked extension) — circle the button, say "hide this", done. It saves as a personal spell, no admin, no page layout edit, and your admin sees nothing. Works on any Lightning page. Also handles the Experience Cloud blank-field thing.
> https://singularitystudiosdev.github.io/wandful/

## Sequencing

1. Launch thread on X, then Show HN (Tuesday–Thursday morning US).
2. r/salesforce + r/workday comments ONLY where directly responsive to a complaint thread — never as standalone posts.
3. After first 100 installs: publish the spell export format as a gist, invite sharing; the community library is the moat (see lateral-transfer finding: the segment's fixes are already social objects — people paste selectors to strangers).
