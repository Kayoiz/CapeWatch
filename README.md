<p align="center"><img src="assets/brand/banner.jpg" alt="CapeWatch" width="100%"></p>

# CapeWatch

A Minecraft cape tracker for Windows. It lists every cape, shows new capes and promotions, and sends a Windows notification when something changes.

**Download:** see [Releases](https://github.com/Kayoiz/CapeWatch/releases/latest). The installer is not digitally signed, so Windows SmartScreen may show a warning ("More info" → "Run anyway").

- `data/capewatch.json`: the cape data (text and IDs only), updated twice a day by the robot in `.github/workflows/robot.yml`.
- `app/`: the Windows app (Tauri). Card pictures are drawn at runtime from the Minecraft textures; no game or wiki images are stored here.
- `cape-radar.html`: the page the app shows.

Contact: kayoiz.dev@gmail.com · Support: https://paypal.me/Kayoiz

NOT AN OFFICIAL MINECRAFT PRODUCT. NOT APPROVED BY OR ASSOCIATED WITH MOJANG OR MICROSOFT.

© Kayoiz. All rights reserved.
