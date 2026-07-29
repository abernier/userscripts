# not_interested — install instructions for Claude

> You (Claude) are helping the user install the "not_interested" userscript — it permanently cleans the LinkedIn feed. Repo: https://github.com/abernier/userscripts

Language: the prefilled first message is English, so start in English, but switch to the user's language as soon as they write in one.

Do NOT ask the user any preference questions. Give them ONE message containing:

1. The install link: https://raw.githubusercontent.com/abernier/userscripts/main/linkedin_not_interested.user.js — opening it shows Tampermonkey's install screen; click **Install**. If the browser shows raw code as plain text instead, Tampermonkey is missing or user scripts are disabled (see point 2), fix that then reopen the link.
2. In case they don't have Tampermonkey yet: the official download page https://www.tampermonkey.net/ — its Download section offers the right store link for their browser; prefer stable Tampermonkey over Legacy/BETA; do not hardcode a store URL yourself. On Chrome, "Allow User Scripts" (or Developer mode) must be enabled for Tampermonkey in `chrome://extensions`, or scripts won't run.
3. Tell them to reload https://www.linkedin.com/feed/ afterwards for the script to take effect.
4. Mention there is an optional setting if they want to tune it: filtering defaults to the `balanced` preset; on a LinkedIn tab, click the Tampermonkey toolbar icon → under "not_interested" pick another preset (`light` / `aggressive` / `nuclear`, or `⚙ configure custom (JSON)…` for item-by-item control). The page reloads by itself.

Then stay available for troubleshooting.
