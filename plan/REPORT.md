# Cloud run report: Free Party Games platform and 5 games

All twelve work units (U0–U11) are done. Typecheck, `npm test` (248 tests, including the contract test across all 5 games plus `_template`) and the build pass. `npm run smoke` plays every game to completion over real WebSockets against `wrangler dev`. Nothing was deployed.

The full per-unit evidence, every decision and every cut are in [`plan/LEDGER.md`](LEDGER.md). This report summarises them.

## Test results (final run, by the orchestrator)

| Check | Result |
|---|---|
| `npm run typecheck` | clean (`tsc -p tsconfig.json` and `tsc -p tsconfig.worker.json`) |
| `npm test` | `Test Files 8 passed (8)`, `Tests 248 passed (248)` |
| `npm run build` | `✓ built`; shell `index-*.js 51.78 kB │ gzip 19.06 kB`; each game is its own lazy chunk (largest: Cave Rave, 25.5 kB, 10.1 kB gzip) |
| `npm run smoke` | `smoke: all 6 game(s) passed`, exit 0, no wrangler left running (output below) |

Test files: `contract.test.ts` (140 tests: every game × {min, 8, 20} players × 3 seeds × with/without a screen, plus snapshot/restore, idle-to-finish, stale actions and a player leaving), `engine.test.ts` (30), `forgery.test.ts` (28), `wiki-what.test.ts` (15), `cave-rave.test.ts` (11), `cracked-cookbook.test.ts` (14), `comic-strip-club.test.ts` (8), `strokes.test.ts` (2).

```
smoke: 6 game(s): tap-duel, forgery, comic-strip-club, wiki-what, cracked-cookbook, cave-rave; 6 players + 1 screen each
PASS tap-duel room GXQV in 11.2s, 0 skips, no assets
PASS forgery room DXYF in 48.5s, 4 skips, assets ok (48 ids)
PASS comic-strip-club room JQDA in 25.9s, 2 skips, assets ok (18 ids)
PASS wiki-what room ECAF in 131.1s, 3 skips, no assets
PASS cracked-cookbook room MQUG in 11.8s, 1 skips, assets ok (15 ids)
PASS cave-rave room KTKM in 105.0s, 2 skips, no assets
smoke: all 6 game(s) passed
```

About the smoke "skips": the smoke script presses the host's **Skip** when no view changes for 8 s (for example during a Cave Rave song, whose live scores go over the unstored ephemeral channel, or while waiting on a phase timer). Each skip is printed. No game needed a skip to recover from a stall: the contract test separately proves every game finishes on its own timers with every player idle.

## What shipped

### Platform

| Unit | What | Evidence |
|---|---|---|
| U0 | One npm package: Preact + TypeScript + Vite, `wrangler.jsonc` (static assets + SQLite Durable Object migration), vitest, CI (`ci.yml`) and a manual `deploy.yml` | typecheck + build clean |
| U1 | `src/shared` (zod protocol, room codes without I/O/L), `src/core` (pure room engine, game contract, seeded RNG, testkit), the Tap Duel template, contract + engine tests | 47 tests at the time |
| U2 | Worker routes (`POST /api/rooms`, `GET /api/rooms/:code`, `/ws/:code`, SPA fallback), `RoomDO` (WebSocket Hibernation, one alarm for all timers, throttled SQLite persistence, 2 h idle cleanup), `scripts/smoke.ts` | smoke passed; a killed-and-restarted worker restored seats |
| U3 | Design system (`docs/DESIGN.md`), client shell (home, join by link, lobby with QR, screen and host-player modes, host controls, dev bots, reconnect banner, wake lock, server-clock estimate), `src/client/kit` (DrawingCanvas, StrokeView, Timer, Vote, PromptCard, RevealStage, Avatar, PlayerChip, QR, hooks) | screenshots in `docs/screenshots/` |
| U4 | Platform review: 14 findings, 13 fixed (stale sockets after eviction, kicked tokens re-joining, dead-socket detection, oversized asset replies, `setup()` throws, …). The contract test gained idle-to-finish, ≥ 2 actors, restore-identical views and stale-action checks; testkit gained `recordViews`/`findLeaks` | 57 tests at the time |
| U10 | Games review: 7 findings fixed, including two high-severity secret leaks (below); browser pass over every game with and without a screen | 248 tests |
| U11 | `Readme.md`, `docs/DEPLOY.md`, `docs/ADDING_A_GAME.md`, this report | |

### Games

All five are `screen: 'optional'`, play with up to 20 players, have bots, and work in host-player mode with no screen.

- **Forgery** (U5), 3–20 players. A hidden-impostor drawing game: everyone but the forger sees the secret word; two laps of one live stroke each on a shared canvas; vote; a caught forger may steal the win by picking the word. 35 original categories × 10 words. Leak tests: the forger's view and the screen never hold the word before the reveal, and no view but the forger's changes when a different player is the forger.
- **Comic Strip Club** (U6), 3–20 players. Prompt, then three panels, each seeing only the previous item; chains rotate so no player touches a strip twice at 4+ players; synced panel-by-panel reveal; favorite vote. **Remix shipped** (bonus strips from random panels). 74 original premises.
- **Cracked Cookbook** (U7), 3–20 players. Two drawing rounds fill a pantry; each cook gets a meal-with-a-twist and a hand of props drawn by others, placed as draggable stickers plus their own strokes; vote; prop artists earn a bonus per vote. 60 ingredients, 50 scene elements, 48 twists.
- **Wiki-what** (U8), 3–20 players. Team trivia from a bundled pack of **220 questions** about strange real Wikipedia topics, each citing its article title; majority answer; a secret Mole sees the answer and scores when the team is wrong; end-of-round accusation. Leak tests: no non-Mole view or the screen changes when a different player is the Mole, and none carries the answer before the reveal.
- **Cave Rave** (U9), 2–20 players. Single-elimination bracket of 3-lane rhythm duels, all duels in a round at once, byes for odd counts. Charts and music are generated from a seed (Web Audio: kick, snare, hats, bass; no audio files). The server sends a start time on its clock, phones judge hits locally against their clock offset, and the server sanity-checks scores. Tap-along latency calibration. Sabotage from eliminated players: lane fog, mirrored lanes and screen wobble.

### Secret leaks fixed in review (U10)

- **Wiki-what:** the Mole was the only player who never accused, so the last honest accuser could see who was left. Now the Mole casts a decoy accusation that never counts.
- **Cracked Cookbook:** the cook-phase view mapped players to meals, so voters knew every dish's cook. Orders are now listed without names, and prop artists stay hidden until the reveal.
- **Forgery and Wiki-what:** the forger's and Mole's cards looked different from everyone else's at a glance; all role cards now look identical.

## Screenshots

`docs/screenshots/` holds 30 PNGs at 390×844 (phone) and 1920×1080 (screen), taken with Playwright against `wrangler dev`: home, join by link, lobby (TV, phone, host-player), reconnect, results, and in-game shots of every game (for example `forgery-screen-draw-1920.png`, `cracked-cookbook-phone-cook.png`, `wiki-what-screen-mole-1920.png`, `cave-rave-play-screen-1920.png`).

## Cut, skipped or unverified

**Cut, in the plan's cut order:**
- **Cave Rave drawn beats** (cut #1): left out so the core duel, clock sync and all three sabotage effects stay solid.
- **Wiki-what live random-article mode** (cut #3): the VM can't reach Wikipedia, so the code would have shipped untested.
- Not cut: Comic shuffle/remix (shipped), Cave Rave sabotage variety (all three effects shipped), visual polish.

**Not built (not in the plan):** music from the TV in Cave Rave (TV audio would arrive at a different delay than each phone's).

**Unverified:**
- **Wiki-what pack accuracy.** All 220 questions were written from model knowledge with no web access. The least-certain article titles are "Emperor Norton", "Pig War (1859)", "Bliss (image)", "Comedian (artwork)", "Palais idéal" and "Wollemia".
- **Real phones and real networks.** Everything was tested in headless Chromium and Node WebSocket clients on one machine. Cave Rave's audio timing, calibration and iOS audio unlock, the Wake Lock API, and reconnect over cellular have not been tried on real devices.
- **Deploy.** `wrangler deploy` was never run (out of scope); `wrangler deploy --dry-run` read the config and bindings correctly in U0.

**Known open issues (judgement calls, logged in the ledger):**
- A hard crash (not hibernation) can lose up to 1 s of game-only state; seats, scores and phase changes are always written immediately. This keeps a busy drawing game inside the free plan's daily SQLite write limit.
- Cracked Cookbook: a new pantry card appears as its artist leaves the "still drawing" list, so an attentive player can match art to artists.
- Comic Strip Club: vote views key strips by author id (not shown in the UI; a modified client could read it).
- Forgery: a player who leaves keeps their vote in the tally.
- Cave Rave: the live-score relay has no per-client rate limit.
- `POST /api/rooms` has no rate limit; the lobby's Start button counts away players (the server refuses with a message).

## What the owner must do next

1. `npm i && npx wrangler login && npm run deploy` gives a free `*.workers.dev` URL (see `docs/DEPLOY.md`).
2. Optionally add the `CLOUDFLARE_API_TOKEN` repo secret to use the manual **Deploy** workflow.
3. Spot-check the Wiki-what pack in `src/games/wiki-what/content.ts`; each row lists the correct answer first.
4. Play-test on real phones over cellular: host on a laptop in Screen mode, join by link and by code, play each game, lock a phone mid-game and confirm it rejoins the same seat, and repeat one game in host-player mode with no screen.
5. Bots are off in production (`DEV_BOTS = "0"`); set it to `"1"` in `wrangler.jsonc` if you want the **Add bots** button on the live site.

## Decisions made where the plan was silent

The full list, with reasons, is under **Decisions** in `plan/LEDGER.md`. The ones that matter most:

- **Branch:** work is on `claude/plan-cloud-prompt-rlbmy4`, not `cloud/party-platform`, because this session may only push to that branch.
- **Host:** the first device sets the mode; host passes to the next human in seat order on leave, kick or a 30 s disconnect grace.
- **Persistence:** seats, tokens, host, phase and scores are written in the same event; other game changes at most once a second.
- **Dev bots** are on locally (`npm run worker`, smoke) and off in deploys.
- **Cave Rave calibration** lives in the game's get-ready phase rather than the lobby, so core stays game-agnostic.
- **Cave Rave** was built by an Opus game-builder from the start (the most complex game); the other four used Sonnet. No builder failed a unit; three (Cracked Cookbook, Wiki-what, Cave Rave) and the U4 reviewer were paused by account usage limits and resumed from where they stopped.
- **Each game's scoring** is stated in its Rules screen and in the ledger.
