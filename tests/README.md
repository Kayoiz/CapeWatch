# CapeWatch tests

Run everything with one command from the project folder:

```
node tests/run.mjs
```

(`npm test` does the same.) It builds the app page first, then runs every test. A line with ✔ passed, ✖ failed;
the summary at the end says how many of each. Nothing needs installing: the tests use Node and the Microsoft Edge
that comes with Windows (without Edge the browser tests are skipped, the rest still run). The licenses tests also ask
Rust's own tools (cargo) which crates the app is built from; without Rust, those are skipped.

Run one group only: `node tests/run.mjs unit`, `node tests/run.mjs robot` or `node tests/run.mjs browser`.

| Folder | What it checks | How |
|---|---|---|
| `unit/` | Notifications (new cape, promotion opened, ending soon), the first run, no notification twice, the update from 1.0.5, no internet, the GitHub limit, a bad data file; that `THIRD-PARTY-NOTICES.txt` matches what the app is built from | Runs the real `app/shell.js` in Node with the app bridge, storage and network faked (`lib/shell-sandbox.mjs`); runs `tools/make-licenses.mjs` and cargo |
| `robot/` | The robot: a wiki page that changed, a page that does not load, missing data, dates and time zones | Runs the real `robot/robot.mjs` against saved sample answers in `fixtures/robot/` (made-up capes, no wiki text) |
| `browser/` | The page itself: the settings dialog saves, text from the data file cannot run code, the page survives bad data | Opens `app/dist/index.html` in headless Edge (`lib/edge.mjs`), with the app bridge faked (`lib/fake-tauri.mjs`) |

`fixtures/shell-1.0.5.js` is the shell exactly as released in 1.0.5, for the update tests. Do not edit it.
