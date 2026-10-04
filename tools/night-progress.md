# Night task progress (branch night-work, started from tag before-night)

Rules: one commit per task, nothing pushed, no release, no data changes, no image of Mojang or the wiki in the repo.
Design changes and new ideas live only in preview pages under tools/ (or a switch that is off).
Anything that needs the owner's approval, a permission or an install is skipped and listed here.

How to continue after a stop: read the table, pick the first task that is not "done", then check `git log night-work`.

| # | Task | State | Commit / notes |
|---|------|-------|----------------|
| 1 | Safe update from 1.0.5 | done | ac8db47. Simulation: 1.0.5 shell then new shell on the same storage. Settings and seen events kept. Fixed: old unseen events (over 7 days, or a promotion already over) no longer become notifications. Real install-over test: see task 8. |
| 2 | Automated tests, one command | done | 9630c6b. `node tests/run.mjs` (or `npm test`). 22 tests pass: notifications, first run, no duplicates, settings dialog in headless Edge. See tests/README.md. |
| 3 | Robot tests with saved sample files | not started | |
| 4 | Resilience (offline, rate limit, bad data, textures) | not started | |
| 5 | Long runs: memory, CPU, nothing drawn while hidden | not started | |
| 6 | Logs: size limit, old logs deleted | not started | |
| 7 | Security: only needed addresses, data text cannot run code | not started | |
| 8 | Install, uninstall, upgrade | not started | |
| 9 | Display: 125/150/200%, narrow window, 7 languages, glyphs | not started | |
| 10 | Code cleanup and clear comments | not started | |
| 11 | Design consistency review (preview only) | not started | |
| 12 | Missing states: offline, failed check, first load (preview only) | not started | |
| 13 | About window (preview only) | not started | |
| 14 | Catalog search and filters (proposal + preview) | not started | |
| 15 | Discord webhook (proposal + preview) | not started | |
| 16 | Cape picture inside the Windows notification (proposal + preview) | not started | |
| 17 | Countdown and add to calendar (proposal + preview) | not started | |
| 18 | More ideas | not started | |
| E | README, change list draft, morning summary | not started | |

## Skipped: needs the owner

(nothing yet)

## Log

- Task 1 done. 7 simulation tests pass (`node --test tests/unit/update.test.mjs`).
- Task 2 done. One command runs Node tests and headless-Edge tests; 22/22 pass.
