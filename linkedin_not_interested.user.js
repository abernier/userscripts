// ==UserScript==
// @name         not_interested — a cleaner LinkedIn feed
// @namespace    https://abernier.dev/
// @version      1.11.1
// @homepageURL  https://claude.ai/chat/4f8781b9-8f0f-44fd-aac5-0d25ba42b682
// @supportURL   https://claude.ai/chat/4f8781b9-8f0f-44fd-aac5-0d25ba42b682
// @description  Permanently hides what LinkedIn won't let you mute for good: "Suggested"/"Promoted" posts, LinkedIn Learning course cards, social-proof reposts ("X likes this"), and clutter modules (Add to your feed, puzzles, News, jobs, videos, Premium upsells). LinkedIn's built-in "I don't want to see this" action (see https://www.linkedin.com/help/linkedin/answer/a523209) doesn't stick — this keeps the feed clean as you scroll. Works with English and French UI locales.
// @author       abernier
// @license      MIT
// @match        https://www.linkedin.com/*
// @run-at       document-start
// @grant        GM_addStyle
// ==/UserScript==

(() => {
  "use strict";

  // ───────────── Presets ─────────────
  // Monotonic escalation: light ⊂ balanced ⊂ aggressive ⊂ nuclear
  //   light       – ads, promos, "Suggested"/Learning posts, Premium upsells.
  //   balanced    – light + social-proof reposts, "Add to your feed", News, puzzles. (default)
  //   aggressive  – hide ALL posts & modules listed. Messaging bubble kept.
  //   nuclear     – aggressive + removes the bottom-right Messaging bubble.
  //   custom      – ignore presets, use the CUSTOM object below.
  const PRESET = "balanced"; // "light" | "balanced" | "aggressive" | "nuclear" | "custom"
  const DEBUG = true;          // log to the console

  // ───────────── Reveal mode (the big anti-flicker switch) ─────────────
  // true  → hide the WHOLE feed by default and reveal ONLY vetted real posts.
  //         Junk is never painted → zero flicker. Safety: if nothing gets
  //         revealed within REVEAL_FAILOPEN_MS (detection broke / layout changed),
  //         mask-all is auto-disabled so the feed is never left blank.
  // false → lighter mode: let posts render, hide only the junk (may flash briefly).
  const REVEAL_MODE = true;
  const REVEAL_FAILOPEN_MS = 1500;

  const CUSTOM = {
    posts:   { suggested: true, promoted: true, learning: true, socialProof: true },
    modules: { followRecos: true, puzzles: true, news: true, jobs: true, video: true, premiumUpsell: true },
    messagingBubble: false,
  };

  const PRESETS = {
    light: {
      posts:   { suggested: true, promoted: true, learning: true, socialProof: false },
      modules: { followRecos: false, puzzles: false, news: false, jobs: false, video: false, premiumUpsell: true },
      messagingBubble: false,
    },
    balanced: {
      posts:   { suggested: true, promoted: true, learning: true, socialProof: true },
      modules: { followRecos: true, puzzles: true, news: true, jobs: false, video: false, premiumUpsell: true },
      messagingBubble: false,
    },
    aggressive: {
      posts:   { suggested: true, promoted: true, learning: true, socialProof: true },
      modules: { followRecos: true, puzzles: true, news: true, jobs: true, video: true, premiumUpsell: true },
      messagingBubble: false,
    },
    nuclear: {
      posts:   { suggested: true, promoted: true, learning: true, socialProof: true },
      modules: { followRecos: true, puzzles: true, news: true, jobs: true, video: true, premiumUpsell: true },
      messagingBubble: true,
    },
    custom: CUSTOM,
  };

  const CONFIG = { ...(PRESETS[PRESET] || PRESETS.aggressive), debug: DEBUG };

  // ───────────── Post detection (exact header text) ─────────────
  const POST_RES = [
    ["suggested", /^\s*(suggested|suggéré(e)?(\s+pour\s+vous)?|recommandé(e)?\s+pour\s+vous|recommended\s+for\s+you)\s*$/i],
    ["promoted", /^\s*(promoted|sponsorisé(e)?|sponsored)\s*$/i],
    ["learning", /^((popular|trending|recommended|featured|new|top)\s+courses?\b.*|cours? (populaire|recommandé|tendance)\b.*|.*\blinkedin learning)\s*$/i],
  ];
  const SOCIAL_RE =
    /(likes? this|loves? this|celebrates? this|supports? this|finds? this(\s+\w+)?|is curious about this|commented on .{0,60}|replied to .{0,60}|reposted this|aime(nt)? ça|adore(nt)? ça|trouve(nt)? ça(\s+\w+)?|célèbre(nt)? ça|soutient ça|soutiennent ça|a commenté.{0,60}|ont commenté.{0,60}|a répondu à.{0,60}|a (republié|aimé|partagé|réagi)|ont (republié|aimé|partagé|réagi))\s*$/i;

  // ───────────── Module detection (headings) ─────────────
  const MODULES = [
    ["followRecos", /^(add to your feed|people you may know|suggested for you|qui pourraient vous|suggestions pour vous|ajoute(z|r) à votre fil|view all recommendations)/i, "card"],
    ["puzzles", /^(today['’]?s (games|puzzles?)|jeux du jour|puzzles du jour)/i, "card"],
    ["news", /^(linkedin news|actualités linkedin|top stories|à la une)/i, "card"],
    ["jobs", /^(jobs recommended for you|suggested job searches|job picks|offres d'emploi recommandées|recherches d'emploi suggérées)/i, "card"],
    ["video", /^(videos for you|vidéos pour vous)/i, "card"],
    ["premiumUpsell", /^(grow your business faster|try premium|essayez premium|advertise on linkedin|faites de la publicité|développez votre activité)/i, "inline"],
  ];

  const ITEM_SELECTOR =
    '[role="listitem"], div[data-id^="urn:li:activity"], .feed-shared-update-v2';
  const ATTR = "data-not-interested"; // "always hide" (junk + modules), both modes
  const OK = "data-ni-ok";            // "vetted clean, reveal" (reveal mode only)
  const VERSION = (typeof GM_info !== "undefined" && GM_info?.script?.version) || "?";
  let hiddenCount = 0;
  let revealedCount = 0;

  GM_addStyle(`[${ATTR}]{display:none !important;}`);
  if (CONFIG.messagingBubble)
    GM_addStyle(`#msg-overlay,.msg-overlay-list-bubble,aside[aria-label*="essag"]{display:none !important;}`);

  if (REVEAL_MODE) {
    // Hide feed slots until vetted — scoped to the feed list inside <main> only,
    // never the sidebars. <html class="ni-reveal"> is the master toggle: removing
    // it (fail-open) instantly reveals everything not explicitly flagged junk.
    GM_addStyle(`html.ni-reveal main [role="list"] > *:not([${OK}]){display:none !important;}`);
    document.documentElement.classList.add("ni-reveal");
  }

  // Climb to the slot that is a direct child of role="list" (the flex item).
  // Hiding/revealing at this level keeps the flex `gap` consistent (no holes).
  function feedSlotOf(el) {
    let n = el, slot = el;
    while (n.parentElement) {
      const p = n.parentElement;
      if (p.getAttribute("role") === "list") slot = n; // child of a list; keep climbing for nested carousels
      if (["MAIN", "BODY", "ASIDE"].includes(p.tagName)) break;
      n = p;
    }
    return slot;
  }

  const log = (what) => {
    hiddenCount++;
    if (CONFIG.debug)
      console.log(`%c[not_interested] hid: ${what} (${hiddenCount})`, "color:#888");
  };

  const hide = (el, what) => {
    feedSlotOf(el).setAttribute(ATTR, "");
    log(what);
  };

  // ───────────── Detection ─────────────
  function isJunkPost(item) {
    for (const el of item.querySelectorAll("span, p")) {
      const t = el.textContent.trim();
      if (!t) continue;
      if (el.childElementCount === 0) {
        for (const [key, re] of POST_RES)
          if (CONFIG.posts[key] && re.test(t)) return key;
      }
      if (CONFIG.posts.socialProof && el.childElementCount <= 3 && t.length < 90) {
        const a = el.querySelector('a[href*="/in/"], a[href*="/company/"]');
        const name = a?.textContent.trim();
        if (name && name.length > 1 && t.startsWith(name.slice(0, 20)) && SOCIAL_RE.test(t))
          return "socialProof";
      }
    }
    return null;
  }

  // Is this feed item an in-feed module (jobs/video/follow recos…)?
  function moduleHeadingIn(item) {
    for (const el of item.querySelectorAll("h2,h3,span,p,strong,a")) {
      if (el.childElementCount !== 0) continue;
      const t = el.textContent.trim();
      if (!t || t.length > 60) continue;
      for (const [key, re] of MODULES)
        if (CONFIG.modules[key] && re.test(t)) return key;
    }
    return null;
  }

  // Positive signal that an item is a genuine post worth revealing:
  // it carries an author/company link AND some body text. (Cannot use height:
  // in reveal mode the item is display:none, so its measured height is 0.)
  function looksLikePost(item) {
    const author = item.querySelector('a[href*="/in/"], a[href*="/company/"]');
    return !!author && item.textContent.trim().length > 40;
  }

  // ───────────── Per-item handling ─────────────
  function handleItem(item) {
    if (item.parentElement?.closest(`[${ATTR}]`)) return;

    if (!REVEAL_MODE) {
      const why = isJunkPost(item);
      if (why) hide(item, `post ${why}`);
      return;
    }

    // Reveal mode: decide per-SLOT, once. A slot can bundle several listitems
    // (e.g. a carousel post), so we evaluate the whole slot rather than each item,
    // and never mark it both revealed and hidden. Evaluating the full slot makes
    // the decision independent of which inner item triggered processing.
    const slot = feedSlotOf(item);
    if (slot.hasAttribute(OK) || slot.hasAttribute(ATTR)) return; // already decided
    const junk = isJunkPost(slot);
    if (junk) { hide(slot, `post ${junk}`); return; }
    const mod = moduleHeadingIn(slot);
    if (mod) { hide(slot, `in-feed ${mod}`); return; }
    if (looksLikePost(slot)) {
      slot.setAttribute(OK, "");
      revealedCount++;
      if (CONFIG.debug && revealedCount <= 3)
        console.log(`%c[not_interested] revealed a post (${revealedCount})`, "color:#0a8a00");
    }
    // else: pending (content not loaded yet) — stays hidden until next scan / fail-open
  }

  function scanPosts() {
    for (const item of document.querySelectorAll(ITEM_SELECTOR)) handleItem(item);
  }

  // ───────────── Modules (side rails) ─────────────
  function ancestors(el) {
    const a = []; let n = el;
    while (n.parentElement) {
      const p = n.parentElement;
      if (["ASIDE", "MAIN", "BODY", "HEADER", "NAV"].includes(p.tagName)) break;
      a.push((n = p));
    }
    return a;
  }

  function scanModules() {
    const matched = [];
    for (const el of document.querySelectorAll("h2,h3,span,p,strong,a")) {
      if (el.childElementCount !== 0) continue;
      if (el.closest("header,nav")) continue;
      const t = el.textContent.trim();
      if (!t || t.length > 60) continue;
      for (const [key, re, mode] of MODULES) {
        if (CONFIG.modules[key] && re.test(t)) { matched.push({ el, key, mode, t }); break; }
      }
    }
    const cardOf = (m) => {
      const cands = ancestors(m.el).filter((c) => c.getBoundingClientRect().height <= 650);
      for (let i = cands.length - 1; i >= 0; i--) {
        const c = cands[i];
        if (matched.some((o) => o.key !== m.key && c.contains(o.el))) continue;
        return c;
      }
      return null;
    };
    const inlineOf = (el) => {
      let n = el;
      while (n.parentElement && n.parentElement.getBoundingClientRect().height <= 140)
        n = n.parentElement;
      return n;
    };
    for (const m of matched) {
      if (m.el.closest(`[${ATTR}]`)) continue;
      const li = m.el.closest('[role="listitem"]');
      const target = li || (m.mode === "card" ? cardOf(m) : inlineOf(m.el));
      if (!target) continue;
      if (target.querySelectorAll('[role="listitem"]').length > 2) continue;
      hide(target, `module ${m.key} ("${m.t.slice(0, 30)}")`);
    }
  }

  // ───────────── Loop ─────────────
  function scan() { scanPosts(); scanModules(); }

  // Synchronous, pre-paint handling of freshly inserted feed items.
  function processNode(node) {
    if (!node || node.nodeType !== 1) return;
    const items = [];
    if (node.matches?.(ITEM_SELECTOR)) items.push(node);
    node.querySelectorAll?.(ITEM_SELECTOR).forEach((i) => items.push(i));
    for (const item of items) handleItem(item);
  }

  let scheduled = false;
  function scheduleScan() {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => { scheduled = false; scan(); });
  }

  function start() {
    if (CONFIG.debug)
      console.log(`%c[not_interested] active ✔ (v${VERSION}, ${REVEAL_MODE ? "reveal" : "hide-junk"} mode)`, "color:#0a66c2;font-weight:bold");
    scan();
    new MutationObserver((muts) => {
      for (const m of muts) for (const n of m.addedNodes) processNode(n);
      scheduleScan();
    }).observe(document.documentElement, { childList: true, subtree: true });

    // Fail-open: if reveal mode never managed to reveal a single post, assume the
    // detection/structure is broken and stop hiding the whole feed (never blank).
    if (REVEAL_MODE)
      setTimeout(() => {
        if (revealedCount === 0) {
          document.documentElement.classList.remove("ni-reveal");
          if (CONFIG.debug)
            console.warn("[not_interested] reveal-mode fail-open → showing feed (nothing matched; LinkedIn layout may have changed)");
        }
      }, REVEAL_FAILOPEN_MS);
  }

  start();
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", scan, { once: true });

  // LinkedIn is an SPA: re-scan on URL changes too
  let lastHref = location.href;
  setInterval(() => {
    if (location.href !== lastHref) { lastHref = location.href; scheduleScan(); }
  }, 500);
})();
