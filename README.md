<p align="center"><img src="assets/brand/banner.jpg" alt="CapeWatch" width="100%"></p>

# CapeWatch

A Minecraft cape tracker for Windows. CapeWatch lists every cape released for Java and Bedrock, shows which
promotions are open right now and how long they have left, and sends a Windows notification when a new cape
appears, a promotion opens or a promotion is about to end.

- Every cape in one catalog, with search and filters (edition, status, cost, type).
- Open promotions first, with a countdown and how to get each cape.
- Windows notifications you choose: new cape, promotion opened, promotion ending soon. Click one to open that cape.
- A 3D figure wearing the capes and their elytra; your own skin by Minecraft username.
- Owned capes: type a Minecraft name to see that player's capes: the one they are wearing (from Mojang) and the ones
  [capes.me](https://capes.me) has seen them wear before. Tick any others they own, and they stay listed.
- Starts quietly with Windows and waits in the tray; checks for news every 30 minutes and works offline with the last list it has.
- 7 languages: English, עברית, Español, Português, Français, Deutsch, Русский.

## Install

1. Download the installer (`CapeWatch_x.y.z_x64-setup.exe`) from [Releases](https://github.com/Kayoiz/CapeWatch/releases/latest). Download it only from there.
2. Run it. It installs for your Windows user only and needs no administrator rights.
3. CapeWatch updates itself: when a new version is out, it installs it at the next start.

### "Windows protected your PC"

Windows SmartScreen may show this warning the first time you run the installer. It appears because the
installer is not signed with a paid code-signing certificate, not because anything was found in it. To go on,
click **More info**, then **Run anyway**. The updates CapeWatch installs by itself are signed with CapeWatch's
own key and refused if the signature does not match.

### Uninstall

Windows Settings → Apps → Installed apps → CapeWatch → Uninstall. This removes the app, its start-with-Windows
entry and everything it registered. Your settings stay unless you tick **Delete the application data**.

## Privacy

CapeWatch has no account and sends nothing about you. It downloads the cape list from this repository, cape
textures from Minecraft's texture server (the three that were never there, Christmas 2010, New Year 2011 and
Progress Pride, from the Minecraft Wiki), and (only if you enter a Minecraft username, for your skin or under
Owned capes) that player's skin and worn cape from Mojang. Under Owned capes it also asks capes.me, a public cape
database, which capes it has seen that player wear; only the player's Minecraft id is sent there. The names you look
up and the capes you tick stay on your computer. The full list of addresses, and why, is in [tools/security.md](tools/security.md).

## How it works

- `data/capewatch.json`: the cape data (text and IDs only), updated twice a day by the robot in
  `.github/workflows/robot.yml` (`robot/robot.mjs`). The wiki is used only as a source of facts; every text is
  written fresh.
- `app/`: the Windows app (Tauri). Card pictures are drawn at runtime from the Minecraft textures; no game or wiki
  image is stored in this repository.
- `cape-radar.html`: the page the app shows.
- `tests/`: all tests in one command, `node tests/run.mjs` (see [tests/README.md](tests/README.md)).

## Contact and support

Questions, mistakes in the data, ideas: kayoiz.dev@gmail.com
If CapeWatch is useful to you, you can support it: https://paypal.me/Kayoiz

---

NOT AN OFFICIAL MINECRAFT PRODUCT. NOT APPROVED BY OR ASSOCIATED WITH MOJANG OR MICROSOFT.
Minecraft is a trademark of Microsoft. Cape facts come from public sources (minecraft.wiki and official Mojang
announcements) and may contain mistakes. The textures of the Christmas 2010, New Year 2011 and Progress Pride capes
are loaded from the Minecraft Wiki when shown and never stored; the wiki marks them © Mojang Studios, and its own
content is under CC BY-NC-SA 3.0.

© Kayoiz. All rights reserved. Included third-party parts keep their own licences: skinview3d and three.js
(MIT, `vendor/skinview3d/`), the Assistant, Secular One and Pixelify Sans fonts (SIL Open Font License,
`assets/fonts/google/`).
