// ==UserScript==
// @name         not_interested — a cleaner LinkedIn feed
// @namespace    https://abernier.dev/
// @version      1.14.0
// @homepageURL  https://github.com/abernier/userscripts
// @supportURL   https://github.com/abernier/userscripts/issues
// @downloadURL  https://raw.githubusercontent.com/abernier/userscripts/main/linkedin_not_interested.user.js
// @updateURL    https://raw.githubusercontent.com/abernier/userscripts/main/linkedin_not_interested.user.js
// @installURL   https://claude.ai/new?q=Install%20the%20%60not_interested%60%20userscript%20%E2%80%94%20a%20cleaner%20LinkedIn%20feed%0A%3D%3D%3D%0A%0AFetch%20https%3A%2F%2Fraw.githubusercontent.com%2Fabernier%2Fuserscripts%2Fmain%2Flinkedin_not_interested.user.install.md%3Fv%3D3%20and%20follow%20its%20instructions
// @description  Permanently hides what LinkedIn won't let you mute for good: "Suggested"/"Promoted"/"From your activity" posts, LinkedIn Learning course cards, social-proof reposts ("X likes this"), and clutter modules (Add to your feed, puzzles, News, jobs, videos, Premium upsells). LinkedIn's built-in "I don't want to see this" action (see https://www.linkedin.com/help/linkedin/answer/a523209) doesn't stick — this keeps the feed clean as you scroll. Works with English and French UI locales.
// @author       abernier
// @license      MIT
// @match        https://www.linkedin.com/*
// @run-at       document-start
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// ==/UserScript==

(() => {
  "use strict";

  // ───────────── Config ─────────────
  // One flat checkbox per hideable thing, directly in the Tampermonkey toolbar
  // menu (visible while on linkedin.com): click an entry to toggle it — applied
  // live, no page reload. Config lives in Tampermonkey storage, NOT in this
  // file: edits here would be wiped by the next @updateURL auto-update.
  const DEFAULTS = {
    posts:   { suggested: true, promoted: true, learning: true, socialProof: true },
    modules: { followRecos: true, puzzles: true, news: true, jobs: false, video: false, premiumUpsell: true },
    messagingBubble: false,
  };
  const DEBUG = true;          // log to the console

  // ───────────── Reveal mode (the big anti-flicker switch) ─────────────
  // true  → hide the WHOLE feed by default and reveal ONLY vetted real posts.
  //         Junk is never painted → zero flicker. Safety: if nothing gets
  //         revealed within REVEAL_FAILOPEN_MS (detection broke / layout changed),
  //         mask-all is auto-disabled so the feed is never left blank.
  // false → lighter mode: let posts render, hide only the junk (may flash briefly).
  const REVEAL_MODE = true;
  const REVEAL_FAILOPEN_MS = 1500;

  const stored = GM_getValue("config", null);
  // Stored config merged over defaults, so a partial/stale object never breaks.
  const CONFIG = {
    posts:   { ...DEFAULTS.posts, ...(stored?.posts || {}) },
    modules: { ...DEFAULTS.modules, ...(stored?.modules || {}) },
    messagingBubble: !!(stored?.messagingBubble ?? DEFAULTS.messagingBubble),
    debug: DEBUG,
  };

  // ───────────── Tampermonkey menu (visible on linkedin.com tabs) ─────────────
  // Live checkboxes: each click flips the flag, re-applies it to the page
  // (applyConfig, no reload), and rebuilds the menu so the ☑/☐ labels update.
  let menuIds = [];
  function buildMenu() {
    for (const id of menuIds) GM_unregisterMenuCommand(id);
    menuIds = [];
    const box = (on) => (on ? "☑" : "☐");
    const entry = (label, get, flip) =>
      menuIds.push(GM_registerMenuCommand(`${box(get())} ${label}`, () => {
        flip();
        GM_setValue("config", { posts: CONFIG.posts, modules: CONFIG.modules, messagingBubble: CONFIG.messagingBubble });
        applyConfig();
        buildMenu();
      }));
    for (const [group, label] of [["posts", "post"], ["modules", "module"]])
      for (const key of Object.keys(CONFIG[group]))
        entry(`${label}: ${key}`, () => CONFIG[group][key], () => (CONFIG[group][key] = !CONFIG[group][key]));
    entry("messaging bubble", () => CONFIG.messagingBubble, () => (CONFIG.messagingBubble = !CONFIG.messagingBubble));
  }
  buildMenu();

  // ───────────── Post detection (exact header text) ─────────────
  const POST_RES = [
    ["suggested", /^\s*(suggested|suggéré(e)?(\s+pour\s+vous)?|recommandé(e)?\s+pour\s+vous|recommended\s+for\s+you|from your activity|based on your activity|d['’]après votre activité|basé sur votre activité|de votre activité|selon votre activité)\s*$/i],
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
  const OK = "data-ni-ok";            // reveal (reveal mode only): "post" = vetted clean post,
                                      // "chrome" = non-post feed furniture (composer, sort bar,
                                      // "New posts" pill, infinite-scroll sentinel…)
  const VERSION = (typeof GM_info !== "undefined" && GM_info?.script?.version) || "?";
  let hiddenCount = 0;
  let revealedCount = 0;

  GM_addStyle(`[${ATTR}]{display:none !important;}`);
  // Always injected; the menu checkbox toggles it live via .disabled.
  const msgStyle = GM_addStyle(`#msg-overlay,.msg-overlay-list-bubble,aside[aria-label*="essag"]{display:none !important;}`);
  if (msgStyle) msgStyle.disabled = !CONFIG.messagingBubble;

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

  const hide = (el, key, what = key) => {
    const slot = feedSlotOf(el);
    slot.removeAttribute(OK);
    slot.setAttribute(ATTR, key); // value = the config key that hid it, so a live toggle-off can un-hide it
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
      if (why) hide(item, why, `post ${why}`);
      return;
    }

    // Reveal mode: decide per-SLOT, once. A slot can bundle several listitems
    // (e.g. a carousel post), so we evaluate the whole slot rather than each item,
    // and never mark it both revealed and hidden. Evaluating the full slot makes
    // the decision independent of which inner item triggered processing.
    const slot = feedSlotOf(item);
    if (slot.hasAttribute(ATTR) || slot.getAttribute(OK) === "post") return; // already decided
    // A slot revealed as "chrome" that has since received a real post is re-vetted
    // here — synchronously, before paint — so junk still never flashes.
    const junk = isJunkPost(slot);
    if (junk) { hide(slot, junk, `post ${junk}`); return; }
    const mod = moduleHeadingIn(slot);
    if (mod) { hide(slot, mod, `in-feed ${mod}`); return; }
    if (looksLikePost(slot)) {
      slot.setAttribute(OK, "post");
      revealedCount++;
      if (CONFIG.debug && revealedCount <= 3)
        console.log(`%c[not_interested] revealed a post (${revealedCount})`, "color:#0a8a00");
    } else if (slot.getAttribute(OK) === "chrome") {
      slot.removeAttribute(OK); // holds a post now, but not vetted yet → hidden until clean
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
      hide(target, m.key, `module ${m.key} ("${m.t.slice(0, 30)}")`);
    }
  }

  // ───────────── Chrome slots (reveal mode) ─────────────
  // The feed list also holds non-post furniture: the "Start a post" composer,
  // the sort-by bar, the "New posts" pill — and the empty sentinel <div>
  // LinkedIn observes to trigger infinite scroll. Blanket-hiding those (≤1.13)
  // killed lazy-loading: the sentinel was display:none, never intersected the
  // viewport, and the feed stopped dead after the first batch (no loader, no
  // more posts). Reveal any list child with no feed item inside; if a post
  // lands in it later, handleItem re-vets it pre-paint.
  function scanChrome() {
    for (const list of document.querySelectorAll('main [role="list"]')) {
      const inRevealedSlot = !!list.parentElement?.closest(`[${OK}]`); // nested list (carousel) of a vetted post
      for (const slot of list.children) {
        if (slot.hasAttribute(OK) || slot.hasAttribute(ATTR)) continue;
        if (inRevealedSlot || !(slot.matches(ITEM_SELECTOR) || slot.querySelector(ITEM_SELECTOR)))
          slot.setAttribute(OK, "chrome");
      }
    }
  }

  // ───────────── Loop ─────────────
  function scan() { scanPosts(); scanModules(); if (REVEAL_MODE) scanChrome(); }

  // Apply a config change to the already-rendered page (no reload): un-hide
  // what the now-disabled filters had hidden (they get re-vetted → revealed),
  // re-check revealed posts against newly enabled filters, then rescan.
  function applyConfig() {
    if (msgStyle) msgStyle.disabled = !CONFIG.messagingBubble;
    for (const el of document.querySelectorAll(`[${ATTR}]`)) {
      const key = el.getAttribute(ATTR);
      if ((CONFIG.posts[key] ?? CONFIG.modules[key]) === false) el.removeAttribute(ATTR);
    }
    for (const slot of document.querySelectorAll(`[${OK}="post"]`)) {
      const junk = isJunkPost(slot);
      if (junk) { hide(slot, junk, `post ${junk}`); continue; }
      const mod = moduleHeadingIn(slot);
      if (mod) hide(slot, mod, `in-feed ${mod}`);
    }
    scheduleScan();
  }

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
