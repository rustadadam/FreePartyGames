# Free Party Games — Build Plan

## Context

The repo is empty: it holds a `Readme.md`, the game sketches in `Games.md`, and has no commits. The origin is `github.com/rustadadam/FreePartyGames`. The goal is a Jackbox-style party platform for 5–20 friends, built and run for free:

- The host opens the site and gets a room code and a link.
- Friends tap a texted link, or type the code on the home page, and play on their phones.
- Some games use a shared TV or laptop screen. Others run with only a host phone.
- New games plug in through one stable contract.
- The first run builds the platform and all five games in `Games.md`. The run happens in an unattended Claude cloud session. This file is the source of truth for that run.

### Decisions already made (by the owner)

| Area | Decision |
|---|---|
| Realtime and hosting | **Cloudflare Workers with Durable Objects**, on the free plan. One Worker serves the static site and the API. Each room is one SQLite-backed Durable Object that holds WebSockets through the Hibernation API. The server is authoritative. |
| Frontend | **Preact, TypeScript and Vite.** |
| Scope | **The platform and all 5 games.** |
| Budget | **None.** Don't track spend, estimate it, or report it. |
| Design | Follow the `frontend-design` skill, which is committed at `.claude/skills/frontend-design/SKILL.md`. |
| Tests | Lean. Test only the invariants that must not change, especially the game contract, and tests that speed up development. Add no alerting. |

### Why Cloudflare (for the record)

- Vercel and Netlify functions can't hold WebSockets.
- GitHub Pages is static-only.
- With peer-to-peer WebRTC, the game dies when the host's phone locks or switches to Messages to text the link.
- The Durable Objects free tier (100k requests per day) is far beyond friend-group use, and edge WebSockets keep latency low.

## Architecture

Use one npm package, no monorepo tooling.

```
src/
  shared/        protocol.ts (message types + zod schemas), types.ts, roomCode.ts
  core/          engine.ts — pure TS room engine (lobby, seats, host, game lifecycle,
                 timers, per-viewer projection, asset store, bots). No Cloudflare or DOM imports.
  server/        worker.ts (routes + static assets), RoomDO.ts (thin adapter: engine <-> WebSockets,
                 alarms, storage)
  client/        app shell: Home (Host / Join), JoinByLink, Lobby, ScreenView, PlayerView,
                 reconnect banner, wake lock; kit/ (DrawingCanvas, Timer, Vote, PromptCard,
                 RevealStage, Avatar, QR) — shared UI every game reuses
  games/
    _template/   tiny reference game ("Tap Duel"), dev-only, copied to start new games
    <gameId>/    logic.ts (server-safe) + ui.tsx (Preact) + content.ts (prompt packs)
    registry.server.ts, registry.client.ts
tests/           contract.test.ts, engine.test.ts, per-game invariant tests
scripts/smoke.ts wrangler dev + Node ws clients play every game with bots
docs/            ADDING_A_GAME.md, DEPLOY.md
plan/            PLAN.md (this file), LEDGER.md, REPORT.md
```

### Rooms and joining

- `POST /api/rooms` returns a 4-letter code. Use letters only and drop the ambiguous ones (no I, O or L).
- The Durable Object is addressed by `idFromName(code)`.
- `GET /:code` serves the single-page app, which opens the join screen with the code filled in. The home page has a code entry box.
- The host chooses a mode:
  - **Screen**: this device is the shared display and not a player. It shows the code, a QR code and the link.
  - **Host-player**: this phone plays and also holds the host controls.
- If the host-player leaves, host controls move to the next player.
- Identity is a random `playerId` plus a secret token, stored in localStorage per room. Reconnecting with the token restores the seat and the score.
- The cap is 20 players plus one screen.
- Phones use the Screen Wake Lock API, plus a visible reconnect banner with automatic retry.

### Protocol

Validate every message with zod at the boundary.

- **Client to server:**
  - `hello {code, token?, name, role}`
  - `action {payload}`
  - `host {cmd: selectGame|start|skip|kick|returnToLobby|addBots}`
  - `ping {c}`
  - `assetReq {ids}`
- **Server to client:**
  - `welcome {you, token, serverNow}`
  - `room {lobby}`
  - `view {gameView}`
  - `ephemeral {payload}`
  - `assets {...}`
  - `pong {c, s}`
  - `error`
- **Full views.** Each viewer gets a full projected view whenever state changes. Views must stay small.
- **Drawings.** Drawings are vector strokes, stored once as content-addressed assets through `ctx.putAsset`. Views reference them by id, and each client fetches and caches them once.
- **Ephemeral messages.** Use the `ephemeral` channel for live, unstored traffic, such as in-progress stroke points in Forgery.

### Game contract (the "easy hookup")

```ts
interface GameDefinition<S, A, Settings> {
  manifest: { id; title; tagline; minPlayers; maxPlayers; screen: 'required'|'optional'|'none';
              estMinutes; hidden?: boolean };
  defaultSettings: Settings;
  actionSchema: ZodType<A>;
  setup(ctx: GameCtx, players: PlayerInfo[], settings: Settings): S;
  onAction(state: S, ctx: GameCtx, playerId: string, action: A): void;   // mutate, engine snapshots
  onTimer?(state: S, ctx: GameCtx, key: string): void;
  onPlayerLeave?/onPlayerReturn?(state, ctx, playerId): void;
  view(state: S, viewer: {kind:'player', id} | {kind:'screen'}): unknown;  // hides secrets
  result(state: S): GameResult | null;   // non-null = game over
  bot: { act(view: unknown, rng: Rng, me: string): A | null };
}
// GameCtx: rng (seeded), now(), setTimer(key, ms), clearTimer, putAsset, broadcastEphemeral, log
// Client side: { Player: FC<{view, send, me, assets}>, Screen: FC<{view, assets}>, Rules: FC }
```

- **Adding a game:** copy `_template/`, then add one line to each registry. `docs/ADDING_A_GAME.md` explains the steps.
- **Bots:** in dev builds, a host button adds bots, so one person can test an 8-player game.
- **No-screen play:** when there's no screen, every phone renders the shared information the game needs. Every game in this run is `screen: 'optional'`. The contract still supports `'required'`.

## Games

Each game is original in name, look and prompt content. Game mechanics follow the sketches in `Games.md`. All prompt packs are written fresh, with no third-party text, art or music.

1. **Forgery** (working name for the "fake artist" sketch: an original hidden-impostor drawing game, not a recreation of the board game, so it uses its own name, art and prompts)
   - Every player except one gets a category and a secret word. The forger sees only the category.
   - Players take turns, two laps. Each turn is one continuous stroke on a shared canvas, in the player's own color, and everyone sees the strokes live.
   - Everyone votes on who the forger is.
   - If the forger is caught, they get one guess at the word and steal the win if they're right.
   - Scoring runs over several rounds, and the forger rotates.

2. **Comic Strip Club**
   - Round 1: each player writes a prompt.
   - Rounds 2–4: each player draws panels 1–3. Each panel can see only the previous item in its chain.
   - Chains rotate so that no player works on the same strip twice in a row, when the player count allows it.
   - The reveal plays each strip panel by panel, on the screen or on every phone in sync. Then everyone votes for a favorite.
   - **Shuffle/remix:** builds new strips from random panels. It's first in the cut order.

3. **Cracked Cookbook**
   - Rounds 1–2: each player draws and names ingredients or scene elements.
   - Round 3: each player gets a meal prompt (Breakfast, Lunch or Dessert, with a twist such as "breakfast for a dragon"). They compose a dish scene with props drawn by other players, placed as movable stickers, plus their own strokes.
   - Everyone votes. The dish creator scores per vote, and each prop artist gets a bonus per vote on any dish that used their prop.

4. **Wiki-what**
   - Team PvE trivia drawn from a curated, bundled pack of 150 or more questions about strange real Wikipedia topics. Each question cites its source article title.
   - Each question is multiple choice. The team answer is the majority vote, and correct answers earn team points.
   - Each round, one secret **Mole** also sees the answer. The Mole scores personal points when the team answers wrong.
   - At the end of the round, the team votes on who the Mole was, and a correct accusation earns a bonus.
   - A live random-article mode, fetching from the Wikipedia REST API in the browser at play time, is optional and in the cut order. The cloud VM can't reach Wikipedia, so author the pack from model knowledge and flag it for the owner to spot-check.

5. **Cave Rave**
   - Single-elimination brackets of rhythm duels. All duels in a bracket round play at the same time, and odd player counts get a bye.
   - Charts are 3 lanes and procedurally generated from a seed. Music is synthesized in the browser with Web Audio (kick, snare, hats, bass), so there are no audio assets.
   - **Low latency by design:** the server sends a start time on the server clock, and each phone estimates its clock offset with NTP-style pings. Each phone plays the chart and judges hits locally. Network latency never affects judging, and the server sanity-checks the scores it receives.
   - In the lobby, a one-time tap-along calibration measures audio output latency. Audio is unlocked by a user tap, which iOS requires.
   - **Sabotage:** eliminated players spend sabotage on any player still in the bracket, on a cooldown. Effects include a lane fog for 2 seconds, mirrored lanes, and a screen wobble.
   - **Drawn beats:** eliminated players paint a beat grid that becomes the next round's chart. This is optional and in the cut order.

## Design direction

- Load and follow `.claude/skills/frontend-design/SKILL.md` before building any UI.
- **Phones first:** portrait, one-handed, with big touch targets. Nothing important sits under the iOS bottom bar.
- **Screen views:** landscape, readable from a couch at about 3 m, with motion on the reveals.
- The site has one strong shared identity, and each game gets its own sub-palette and motif within it.
- Self-host fonts with `@fontsource/*` from npm. Load no third-party font CDN.
- The whole site has to work on mid-range Android over cellular. Watch the bundle size and lazy-load each game's UI.

## Tests (lean, invariant-focused)

- **`tests/contract.test.ts`** is the critical one. For every registered game:
  - the manifest is valid, and the server and client registries have identical id sets;
  - for player counts {min, 8, 20}, on 3 seeds each, bots play to `result()` within a step cap, using a fake clock;
  - nothing throws;
  - every view is JSON-serializable and under a size cap;
  - every action reaching `onAction` passed `actionSchema`.
- **`tests/engine.test.ts`** covers:
  - reconnect with the token keeps the seat and score;
  - the host passes to the next player when the host-player leaves;
  - kick works;
  - return-to-lobby works;
  - the room code alphabet is enforced.
- **Secret leaks:**
  - Forgery: the forger's view never contains the word, and no other player's view names the forger before the reveal.
  - Wiki-what: the Mole's identity and the answer aren't in non-Mole views before the reveal.
- **`npm run smoke`:** starts `wrangler dev` and runs every game end to end over real WebSockets with 6 Node clients and 1 screen. It's a script, not part of `npm test`.
- **CI:** `.github/workflows/ci.yml` runs typecheck, `vitest` and build. Add a `deploy.yml` that only runs on `workflow_dispatch` and needs a `CLOUDFLARE_API_TOKEN` repo secret, which the owner adds.

## Work units (ledger: `plan/LEDGER.md`)

| # | Unit | Agent | Depends on |
|---|---|---|---|
| U0 | Scaffold: package.json, tsconfig, Vite + Preact, wrangler.jsonc (assets + SQLite DO migration), vitest, CI | core-builder | — |
| U1 | Protocol, engine, `_template` game, contract + engine tests (test first) | core-builder | U0 |
| U2 | Worker routes, RoomDO (hibernation, alarms for timers, throttled persistence), smoke script | core-builder | U1 |
| U3 | Design system + client shell (home, join link, lobby with QR, host controls, dev bots, screen/host-player modes, reconnect, wake lock) + `kit/` incl. DrawingCanvas | design-lead | U2 |
| U4 | Review of U1–U3 (protocol safety, reconnect, hibernation, secret projection) and fixes | reviewer | U3 |
| U5–U9 | Forgery, Comic Strip Club, Cracked Cookbook, Wiki-what, Cave Rave, one unit each | game-builder | U4 |
| U10 | Review of games (secrets, contract, phone UX); browser e2e/screenshots if Playwright works | reviewer | U5–U9 |
| U11 | Docs (README play/deploy, DEPLOY.md, ADDING_A_GAME.md), REPORT.md, draft PR | orchestrator | all |

- **Parallel work:** U5–U9 may run in parallel worktrees. Each game owns its own folder. Merge the registry lines by hand.
- **Escalation:** if a Sonnet game-builder fails a unit twice, retry it with Opus. Use Fable only if Opus also fails.
- **If something proves infeasible, cut in this order:**
  1. Cave Rave drawn beats.
  2. Comic shuffle.
  3. Wiki-what live mode.
  4. Cave Rave sabotage variety: keep at least one effect.
  5. Visual polish.

  Never cut the platform, the contract test, or a game's core loop.

## Owner steps after the run (not the session's job)

- Run `npm i && npx wrangler login && npm run deploy`. This gives a free `*.workers.dev` URL. Optionally, add `CLOUDFLARE_API_TOKEN` for the deploy workflow.
- Spot-check the Wiki-what question pack.
- Play-test with real phones on cellular.

## Verification

- **In the cloud run:**
  - `npm run typecheck && npm test` is green, including the contract test across all 5 games plus `_template`;
  - `npm run smoke` completes every game over real WebSockets;
  - screenshots at 390×844 and 1920×1080, if Playwright is available.
- **Owner, after deploy:**
  1. Host on a laptop in Screen mode.
  2. Text the link to 3 phones and join by link and by code.
  3. Play each game.
  4. Lock a phone mid-game and confirm it rejoins in the same seat.
  5. Repeat one game in host-player mode with no screen.
