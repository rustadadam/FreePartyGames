# Adding a game

A game plugs in through one contract, `GameDefinition` in `src/core/game.ts`, and one line in each of two registries. Core never special-cases a game.

## Steps

1. **Copy the template.** `cp -r src/games/_template src/games/my-game`. The template is Tap Duel, a tiny reference game.
2. **Set the manifest** in `logic.ts`: a unique kebab-case `id`, `title`, `tagline`, `minPlayers`, `maxPlayers`, `screen` (`'required' | 'optional' | 'none'`) and `estMinutes`. Leave out `hidden: true` (that flag only lists a game in dev builds).
3. **Write the logic** in `logic.ts`. It stays pure TypeScript: no DOM, no Cloudflare, no `Math.random` or `Date.now` (use `ctx.rng` and `ctx.now()`).
   - `actionSchema`: a strict zod schema for every action a phone can send. Nothing reaches `onAction` without passing it.
   - `setup(ctx, players, settings)` returns the initial state. State must be plain JSON: it is snapshotted when the room hibernates.
   - `onAction(state, ctx, playerId, action)` and `onTimer(state, ctx, key)` mutate the state in place.
   - `onPlayerLeave` / `onPlayerReturn`: the game must never wait on a player who left.
   - `view(state, viewer)` projects the state for one viewer (`{kind:'player', id}` or `{kind:'screen'}`). **Hide every secret here.** Keep views under 64 KB: reference drawings by asset id.
   - `result(state)` returns `null` until the game is over, then `{scores, summary?}`.
   - `bot.act(view, rng, me)` returns a legal action or `null`. Bots let one person test an 8-player game and let the contract test play your game.
4. **Write the UI** in `ui.tsx`, default-exporting `{Player, Screen, Rules}` (see `src/client/gameModule.ts`). Import only *types* from `logic.ts`, so zod and the logic stay out of the browser chunk. Reuse `src/client/kit/` (DrawingCanvas, StrokeView, Timer, Vote, PromptCard, RevealStage, Avatar, PlayerChip, hooks); its props are documented in `docs/DESIGN.md` under **Kit**. Add a `[data-game="my-game"]` sub-palette in `src/client/styles/tokens.css` if you want one.
5. **Register it** with one line in each registry:
   ```ts
   // src/games/registry.server.ts
   import myGame from './my-game/logic';
   [myGame.manifest.id]: myGame,

   // src/games/registry.client.ts
   'my-game': () => import('./my-game/ui').then((m) => m.default),
   ```
6. **Add music (optional).** Drop an MP3 named after the game id into `songs/` (`songs/my-game.mp3`). The TV, or the host's phone when there's no TV, loops it during the game; the lobby plays `songs/lobby.mp3`. A game without a file plays in silence. No code change is needed, and `tests/songs.test.ts` fails if a file's name matches no game.
7. **Test it.** `npm test` runs `tests/contract.test.ts` over every registered game. Add `tests/my-game.test.ts` for your game's own rules, and for any secret use `recordViews()` / `findLeaks()` from `src/core/testkit.ts`.
8. **Play it.** `npm run build && npm run worker`, open `http://localhost:8787`, host a room, and use **Add bots**. `npm run smoke` plays every game end to end over real WebSockets.

## What the contract test enforces

For every registered game, with and without a screen:

- the manifest is valid, and the server and client registries hold the same ids;
- bots finish the game with the minimum, 8 and 20 players (clamped to the manifest), on 3 seeds;
- nothing throws, every view is JSON-serializable and at most 64 KB, and every action passed `actionSchema`;
- at least two different players act;
- with every player idle, the game still ends on its own timers, so give every phase a deadline;
- the game survives a snapshot and restore every few steps, with identical views afterwards;
- stale or out-of-turn actions don't throw, and a player leaving mid-game doesn't stall it.

Don't weaken this test to get green. Fix the game.

## Rules of thumb

- Put deadlines in views as server timestamps; the kit `Timer` counts down with the phone's clock offset.
- Store drawings with `ctx.putAsset(strokes)` and put the returned id in views. Never store a secret as an asset: ids are content hashes, so they can be guessed.
- Use `ctx.broadcastEphemeral` only for live, public, unstored traffic, such as in-progress stroke points. Spectators receive it too.
- Validate any user-supplied keys (player ids, indices) against your own state.
- Games are original: their own names, art, prompts and music.
