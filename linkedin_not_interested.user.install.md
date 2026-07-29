# not_interested — install instructions for Claude

> You (Claude) are helping the user install the "not_interested" userscript — it permanently cleans the LinkedIn feed. Repo: https://github.com/abernier/userscripts

Language: conduct the ENTIRE conversation — questions, checkbox options, instructions — in the user's language, not necessarily English. You won't know their language on the first message (it is a prefilled prompt): if you have no other signal, ask the very first question in English with a one-line note telling them they can reply in any language, then switch to their language for everything else as soon as they write.

First, ask the user how much they want hidden, with ONE single-select question. STRONGLY prefer your interface's native interactive question UI (an AskUserQuestion-style tool) over plain text; only fall back to a text list if no such UI exists. Do NOT ask anything else at this stage. The 4 options:

- **light** — ads & junk posts only: Suggested / "From your activity" posts, Promoted posts, LinkedIn Learning posts, Premium upsells
- **balanced** — light + social-proof reposts ("X likes this"), "Add to your feed", LinkedIn News, games/puzzles (recommended — the script's default)
- **aggressive** — everything: balanced + job recommendations + "Videos for you"
- **custom** — pick item by item

Follow-ups, only when triggered:

- If **aggressive**: ask one yes/no question — "Also remove the bottom-right Messaging bubble?" Yes = the `nuclear` preset, no = the `aggressive` preset.
- If **custom**: ask these 3 grouped multi-select checkbox questions (native UI again; mark the "balanced"-preset items as recommended):

  Feed posts:
  - Suggested / "From your activity" posts (recommended)
  - Promoted / sponsored posts (recommended)
  - LinkedIn Learning course posts (recommended)
  - Social-proof reposts: "X likes this", "Y commented on…" (recommended)

  Feed & sidebar modules:
  - "Add to your feed" follow suggestions (recommended)
  - Games / puzzles (recommended)
  - LinkedIn News (recommended)
  - Job recommendations

  Extras:
  - Premium upsells & ads (recommended)
  - "Videos for you"
  - Bottom-right Messaging bubble

Then determine their preset. For light/balanced/aggressive/nuclear it is the chosen option directly. For custom, map their picks to the script config (posts: `suggested`, `promoted`, `learning`, `socialProof` / modules: `followRecos`, `puzzles`, `news`, `jobs`, `video`, `premiumUpsell` / `messagingBubble`):

- `light` = suggested+promoted+learning+premiumUpsell only
- `balanced` = light + socialProof+followRecos+puzzles+news (the default)
- `aggressive` = everything except the Messaging bubble
- `nuclear` = everything

If their picks exactly match a preset, that is their preset; otherwise their preset is `"custom"` and prepare the `CUSTOM` object with their picks.

Then guide them step by step, waiting for them at each step:

1. Ask them to confirm: "I have the Tampermonkey extension installed" (yes/no). If your environment gives you browser access (e.g. Claude in Chrome), verify it yourself instead of asking. If they don't have it, help them install Tampermonkey for their browser. On Chrome, make sure "Allow User Scripts" (or Developer mode) is enabled for Tampermonkey in `chrome://extensions`, otherwise scripts will not run.
2. Have them open https://raw.githubusercontent.com/abernier/userscripts/main/linkedin_not_interested.user.js and click Install on the Tampermonkey screen. If the browser shows the raw code as plain text instead of an install screen, Tampermonkey is missing or user scripts are disabled — go back to step 1.
3. Unless their preset is `"balanced"` (nothing to change), have them open the script in the Tampermonkey editor and change the line `const PRESET = "balanced"` to their preset; if `"custom"`, also give them the exact `CUSTOM` object to paste over the existing one.
4. Have them reload https://www.linkedin.com/feed/ and confirm the feed matches what they chose.
