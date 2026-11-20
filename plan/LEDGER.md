# Ledger: cloud run

Resume from the first unit not marked **done**.

## Units

| # | Unit | Status | Evidence |
|---|---|---|---|
| U0 | Scaffold | done (3c6ea28) | orchestrator reran: typecheck clean; build `dist/assets/index-*.js 11.60 kB ✓ built` |
| U1 | Protocol, engine, `_template`, contract + engine tests | done (f28f327) | orchestrator reran: `Test Files 2 passed, Tests 47 passed`; typecheck + build clean |
| U2 | Worker, RoomDO, smoke script | done (ea7ac5a) | orchestrator reran: 47 tests pass; `PASS tap-duel room JKTM in 11.7s … smoke: all 1 game(s) passed`; no wrangler left running |
| U3 | Design system + client shell + kit | pending | |
| U4 | Review of U1–U3 | pending | |
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
- **PR tooling.** There is no `gh` CLI for PRs in this container; the draft PR is opened through the GitHub MCP tool instead.

## Cuts

(none yet)

## Unverified

(none yet)
