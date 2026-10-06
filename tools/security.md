# What CapeWatch connects to, and why

Every address the installed app reaches. The page is held to this list by its security policy
(`app/src-tauri/tauri.conf.json`, "csp"); anything else is blocked and written to the log
("blocked by the security policy: ..."). Checked by `tests/browser/security.test.mjs`.

| Address | Who | Why |
|---|---|---|
| `api.github.com` (repos/Kayoiz/CapeWatch/contents/data/capewatch.json) | page | The cape data, every 30 minutes and on "Check now" |
| `raw.githubusercontent.com` (Kayoiz/CapeWatch/main/...) | page | The same data file when the GitHub API limit is reached; textures CapeWatch drew itself (assets/own-capes/) |
| `textures.minecraft.net` | page | Cape textures for the figure and the card pictures, the user's skin. Pictures only, never sent anything |
| `api.mojang.com`, `sessionserver.mojang.com` | app (HTTP plugin) | "My skin" and "Owned capes": turns a Minecraft name into its id, skin address and the cape being worn. Only names the user types (or saved before) are sent |
| `capes.me` (`/api/` only) | app (HTTP plugin) | "Owned capes": the capes this public cape database has seen a player wear before (Mojang tells only the one being worn), and its list of capes (kept a day). Only the Minecraft id of a player the user looks up is sent, with a "CapeWatch" user agent; only Mojang texture addresses are taken from the answers |
| `github.com/Kayoiz/CapeWatch/releases/...` | app (updater) | Checks for an update at start; updates are signed and refused without the right signature |

Opened in the user's own browser or mail app, never inside CapeWatch (and only these):
`minecraft.wiki`, `www.minecraft.net` (redeem page), `capes.me` (a player's page there, from "Owned capes"), `paypal.me` (donate), `mailto:` (contact).

Data text can never run as code: the page only ever puts data into the page as text (never as HTML),
links are built by the page itself (the wiki link always starts with `https://minecraft.wiki/w/`), the
Windows notification text is escaped, and the `capewatch://cape/<id>` address only accepts letters, digits,
`-` and `_`. `tests/browser/security.test.mjs` fills every text field with HTML and script tricks to check.

Fonts: Assistant, Secular One and Pixelify Sans ship inside the app (assets/fonts/google/, SIL Open Font
License, licence files next to them), so CapeWatch never contacts Google and looks the same offline.
