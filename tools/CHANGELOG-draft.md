# Draft: what's new in the combined update (not published)

Draft for the release notes of the next version (after 1.0.5). The version number is not set yet; nothing is
released until the owner says so. Written for users, in English like the other release notes.

---

## CapeWatch 1.0.6

### New
- **Owned capes.** Type a Minecraft name to see that player's capes: the one they are wearing (from Mojang) and every cape capes.me, a public cape database, has seen them wear before are listed by themselves; tick any others they own in "Choose capes". Kept on your computer.
- **Click a notification, see the cape.** Clicking a CapeWatch notification opens that cape, even when CapeWatch was closed.
- **A new title and opening.** New title art with a short opening effect and sound, played once when you first open the window. The sound can be turned off in Settings.
- **Turn the figure by hand.** Drag the 3D figure to turn it, scroll to zoom, double-click or ⟲ to reset. Settings has an option to reverse the drag direction.
- **New buttons.** Every button, menu, checkbox and switch reacts in CapeWatch's pixel style (hover, press, keyboard focus). With "reduce animations" on in Windows, nothing moves.
- **A new icon,** sharp at every size.

### Better
- **Starts quietly with Windows.** Only the tray icon; the window, the effect and the sound wait until you open it.
- **No work in the background.** While the window is in the tray or minimized, the figure is not drawn and the capes do not change. (Measured: 1.0.5 could use more than one processor core in the tray; now under 1%.)
- **No pile of old notifications.** After a long time without CapeWatch, only recent news is notified (older events go to the list, not to notifications), and several arrive oldest first.
- **Works offline and with a bad connection.** A damaged or partial data download is ignored and the last good list stays; after a failed check CapeWatch tries again within minutes, and at once when the connection is back.
- **Fonts included.** CapeWatch no longer downloads its fonts from Google; it looks the same with or without internet.
- **Nothing moves when you change language.** Every button, label and box keeps its place and size in all 7 languages. In Hebrew only the text runs right to left; the layout stays the same.
- **Easier to read details.** In a cape's details window each fact has its label as a small line above the value, and in the status strip the labels sit on one line.
- **Christmas 2010, New Year 2011 and Progress Pride look like they do in Minecraft,** drawn from their textures on the Minecraft Wiki (loaded when shown, never stored, credited at the bottom of the window). A cape with no texture anywhere shows a plain cape outline with its name.
- **Every language in the pixel font.** Russian and the accented letters of Spanish, Portuguese, French and German now appear in CapeWatch's pixel font instead of switching to another font mid-word.
- **Tighter security.** The app may only contact the addresses it needs, and opens links only to minecraft.wiki, minecraft.net, capes.me, the Creative Commons licence page, PayPal and e-mail.
- **Logs stay small.** At most about 3 MB, with the older history kept instead of deleted every few hours.
- **Clean uninstall.** Uninstalling removes everything CapeWatch registered in Windows.

### Fixed
- Clicks on buttons sometimes did nothing while the card pictures were being drawn.
- On a small window, a cape's details window could open part-way down (at its wiki button) instead of at the top.
- In French on a narrow window, "(estimation)" pushed past the card border.
- The "Announced, not yet available" heading could stay on the page with nothing under it.
- In Hebrew, the English Mojang notice showed its final period at the wrong end.
- The data robot: a promotion that opened and closed between two checks stayed "announced"; unexpected values from the text generator are no longer saved.

---

NOT AN OFFICIAL MINECRAFT PRODUCT. NOT APPROVED BY OR ASSOCIATED WITH MOJANG OR MICROSOFT.
