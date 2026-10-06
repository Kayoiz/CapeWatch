# What CapeWatch connects to, and why

Every address the installed app reaches. The page is held to this list by its security policy
(`app/src-tauri/tauri.conf.json`, "csp"); anything else is blocked and written to the log
("blocked by the security policy: ..."). Checked by `tests/browser/security.test.mjs`.

| Address | Who | Why |
|---|---|---|
| `api.github.com` (repos/Kayoiz/CapeWatch/contents/data/capewatch.json) | page | The cape data, every 30 minutes and on "Check now" |
| `raw.githubusercontent.com` (Kayoiz/CapeWatch/main/...) | page | The same data file when the GitHub API limit is reached; textures CapeWatch drew itself (assets/own-capes/) |
| `textures.minecraft.net` | page | Cape textures for the figure and the card pictures, the user's skin. Pictures only, never sent anything |
| `minecraft.wiki` (`/images/` only) | page | The textures of the three capes that were never on Mojang's texture server (Christmas 2010, New Year 2011, Progress Pride), the only wiki files the app loads, each time they are shown; never stored, credited in the footer ("Cape textures © Mojang Studios, via the Minecraft Wiki"). Pictures only, never sent anything |
| `api.mojang.com`, `sessionserver.mojang.com` | app (HTTP plugin) | "My skin" and "Owned capes": turns a Minecraft name into its id, skin address and the cape being worn. Only names the user types (or saved before) are sent. The player shown under "Owned capes" is checked again by id at start, every 10 minutes while the app runs and when its window is opened (never twice within a minute), for CapeWatch's own record of the capes they wear, which stays on the computer |
| `capes.me` (`/api/` only) | app (HTTP plugin) | "Owned capes": the capes this public cape database has seen a player wear before (Mojang tells only the one being worn), and its list of capes (kept a day). Only the Minecraft id of a player the user looks up is sent, with a "CapeWatch" user agent; only Mojang texture addresses are taken from the answers |
| `github.com/Kayoiz/CapeWatch/releases/...` | app (updater) | Checks for an update at start; updates are signed and refused without the right signature |

Opened in the user's own browser or mail app, never inside CapeWatch (and only these):
`minecraft.wiki`, `www.minecraft.net` (redeem page), `capes.me` (a player's page there, from "Owned capes"), `paypal.me` (donate), `mailto:` (contact).

Everything is encrypted: every address above is https (the only "http" name, `http://ipc.localhost`, is Tauri's own
channel inside the app, never the network), the HTTP plugin and the links are https only, and Mojang's http texture
links are turned into https before anything is loaded. Checked by `tests/unit/https.test.mjs`.

Lookups are limited on CapeWatch's side too: at most 20 a minute at Mojang and at capes.me, whatever is typed, so the
app never floods them from the user's computer; answers are kept for a minute (`tests/unit/player.test.mjs`).

There is no account, no sign-in and no server of CapeWatch's own: nothing to break into, no database (so no SQL),
no forms sent anywhere, no sessions. **Settings → Delete my data** removes everything the app keeps on the computer
(localStorage and the log files, through the `clear_logs` command in main.rs); only "Start with Windows" keeps its value.

Data text can never run as code: the page only ever puts data into the page as text (never as HTML),
links are built by the page itself (the wiki link always starts with `https://minecraft.wiki/w/`), the
Windows notification text is escaped, and the `capewatch://cape/<id>` address only accepts letters, digits,
`-` and `_`. `tests/browser/security.test.mjs` fills every text field with HTML and script tricks to check.
On top of that the security policy turns on **Trusted Types** (`require-trusted-types-for 'script'; trusted-types 'none'`):
the browser itself refuses any text that would become HTML or script (innerHTML, document.write, script text or
addresses, new policies), so even a future mistake in the code cannot open that door. The page and the shell build
everything element by element; eval is refused too. Checked under the real policy in `tests/browser/security.test.mjs`.

The data robot (robot/robot.mjs) checks the texts the language model writes for a new cape against a list of
offensive words in the 7 languages (robot/offensive.mjs; whole words only, never a name on robot/allowed-words.json,
never a cape's official name). A text with such a word is replaced by the fixed template sentence, the cape goes out
as usual, and the owner gets a GitHub issue saying which cape, field and word.

Fonts: Assistant, Secular One and Pixelify Sans ship inside the app (assets/fonts/google/, SIL Open Font
License, licence files next to them), so CapeWatch never contacts Google and looks the same offline.
