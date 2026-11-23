# Adding a game

A game plugs in through one contract, `GameDefinition` in `src/core/game.ts`, and one line in each of two registries. Core never special-cases a game.

## Steps

1. **Copy the template.** `cp -r src/games/_template src/games/my-game`. The template is Tap Duel, a tiny reference game.
2. **Set the manifest** in `logic.ts`: a unique kebab-case `id`, `title`, `tagline`, `minPlayers`, `maxPlayers`, `screen` (`'required' | 'optional' | 'none'`) and `estMinutes`. Leave out `hidden: true` (that flag only lists a game in dev builds). `maxPlayers` is your game's own cap (at most 30, the room size): `setup` never gets more players than that, and players over it spectate your game and get no view.
3. **Write the logic** in `logic.ts`. It stays pure TypeScript: no DOM, no Cloudflare, no `Math.random` or `Date.now` (use `ctx.rng` and `ctx.now()`).
   - `actionSchema`: a strict zod schema for every action a phone can send. Nothing reaches `onAction` without passing it.
   - `setup(ctx, players, settings)` returns the initial state. State must be plain JSON: it is snapshotted when the room hibernates.
   - `defaultSettings` and `settingsFields`: what the host may change in the lobby (see **Game settings** below).
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
6. **Add music (optional).** Drop an MP3 named after the game id into `songs/` (`songs/my-game.mp3`). The TV, or the host's phone when there's no TV, loops it during the game; the lobby plays `songs/lobby.mp3`. A game without a file plays in silence. No code change is needed, and `tests/songs.test.ts` fails if a file's name matches no game. Kit components already make sound (timer ticks, reveal whooshes, card flicks); add a few signature cues from your game's own `sfx.ts` with `defineSfx` (see **Sound** in `docs/DESIGN.md`).
7. **Test it.** `npm test` runs `tests/contract.test.ts` over every registered game. Add `tests/my-game.test.ts` for your game's own rules, and for any secret use `recordViews()` / `findLeaks()` from `src/core/testkit.ts`.
8. **Play it.** `npm run build && npm run worker`, open `http://localhost:8787`, host a room, and use **Add bots**. `npm run smoke` plays every game end to end over real WebSockets.

## Game settings

Anything the host might want to tune (rounds, seconds per phase) is a setting. A game declares them; the shell renders them. A game never ships settings UI.

1. **Declare the fields** next to `defaultSettings` in `logic.ts`. Every field is a number the host steps up and down:
   ```ts
   export interface MySettings { rounds: number; answerSeconds: number }

   const settingsFields: SettingField[] = [
     { key: 'rounds', label: 'Rounds', hint: 'One Mole per round', min: 1, max: 5, step: 1 },
     { key: 'answerSeconds', label: 'Answer time', hint: 'Per question', min: 10, max: 60, step: 5, unit: 's' },
   ];

   export default defineGame<MyState, MyAction, MySettings>({
     defaultSettings: { rounds: 3, answerSeconds: 25 },
     settingsFields,
     // ...
   });
   ```
   `SettingField` is in `src/shared/types.ts`: `key` (a key of `defaultSettings`), `label`, optional `hint` and `unit`, and `min`, `max`, `step`. Every default must sit inside its range and on its step (`min + n * step`). Leave `settingsFields` out for a game with nothing to tune.
2. **Read them in `setup(ctx, players, settings)`** and copy what you need into the state. The room passes `defaultSettings` overlaid with the host's picks, already clamped to the fields, so you never validate against the manifest yourself. Name time settings in seconds and multiply by 1000 once, in `setup`. Keep the old `*_MS` constant as the default (`defaultSettings: { answerSeconds: ASK_MS / 1000 }`).
3. **Put anything the UI needs in the view.** The UI cannot see settings. If a phase length is now a setting, expose it (`askMs: s.askMs`) and give it to `Timer` as `total`. Never hard-code the old constant in `ui.tsx`.
4. **Nothing else.** Core sends the fields and current values to the lobby, validates and clamps the host's `setSetting` command, remembers each game's picks for the life of the room (they survive hibernation and the next game), and refuses changes while a game is running. The menu's **Game settings** section shows them to the host in the lobby and on the results screen.

Keep to a few settings per game: the ones a group would plausibly change (length of the game, time pressure). Not every game needs them.

## Drafts (autosave)

A half-typed word or half-finished drawing must not be lost when the timer runs out (principle 7 in `docs/DESIGN.md`). The engine re-projects every viewer's view on every action, so drafts are sent rarely and stay out of every view.

**UI.** Call the kit hook next to the input; it sends only when the page is hidden and about 1.5 s before the deadline, and skips empty or unchanged values and anything after the real submit:

```ts
const [text, setText] = useState('');
useDraft(text, (t) => send({ type: 'draft', text: t }), { deadline: view.deadline, enabled: !view.submitted });
```

**Logic.** The action is named `draft`; its fields are the game's own (`text`, `strokes`, ...).

- **Same limits as the real submit.** Put `draft` in `actionSchema` and validate it with the same zod schema (max length, stroke caps) as the submit action. A draft is never a way around a limit.
- **Never counts as done.** A draft does not lock the player in, does not change "who has answered" counts, and does not end a phase early. It fires no `lockIn` cue.
- **Never in a view.** Store drafts in the state (e.g. `drafts: Record<playerId, Draft>`) and keep them out of every `view()`. The one allowed exception is the author's own view, to restore an input after a reload.
- **On timeout, submit it.** When the phase ends on its timer (`onTimer`), run the normal submit path for every player who has a draft and no submission, then continue as usual. Ending early because everyone submitted needs no drafts. Skip a draft that fails the submit's own validation.
- **Ignored when stale.** A draft that arrives after the player submitted, or in another phase, is ignored without error (like any stale action). Clear `drafts` when a phase begins.
- **Latest wins.** Each draft replaces the player's previous one.

The contract test's idle-player run never sends drafts; cover the timeout path in your game's own test (a draft, then `onTimer`, then check the submission exists and no view carried the draft). No shared helper is provided: the submit path differs per game, so the loop is two lines in each.

## What the contract test enforces

For every registered game, with and without a screen:

- the manifest is valid, and the server and client registries hold the same ids;
- bots finish the game with the minimum, 8, 20 and its own `maxPlayers` (clamped to the manifest), on 3 seeds, and once more with 30 players in the room (the engine seats only your `maxPlayers`; the rest spectate and get no view);
- nothing throws, every view is JSON-serializable and at most 64 KB, and every action passed `actionSchema`;
- at least two different players act;
- with every player idle, the game still ends on its own timers, so give every phase a deadline;
- the game survives a snapshot and restore every few steps, with identical views afterwards;
- stale or out-of-turn actions don't throw, and a player leaving mid-game doesn't stall it;
- every settings field names a key of `defaultSettings`, every default fits its field, and the game still finishes with every setting at its minimum and at its maximum.

Don't weaken this test to get green. Fix the game.

## Rules of thumb

- Put deadlines in views as server timestamps; the kit `Timer` counts down with the phone's clock offset.
- Store drawings with `ctx.putAsset(strokes)` and put the returned id in views. Never store a secret as an asset: ids are content hashes, so they can be guessed.
- Use `ctx.broadcastEphemeral` only for live, public, unstored traffic, such as in-progress stroke points. Spectators receive it too.
- Validate any user-supplied keys (player ids, indices) against your own state.
- Games are original: their own names, art, prompts and music.
