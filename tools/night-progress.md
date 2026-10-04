# Night task progress (branch night-work, started from tag before-night)

Rules: one commit per task, nothing pushed, no release, no data changes, no image of Mojang or the wiki in the repo.
Design changes and new ideas live only in preview pages under tools/ (or a switch that is off).
Anything that needs the owner's approval, a permission or an install is skipped and listed here.

How to continue after a stop: read the table, pick the first task that is not "done", then check `git log night-work`.

| # | Task | State | Commit / notes |
|---|------|-------|----------------|
| 1 | Safe update from 1.0.5 | done | ac8db47. Simulation: 1.0.5 shell then new shell on the same storage. Settings and seen events kept. Fixed: old unseen events (over 7 days, or a promotion already over) no longer become notifications. Real install-over test: see task 8. |
| 2 | Automated tests, one command | done | 9630c6b. `node tests/run.mjs` (or `npm test`). 22 tests pass: notifications, first run, no duplicates, settings dialog in headless Edge. See tests/README.md. |
| 3 | Robot tests with saved sample files | done | 862afe6. 17 robot tests on invented sample answers (tests/fixtures/robot). Fixed 2 robot bugs: a promotion that opened and closed between checks stayed 'announced'; unknown values from GitHub Models were written to the data file. Not pushed, so the robot on GitHub is unchanged. |
| 4 | Resilience (offline, rate limit, bad data, textures) | done | 61957dd. Data files are checked before being shown or saved (a partial file used to be saved and could stop every later start). Faster retry after a failed check (1/2/5/10/15 min) and at once when back online. 20 tests (Node + Edge), including blocked textures. |
| 5 | Long runs: memory, CPU, nothing drawn while hidden | done | 1b7636b. Installed new build, hidden: ~0.3-0.5 s CPU/min, GPU 0 s (figure not drawn), memory flat ~338 MB for 30 min. Long sample (3 h, every 5 min) in scratchpad samples-soak.csv. Installed real 1.0.5 hidden: ~77 s CPU/min (over one core); the update fixes it. |
| 6 | Logs: size limit, old logs deleted | done | 2671c42. Verified on the installed test build: a 1.13 MB log was renamed with the date at start, a new log began, only the 2 newest old logs kept (3 planted, oldest deleted). |
| 7 | Security: only needed addresses, data text cannot run code | done | 7ee7695. CSP, narrower opener/HTTP scopes, blocks logged. Verified on the installed test build with the window open: page, pictures, figure, details window all work, no 'blocked' line in the log. List: tools/security.md. |
| 8 | Install, uninstall, upgrade | done | 675d1c1. On the test copy: install over the previous build kept saved data, seen events, start with Windows. Uninstall removed install folder, Run entry, capewatch://, Programs entry, installer key, notification settings, shortcuts; only the settings/logs folder stays (Tauri's 'delete app data' box decides). Reinstalled and started hidden for the owner's morning check. |
| 9 | Display: 125/150/200%, narrow window, 7 languages, glyphs | done | 65351cf. 14 checks (7 languages x 400/1200 px): 13 clean, 1 known (French 400 px: '(estimation)' touches the card border; fix only as a preview). Pixel font is missing Cyrillic, Spanish 'í', Portuguese 'á' (fallback font mid-word). Sharp enough at 100-200 %. Screenshots: _screenshots/night/display/ (local). |
| 10 | Code cleanup and clear comments | done | 7108b40. runGlow (old CSS-filter title glow) removed; stale comments about the leaf-block title fixed; map of the page script; no behaviour change, all tests pass. Rays: already gone. |
| 11 | Design consistency review (preview only) | done | 1c691ce. 6 measured items, fixes only in tools/preview/fixes-11.css. Open http://localhost:8766/tools/design-review.html (launch.json title-tuner, after node app/build-web.mjs). |
| 12 | Missing states: offline, failed check, first load (preview only) | done | 6f30e78. tools/preview-states.html: 5 states (first load, offline first start, offline with saved copy, GitHub failed, robot stopped), today vs proposal, he/en. Also fixed a real bug found here: empty 'Announced' heading (hidden attribute overridden). |
| 13 | About window (preview only) | done | a8db0b9. tools/preview-about.html (he/en, dark/light). Also fixed a real bug found here: the English Mojang line showed its final period on the left in Hebrew. |
| 14 | Catalog search and filters (proposal + preview) | done | 8066b79. Proposal in tools/ideas.md, prototype tools/preview-catalog.html (checked: TikTok 5, MINECON 7, volunteers 3, quick filters). |
| 15 | Discord webhook (proposal + preview) | done | 92e05c0. Proposal in tools/ideas.md, prototype tools/preview-discord.html (nothing sent). Checked: address validation, mentions off, formatting escaped. |
| 16 | Cape picture inside the Windows notification (proposal + preview) | done | 9f21864. Proposal in tools/ideas.md, prototype tools/preview-toast.html (3 placements with the real drawn picture, toast XML). |
| 17 | Countdown and add to calendar (proposal + preview) | not started | |
| 18 | More ideas | not started | |
| E | README, change list draft, morning summary | not started | |

## Owner's answers (2026-10-04, morning)

- French '(estimation)' touching the border: fixed (6f8ab0d).
- Pixel font missing Russian, í, á: letters added (543e8db).
- Google fonts: shipped inside the app (e1fb1b9).
- Merge night-work into main: after the owner checks (not done).
- Then continue: Part B, Part C, README, change list draft.

## Log

- Task 1 done. 7 simulation tests pass (`node --test tests/unit/update.test.mjs`).
- Task 2 done. One command runs Node tests and headless-Edge tests; 22/22 pass.
- Task 3 done. All tests: 39/39 pass.
- Task 4 done. All tests: 59/59 pass.
- Task 5 code committed. Baseline sample running: installed 1.0.5 hidden uses up to ~1 core; combined update ~0.7% of a core.
- Task 6 code committed (cargo check OK).
- Task 7 code committed. All tests 67/67.
- Task 9 done. Task 5 measured on the installed new build: hidden ~0.3-0.5 s CPU per minute, GPU 0 (figure not drawn), memory flat ~338 MB for 13+ min. Installed real 1.0.5 hidden: ~77 s CPU per minute (more than one core).
- Task 10 done. Part A finished except the uninstall check of task 8 (next).
- Task 8 done. Tasks 6 and 7 verified on the installed build: log rotation (1 MB, 2 old kept, older deleted) and nothing blocked by the security policy with the window open.
- Task 6 verified.
- Task 7 verified.
- Task 5 done. STOPPED HERE (usage limit). Not started: tasks 11-18, README, change-list draft. Next: task 11.
- Owner approved the three fixes; done and tested (81/81). Continuing with task 11.
- Task 11 done (preview only).
- Task 12 done (preview only) + 1 bug fix (82/82 tests).
- Task 13 done (preview only) + 1 bug fix. Part B finished.
- Task 14 done (proposal + prototype).
- Task 15 done (proposal + prototype).
- Task 16 done (proposal + prototype).
