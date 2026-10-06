# License texts that do not come with a download

`tools/make-licenses.mjs` builds `THIRD-PARTY-NOTICES.txt` from the license files that come with each Rust crate and
with Rust itself. These texts do not come that way, so they are kept here, word for word, with where each one is from:

| File | What it covers | Where it is from |
|---|---|---|
| `webview2-rs.txt` | the crates `webview2-com` and `webview2-com-sys` (MIT), which ship no license file | https://github.com/wravery/webview2-rs/blob/main/LICENSE |
| `webview2-sdk.txt` | Microsoft's WebView2 loader (`WebView2LoaderStatic.lib`), which `webview2-com-sys` links into `capewatch.exe` | the license file of the WebView2 SDK, the same in every version (for example https://www.nuget.org/packages/Microsoft.Web.WebView2/1.0.3650.58/License) |
| `nsis.txt` | NSIS, which makes the installer and the uninstaller | the `COPYING` file of NSIS 3.11, the copy Tauri uses to build the installer |
| `nsis-tauri-utils.txt` | Tauri's NSIS plugin (`nsis_tauri_utils.dll`) in the installer and the uninstaller (MIT OR Apache-2.0: MIT used) | https://github.com/tauri-apps/nsis-tauri-utils/blob/dev/LICENSE_MIT |
