# Ledger: cloud run

Resume from the first unit not marked **done**.

## Units

| # | Unit | Status | Evidence |
|---|---|---|---|
| U0 | Scaffold | done (3c6ea28) | orchestrator reran: typecheck clean; build `dist/assets/index-*.js 11.60 kB ✓ built` |
| U1 | Protocol, engine, `_template`, contract + engine tests | done (f28f327) | orchestrator reran: `Test Files 2 passed, Tests 47 passed`; typecheck + build clean |
| U2 | Worker, RoomDO, smoke script | done (ea7ac5a) | orchestrator reran: 47 tests pass; `PASS tap-duel room JKTM in 11.7s … smoke: all 1 game(s) passed`; no wrangler left running |
| U3 | Design system + client shell + kit | done (de48e0f) | orchestrator reran: `Test Files 3 passed, Tests 49 passed`; typecheck clean; shell JS 49.8 kB (18.5 kB gzip); 15 screenshots in `docs/screenshots/` reviewed |
| U4 | Review of U1–U3 | done (04fba6e, 1ccd49e) | 14 findings, 13 fixed (stale sockets after eviction, kicked token reuse, dead-socket detection, oversized asset replies, setup throw, …). Orchestrator reran: `Tests 57 passed`; smoke `PASS tap-duel … all 1 game(s) passed`; test diff is additions only |
| U5 | Forgery | done (4627db3, merged) | orchestrator reran after merge: `Test Files 5 passed, Tests 139 passed` (forgery 28 incl. leak tests over 3/5/8 players × 5 seeds; contract 71); typecheck + build clean; screenshots `docs/screenshots/forgery-*` reviewed |
| U6 | Comic Strip Club | done (4adcebd, merged) | orchestrator reran after merge: `Test Files 4 passed, Tests 88 passed` (contract 48 incl. comic-strip-club 3/8/20 × 3 seeds ± screen); typecheck + build clean. Agent's smoke: `PASS comic-strip-club … 2 skips, assets ok (16 ids)`. Remix shipped. UI not yet seen in a browser (U10). |
| U7 | Cracked Cookbook | done (11e74ad, merged) | orchestrator reran after merge: `Test Files 7 passed, Tests 208 passed` (cookbook 10: hand-only stickers, prop-artist scoring, no self-vote, no hand/author leaks; contract 117); typecheck + build clean; screenshots reviewed (cook screen is long on a phone; canvas scrolls off; flagged for U10) |
| U8 | Wiki-what | done (ad11d29, merged) | orchestrator reran after merge: `Test Files 6 passed, Tests 175 passed` (wiki-what 13 incl. pack validation + answer/Mole leak tests over 3/6/11 players × 3 seeds; contract 94); typecheck + build clean. 220 questions; orchestrator sampled ~20 rows, all plausible. |
| U9 | Cave Rave | done (44bdb30, merged) | orchestrator reran after merge: `Test Files 8 passed, Tests 242 passed` (cave-rave 11: deterministic charts, byes + one champion, score sanity checks, sabotage rules; contract 140); typecheck + build clean (chunk 25.5 kB, 10.1 kB gzip). Agent smoke: `PASS cave-rave … 2 skips` (song plays with no view change; live scores go over ephemeral). |
| U10 | Review of games | in progress | Pre-review full smoke (orchestrator): `PASS tap-duel 12.7s, PASS forgery 48.5s (assets ok 48 ids), PASS comic-strip-club 25.9s (assets ok 18 ids), PASS wiki-what 131.4s, PASS cracked-cookbook 11.8s (assets ok 15 ids), PASS cave-rave 105.0s … smoke: all 6 game(s) passed`, exit 0, no wrangler left |
| U11 | Docs, REPORT.md, draft PR | in progress: Readme, DEPLOY.md, ADDING_A_GAME.md drafted | |

## Decisions

- **Branch.** The cloud prompt names `cloud/party-platform`, but this session's git policy only allows pushing to `claude/plan-cloud-prompt-rlbmy4`. All work happens on `claude/plan-cloud-prompt-rlbmy4` (reversible: the branch can be renamed on GitHub).
- **Protocol shape (U1).** Every message and host command carries a `type` field; an extra `leave` client message exists; no `updateSettings` (games use `defaultSettings`).
- **Host rules (U1).** The first device to join sets the mode (screen → Screen mode, player → host-player). Host passes to the next human in seat order on leave, kick, or a 30 s disconnect grace; reconnect does not reclaim host.
- **Disconnects (U1).** Seat and score kept; `onPlayerLeave` fires after a 30 s grace (or immediately on leave/kick). Late joiners spectate until the next game.
- **Caps (U1).** 64 KB per inbound message and per view; names ≤ 24 chars.
- **Two tsconfigs (U1).** `tsconfig.worker.json` covers server, core, shared and game logic with Workers types and no DOM, so a DOM import in logic fails typecheck.
- **Room creation (U2).** Worker picks a code and asks the DO to claim it (retry ≤ 8). WebSocket to an unclaimed code is 404, so typos never create rooms.
- **Persistence (U2).** SQLite KV: `snapshot`, one key per asset, `idleAt`. Snapshot written at most once a second (leading + trailing write); immediate on new seat and socket close. A pending write blocks hibernation.
- **Cleanup (U2).** Rooms with no sockets for 2 h are deleted at the alarm.
- **Dev bots flag (U2).** `DEV_BOTS` is `"0"` in `wrangler.jsonc` (deploys ship without bots); `npm run worker` and smoke pass `--var DEV_BOTS:1`.
- **Smoke skips (U2).** Smoke players act every 300 ms with the game's own `bot.act`; after 8 s with no view change the screen sends `skip` (printed).
- **Design (U3).** Tokens in `docs/DESIGN.md`: grape-night purple base, pink/yellow accents; Bagel Fat One / Atkinson Hyperlegible Next / Martian Mono via `@fontsource` (latin subset). Signature: the room code on a tilted admission ticket with a QR stub. Per-game `data-game` sub-palettes.
- **Strokes (U3).** Integer points in a 1000-unit-wide virtual box; format in `src/shared/strokes.ts`, zod in `src/shared/strokeSchema.ts`. Protocol limits moved to `src/shared/limits.ts` to keep zod out of the shell bundle.
- **Deadlines in views (U3).** Games expose deadlines as server timestamps in views; clients count down with the NTP-style server clock.
- **Persistence policy (U4).** Seats, tokens, host, phase, scores and connects are written in the same event; game-only churn keeps the 1 s throttle (free plan: 100k rows written/day). A hard crash can lose ≤ 1 s of game-only state, never a seat or score.
- **Contract additions (U4).** Views must survive snapshot/restore identically; ≥ 2 distinct players must act; with every player idle a game must still finish on its own timers; stale/out-of-turn actions must not throw or stall. `recordViews()`/`findLeaks()` added to testkit for secret-leak tests.
- **Left open (U4).** Lobby start button counts away players (server rejects with a toast); spectators receive ephemeral messages (games must never send secrets that way); `POST /api/rooms` has no rate limit.
- **Cave Rave model (U9).** Launched on opus from the start rather than sonnet: it's the most complex game (clock sync, Web Audio, brackets), and escalating early is cheaper than two failed sonnet runs.
- **Wiki-what live mode (U8).** Builder told to cut it: the VM can't reach Wikipedia, so the network code would ship unverified.
- **Comic Strip Club (U6).** Chain rotation: round r, player p works chain (p − r) mod n (no repeats at ≥ 4 players; at 3 the author draws panel 3 of their own strip, never back-to-back). Min 3 players. You can't vote for the strip whose prompt you wrote. 100 pts per vote to each distinct contributor. Remix shipped (2–4 bonus strips, no vote).
- **Forgery (U5).** Ties or no votes accuse nobody (forger escapes). Scoring: forger uncaught +3; caught but guesses word +2; caught and wrong → every artist +1; each artist who voted for the forger +1. Forger leaving mid-round voids the round. Guess is a pick-list sent only to the caught forger. Strokes forced to seat color server-side.
- **Wiki-what (U8).** 3 rounds × 4 questions, 3–20 players. Team answer = plurality; ties go to the tied choice whose first supporter locked in earliest; no picks = wrong, nobody scores. Right: +2 team, +1 personal per correct picker. Wrong: Mole +3. Mole caught (strictly most accusations): +3 team, +1 per correct accuser; not caught: Mole +3. Final = personal + team total (leavers keep personal only). Personal scores and article titles stay hidden until reveals (both would leak the Mole/answer).
- **Cracked Cookbook (U7).** One dealt prompt per drawing round (name editable). Hands: ≤ 6 props by other players (own props only if < 3 others exist). Dish creator +300/vote; each distinct other prop artist on that dish +100/vote. Empty drawings skip the pantry; < 2 dishes skips straight to reveal. Sliders instead of pinch for sticker size/rotation.
- **Cave Rave (U9).** Calibration lives in the game's get-ready phase (with a Retune button), not the lobby shell. Bye players can't sabotage. Bye goes to the fewest-byes player (rng tie-break). Duel tie-break: present > left, then score, accuracy, rng. Server rejects scores > max, inconsistent hit/miss counts, early (> 2.5 s before song end) or late (> 5 s after) or duplicate submissions. Sabotage: 8 s cooldown; fog 2 s, mirror 3 s, wobble 3 s; no stacking, ≤ 2 active per target. Points: +2 per round cleared, +3 champion. All duels in a round share one song.
- **Worktree base.** The game worktrees were created from `master` (plan-only); each builder fast-forwarded to `1d9e4aa` (U4 done) before building, so merges were clean except for registry lines, resolved by hand.
- **PR tooling.** There is no `gh` CLI for PRs in this container; the draft PR is opened through the GitHub MCP tool instead.

## Cuts

- **Cave Rave drawn beats** (cut order #1): cut to keep the core duel, sync and all three sabotage effects solid.
- **Cave Rave music on the TV**: not built (not in the plan); TV audio would arrive at a different latency than each phone's.
- **Wiki-what live random-article mode** (cut order #3): the VM can't reach Wikipedia, so it couldn't be verified; no network code shipped.

## Unverified

- **Wiki-what pack accuracy**: 220 questions written from model knowledge without web access; owner should spot-check. Least-sure article titles: "Emperor Norton", "Pig War (1859)", "Bliss (image)", "Comedian (artwork)", "Palais idéal", "Wollemia".
