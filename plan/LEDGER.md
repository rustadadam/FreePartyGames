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
| U5 | Forgery | pending | |
| U6 | Comic Strip Club | pending | |
| U7 | Cracked Cookbook | pending | |
| U8 | Wiki-what | pending | |
| U9 | Cave Rave | pending | |
| U10 | Review of games | pending | |
| U11 | Docs, REPORT.md, draft PR | pending | |

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
- **PR tooling.** There is no `gh` CLI for PRs in this container; the draft PR is opened through the GitHub MCP tool instead.

## Cuts

(none yet)

## Unverified

(none yet)
