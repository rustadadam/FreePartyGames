# Design system

Free Party Games is played on a couch at night: one laptop or TV that everyone looks at, and a
handful of phones held in one hand. The single job of every screen is to get people from
"here's the code" to "we're playing" without anyone asking "wait, what do I tap?".

This file is the token plan. Build from it; don't invent new colors or faces inside a game.
The tokens live in `src/client/styles/tokens.css`; the shared components are in `src/client/kit/`
(see **Kit** below). Screenshots of the shell are in `docs/screenshots/`.

## Subject and signature

**Subject.** The house-party ticket booth: raffle tickets, coat-check stubs, the hole punch,
the hand stamp. Joining a room is "getting your ticket".

**Signature: the admission ticket.** The room code is set huge in the display face on a
raffle-pink ticket with punched half-circle notches and a perforated tear line that separates
the QR "stub". It is tilted a couple of degrees, like a ticket dropped on the table. The same
ticket is the hero on the home page (the code input *is* the ticket), the centrepiece of the
screen lobby, and shrinks to a small stub in the phone header. Players are round "punches":
a filled circle in their seat color with their initial.

Everything else stays quiet so the ticket is what people remember.

## Palette

The 20 player colors (set by the engine, `PLAYER_COLORS`) include white, yellow and grey, so
the shell is dark: every player color has to read on it. The dark is a grape night rather than
neutral black, so the neon-on-black look stays free for Cave Rave.

| Token | Hex | Name | Use |
|---|---|---|---|
| `--night` | `#1A1033` | Grape night | Page background |
| `--velvet` | `#2B1C52` | Velvet | Cards, sheets, inputs |
| `--seam` | `#463575` | Seam | Borders, dividers, perforations (derived) |
| `--chalk` | `#FBF6FF` | Chalk | Body text, icons |
| `--haze` | `#B3A6D9` | Haze | Secondary text, captions |
| `--raffle` | `#FF5E87` | Raffle pink | Brand: the ticket, primary buttons |
| `--marquee` | `#FFD447` | Marquee | Highlights: host crown, winner, focus ring, "your turn" |

Semantic aliases (use these in components, not the raw names): `--bg`, `--surface`,
`--surface-2`, `--line`, `--text`, `--muted`, `--accent`, `--accent-ink` (text on accent),
`--accent-2`, `--highlight`, `--danger`, `--ok`. A game re-skins by overriding `--accent`,
`--accent-ink`, `--accent-2` and `--stage` (see **Games**).

Contrast: chalk on night 16:1, haze on night 7.6:1, night on raffle 6.3:1, night on marquee 12:1.

## Type

| Role | Face | Token | Notes |
|---|---|---|---|
| Display | **Bagel Fat One** 400 | `--font-display` | Fat, rounded, reads from 3 m. Room codes, titles, the big call ("TAP!"), winner names. Never for paragraphs or buttons. |
| Body / UI | **Atkinson Hyperlegible Next** 400, 700 | `--font-body` | Built for low-vision legibility: right for couch distance and small phones. Everything readable. |
| Utility | **Martian Mono** 500 | `--font-mono` | Labels, eyebrows, timers, scores, the ticket serial. Tabular by nature. Uppercase + tracking for eyebrows. |

All three are self-hosted from `@fontsource/*` (latin subset only, imported in `src/client/fonts.ts`), about 60 KB woff2 in total.

Scale (phone / screen). Inside `.view-screen` the same tokens switch to `vh` values, so text
keeps its size relative to the TV, not to its pixel count.

| Step | Phone | Screen | Use |
|---|---|---|---|
| `--t-mega` | 64px | 16vh | Room code, the big call |
| `--t-xl` | 36px | 7vh | Titles, winner |
| `--t-l` | 24px | 4.4vh | Prompts, card titles |
| `--t-m` | 18px | 3vh | Body, buttons |
| `--t-s` | 14px | 2.2vh | Captions, eyebrows (minimum on the screen view) |

Nothing on the screen view is smaller than `--t-s` (about 24px at 1080p): that is the 3 m floor.

## Layout concept

**Phone: "the stub in your hand".** A slim header stub (room code + your punch), content in the
middle, and the one primary action docked at the bottom in thumb reach, padded by
`env(safe-area-inset-bottom)`. Tap targets are at least 56px tall (`--tap`). No hover-only
affordances anywhere.

```
+----------------------+
| [ABCD]      (A) you  |  <- header stub
|                      |
|   prompt / canvas /  |
|   vote / waiting     |
|                      |
| [ Primary action  ]  |  <- action dock (safe-area padded)
+----------------------+
```

**Screen: "the marquee board".** Landscape, 16:9. In the lobby, the ticket takes the left
two-fifths (code, QR stub, link) and the player wall fills the right. In a game, the game owns
the full stage; a thin rail along the bottom keeps the code and link visible so late arrivals
can still join.

```
Lobby                                   In game
+--------------+----------------------+ +-------------------------------------+
|  ~~TICKET~~  |  Who's here (6/20)   | |                                     |
|   A B C D    |  (A)(B)(C)(D)(E)(F)  | |          game stage                 |
|  [QR] stub   |                      | |                                     |
|  site/ABCD   |  Next up: Tap Duel   | +-------------------------------------+
+--------------+----------------------+ | ABCD  join at site/ABCD    controls |
                                        +-------------------------------------+
```

**Motion.** One orchestrated moment: punches pop in (scale with a small overshoot) as people
join, and the same easing drives `RevealStage`. Everything else is a 150 ms fade. Under
`prefers-reduced-motion: reduce` all of it becomes an instant swap.

**Quality floor.** Visible focus (`--marquee` 3px outline, offset 3px) on every interactive
element; safe-area insets on all four sides; `touch-action: manipulation` on controls (no
double-tap zoom); `touch-action: none` only on drawing surfaces.

## Plan review

First pass was near-black with neon pink and cyan: "party at night" done the obvious way,
and it would have flattened Cave Rave, which needs exactly that look. Revised to a grape-night
base with a warm pink and a marquee yellow, and moved the personality into the ticket (shape,
perforation, tilt, display type) instead of into glow effects. The first type pick was a
condensed grotesque display; it lost legibility at 3 m, so the display face became the fat
rounded Bagel Fat One, with Atkinson Hyperlegible for body because legibility at distance is the
actual constraint here.

## Games

Each game sets `data-game="<manifest id>"` on its root (the shell does this for you around
`Player`, `Screen` and `Rules`). The attribute swaps four tokens: `--accent`, `--accent-ink`,
`--accent-2`, `--stage` (the game's tinted surface). Kit components already use these tokens,
so a game is themed by doing nothing. Each game also owns one motif: one recurring shape that
says which game this is. Draw it with CSS or SVG in the game's folder; keep it to one motif.

| Game (id) | `--accent` | `--accent-2` | `--stage` | Motif |
|---|---|---|---|---|
| Forgery (`forgery`) | Gilt `#E9B949` | Seal red `#E5484D` | `#221A33` | The gallery frame: the shared canvas sits in a double gilt frame with a brass name plate. The reveal stamps a red wax seal reading FORGED on the forger's punch. |
| Comic Strip Club (`comic-strip-club`) | Process cyan `#36C5F4` | Process yellow `#FFE14D` | `#1C1A3A` | Halftone dots and thick ink gutters: panels are white paper (`#FFFDF7`) in 3-up strips with 6px ink (`#14101F`) gutters; prompts sit in speech-tail captions. |
| Cracked Cookbook (`cracked-cookbook`) | Yolk `#FFB020` | Basil `#6CCB5F` | `#2A1A2E` | The recipe card and tape: drawings sit on index cards with a torn masking-tape corner; props become die-cut stickers (white 4px outline, soft drop shadow). |
| Wiki-what (`wiki-what`) | Hyperlink `#7AA2FF` | Mole earth `#C58B5A` | `#17183A` | The footnote: answers carry superscript markers `[1] [2] [3]`, sources are cited in `--font-mono` under a hairline, and the Mole is marked with a "citation needed" bracket. |
| Cave Rave (`cave-rave`) | Ultraviolet `#B76CFF` | Glowstick `#3DFFB5` | `#0B0716` | Three glowing lanes under a stalactite zigzag edge. The only game allowed glow (`box-shadow` blooms) and a near-black stage. Sabotage effects (fog, mirror, wobble) are full-lane overlays in `--accent-2`. |
| Second Witness (`second-witness`) | Plate gold `#D8A647` | Verdigris `#63D2BD` | `#261820` | The gold plate: the prompt is a chapter heading engraved on a riveted gold plate, answers are numbered like verses ("3:1", "3:2"), witness counts are small verdigris marks on the plate (an unmatched plate is left tarnished), and a temple silhouette sits faintly behind the prompt. The score multiplier is a gold coin in the header. |
| Tap Duel (`tap-duel`, dev template) | Raffle (default) | Marquee (default) | Velvet | None: it is the plain reference. |

If a game's final id differs from the table, rename the selector in `tokens.css`; don't add a
second one.

## Kit

Everything below is exported from `src/client/kit/index.ts`:

```ts
import { Timer, Vote, PromptCard, DrawingCanvas, StrokeView, PlayerChip, useAssets } from '../../client/kit';
```

Kit styles load once with the shell; a game never imports kit CSS. Preview every component
with sample data at `/dev/kit.html` under `npm run dev` (add `?game=forgery` to see a
sub-palette). `src/games/_template/ui.tsx` is the worked example.

### Rules of the road for game UIs

- **Import only types from `logic.ts`** (`import type { ... }`). A value import drags zod and
  the game logic into the client chunk.
- **Put deadlines in the view** as server-ms timestamps (e.g. `ctx.timerAt('round')`) and hand
  them to `Timer`. Never send "seconds left".
- **Views carry ids, the lobby carries people.** Resolve names and colors with `PlayerChip`
  / `playerOf(lobby, id)`.
- **Theming is automatic.** The shell wraps `Player`, `Screen` and `Rules` in
  `data-game="<id>"`; use `var(--accent)`, `var(--accent-2)`, `var(--stage)`, never hex.
- **Screen sizes.** Inside `Screen` the type tokens (`--t-*`) are already vh-based. For your
  own sizes on the screen use `vh`, and keep text at `--t-s` (2.2vh) or larger.
- **Game CSS** goes in a `ui.css` next to `ui.tsx` (imported from it); it ships in the game's
  lazy chunk. Prefix your classes with a short game prefix (`tap-`, `fg-`, ...).
- **No-screen play.** When `lobby.screenConnected` is false, the `Player` view must also show
  the shared state the TV would have shown.

### Components

**`<Avatar name color size? label? host? away? bot? pop? />`**: a player "punch" (seat-colored
circle with the initial). `size` is a CSS length (default `44px`; use `vh` on the screen).
`host` adds the marquee ring, `away` dims it with a dashed ring, `bot` adds a tag, `label` shows
the name under it, and `pop` animates it in. Helpers: `inkOn(hex)` returns readable text color on
a seat color; `initialOf(name)`.

**`<PlayerChip lobby id trailing? size? you? />`**: inline avatar + name for an id from a
view. `trailing` renders right-aligned (a score). `playerOf(lobby, id)` returns the `LobbyPlayer`.

**`<Timer deadline total? size? urgentAt? onExpire? label? quiet? />`**: a countdown to a
**server-time** deadline using the room's clock offset, so every device agrees. `total` (ms)
draws the ring; `urgentAt` (default 5 s) turns it marquee yellow; `onExpire` fires once
locally (the server stays the authority). `deadline` null hides it. It ticks through the last
5 s and buzzes at zero (see **Sound**); pass `quiet` on countdowns nobody acts against (a reveal,
a results pause), so the room only hears the clock when it matters.

**`<PromptCard eyebrow? secret? hidden? size? tone? footer? quiet?>children</PromptCard>`**: the card
a prompt, category or word sits on (display face, punched corner). `secret` adds a Hide/Show
toggle against shoulder-surfing (`hidden` starts it hidden). `tone="accent"` fills it with the
game accent. `size="l"` for screen prompts. `footer` is a mono footnote line (citations). It flicks
(`card`) when it appears, unless `quiet`.

**`<RulesSheet story how scoring? note? />`**: the body of every game's `Rules`. `story` is one
scene-setting paragraph in the storyteller's voice; `how` is the steps of play, in order; `scoring`
is one line per way to win points; `note` is the small print. The shell supplies the game's title
and tagline above it, so the tagline is the one-line description and the story never repeats it.

**`<Vote options value? onVote? disabled? changeable? layout? label? counts? />`**: pick one.
`options: { id, label, hint?, color?, media?, disabled? }[]`. Pass `value` from the view so the
pick survives reconnects. It locks after a pick unless `changeable`. `layout="grid"` gives two
columns for `media` (drawings). `counts` (`id -> n`) shows tallies after the reveal.

**`<RevealStage items step? startAt? interval? layout? onDone? sound? />`**: step-through reveal
with the shared pop motion. Three drivers:
1. `step` (controlled): the game puts the index in its view; all devices follow.
2. `startAt` (server ms) + `interval` (ms): each device computes the step from the server
   clock, so the screen and phones stay in sync with no extra messages. Use this for reveals.
3. `interval` alone: local auto-advance from mount.

`layout`: `stack` (accumulate), `row` (side by side, comic panels), or `single` (the current item only).
`sound`: the cue per new step (see **Sound**). Default `reveal`, or `count` when steps are under
400 ms apart (a list popping in). Pass a shared name, `(step) => play('mine')` for your own, or
`false`.

**`<DrawingCanvas strokes? onChange? onStroke? onStrokeProgress? aspect? colors? widths? maxStrokes? singleStroke? disabled? underlay? paper? tools? label?>overlay</DrawingCanvas>`**:
vector drawing input.
- Controlled with `strokes` + `onChange(strokes)`, or uncontrolled.
- `onStroke(stroke, all)` fires when a stroke ends.
- `onStrokeProgress(newPoints, strokeSoFar)` fires about every 50 ms while drawing. Send these as
  an action, and have the game rebroadcast them with `ctx.broadcastEphemeral`, for live strokes.
- `singleStroke`: one continuous stroke, then the canvas locks with no undo (Forgery).
  `maxStrokes` caps the count.
- `colors`: the ink set. One color hides the palette (pass the seat color).
- `widths`: brush sizes in virtual units (default `[6, 14, 32]`).
- `underlay`: read-only strokes drawn beneath, for other players' strokes, live or finished.
- `paper`: background (default `#fffdf7`; use `var(--stage)` for a dark canvas, since seat colors
  are designed to read on dark).
- Children render as an overlay with `pointer-events: none` by default. That's where Cracked
  Cookbook's stickers go.
- Points are thinned, and input stops at the format caps.
Exports `DEFAULT_COLORS` and `DEFAULT_WIDTHS`.

**`<StrokeView drawing? strokes? aspect? paper? animate? label? />`**: read-only SVG renderer
(crisp on a TV). Give it a stored `Drawing` (from `useAsset`) or bare `strokes`. `animate`
(`true` = 1.2 s, or total ms) draws the strokes on in order, which is good for reveals.
`paper="transparent"` for stickers.

**`<QR value size? ecc? fg? bg? label? />`**: QR code as SVG from the in-house encoder
(`kit/qrEncode.ts`: byte mode, v1-10, verified against a decoder). No external service.

### Hooks

| Hook | Returns |
|---|---|
| `useServerClock()` | The room's `ServerClock`: `now()` (server ms), `toLocal(serverMs)` (schedule audio and animations on this device), `offset`, `rtt`, `synced`, `subscribe(fn)`. NTP-style: a burst of 5 pings on join, then one every 15 s; the lowest-rtt sample of the last 8 wins. Outside a room it falls back to local time. Cave Rave: schedule notes at `clock.toLocal(view.startAt)`. |
| `useServerNow(everyMs = 250)` | Server ms, re-rendering on an interval (0 = no ticking). |
| `useAssets(ids)` | The page-wide asset map. Missing ids are requested once (batched, shared across games and rooms, since ids are content hashes) and appear when they arrive. The `assets` prop that `Player` and `Screen` receive is the same map. |
| `useAsset<T>(id)` | One asset, or `undefined` while loading. |
| `useEphemeral(handler)` | Subscribes to `ephemeral` messages (live, unstored traffic) while mounted. |

### Sound

Sound works the way a game show's does: short, punchy, cartoony cues that mark a *moment*
(someone joined, time is up, the forger is caught), never a constant bed of noise. Every effect
is synthesized at play time with Web Audio (oscillators, filtered noise, envelopes): no audio
files, no samples, nothing to download. Repeats get a little random pitch so they don't grate.

**One device plays.** The TV plays the room's music and effects, or the host's phone when no TV
is connected. Every other phone stays silent: `sfx.play` there does nothing, so call it freely
from `Player` and `Screen`. Audio starts after the first tap anywhere (browser rule). A TV that
rejoins mid-game in Safari stays silent until someone taps it.

**Menu.** One gear on every device (`RoomMenu`, `src/client/app/RoomMenu.tsx`, icon from
`lucide-preact`) opens one panel, top to bottom: **Game settings** (the host, between games, when
the selected game declares `settingsFields`: a stepper per field), **Sound** (the **Music** and
**Sound effects** switches, only on the audio device) and the device's room actions (phone: share,
skip ahead, end game, leave room; TV: skip ahead and end game, for the host). The gear sits in the
phone header, top-right of the TV lobby, and at the end of the TV's footer rail in a game, where the
panel opens upward. Both sound switches are on by default and saved on that device (`fpg:music`,
`fpg:sfx`), so choices made in the lobby carry into games. Game settings live in the room, not on
the device: see **Game settings** in `docs/ADDING_A_GAME.md`.

**Ducking.** Music and effects share one `AudioContext` (`src/client/audio/engine.ts`). A big
stinger (`start`, `fanfare`, a game's verdict sting) drops the music to 30% for the length of the
sting, then brings it back over half a second.

**Shared cues** (`sfx.play(name)`; the shell and kit already fire the ones marked *auto*):

| Name | Fires | Sound |
|---|---|---|
| `join` | *auto*: a player joins | Bubble pop, pitched by seat so a wave of joins plays a tune |
| `leave` | *auto*: a player leaves | Soft falling blip |
| `pick` | *auto*: the host picks a game | Two-step click, up |
| `start` | *auto*: a game starts | Rising whoosh into a major stab (ducks) |
| `fanfare` | *auto*: results | Three-note run into a held chord (ducks) |
| `back` | *auto*: back to the lobby | Two-note settle, down |
| `tick` / `timeUp` | *auto*: `Timer`, last 5 s / zero | Woodblock tick, climbing / cartoon buzzer |
| `reveal` | *auto*: each `RevealStage` step | Whoosh into a low thump |
| `count` | *auto*: fast `RevealStage` staggers | Coin tick climbing the scale |
| `card` | *auto*: a `PromptCard` appears | Papery flick |
| `lockIn` | `useSfxCount(n)` | Soft glassy tick: someone answered, voted, locked in |
| `score` | points land | Three quick rising dings |

**API** (all from the kit):

```ts
import { sfx, defineSfx, useSfxCount, useSfxCue, useSfxHold } from '../../client/kit';

useSfxCount(view.voted.length);                     // lockIn tick, climbing, each time it goes up
useSfxCue(view.phase, (p) => p === 'tally' && play('rimshot')); // on change, never on mount
useSfxHold(view.phase === 'play');                  // silence effects while true (Cave Rave songs)
sfx.play('score', { delay: 1700 });                 // options: pitch (semitones), delay (ms), vol, n
```

Derive cues from the view on the client (a count that went up, a phase that changed). Game logic
never knows about sound. Call the hooks at the top of both `Player` and `Screen`, so the cue
plays whichever one the audio device is showing.

**A game's own cues.** Put them in the game's folder (`src/games/<id>/sfx.ts`), so the synth
code ships in the game's chunk:

```ts
import { defineSfx } from '../../client/kit';
export const play = defineSfx({
  caught: { duck: 1.2, vary: 0, play(v) { v.tone({ f: 660, to: 990, dur: 0.3, type: 'triangle' }); } },
});
// play('caught') is typed: a misspelt name doesn't compile.
```

A recipe's `play(v)` calls `v.tone({ f, to?, type?, at?, dur, vol?, attack?, lp?, wobble? })`
and `v.noise({ at?, dur, vol?, filter?, freq?, to?, q? })`; `v.n` is the `n` option (a count).
Recipe options: `duck` (seconds), `vary` (random ± semitones, default 0.4), `gap` (skip a repeat
within this many ms, default 60). Keep effects under a second and quieter than you think: they
sit just under the music. Audition everything on `/dev/kit.html` (Sounds).

| Game | Signature cues |
|---|---|
| Forgery | `busted` (gallery alarm when the vote lands), `stamp` (the FORGED seal), `caught` / `escaped` (last reveal step) |
| Comic Strip Club | `flip` (each panel in the reveal), `rimshot` (the tally) |
| Cracked Cookbook | `serve` (service bell: a dish submitted, each dish revealed), `sticker` (a prop placed) |
| Wiki-what | `right` / `wrong` (the answer), `mole` (the Mole unmasked) |
| Second Witness | `error` (a word nobody matched), `witness` (a chime with one note per witness) |
| Cave Rave | `advance` (the bracket moves on), `sabotage` (TV only, during the song) |

Cave Rave's phones make the music, so every effect is held during the song; only the TV's
soft-attack `sabotage` cue plays through (`{ through: true }`), shaped so it never reads as a beat.

### Stroke format (`src/shared/strokes.ts`, `src/shared/strokeSchema.ts`)

```ts
interface Stroke { c: '#rrggbb'; w: number /* 2..80 units */; p: number[] /* flat [x0,y0,x1,y1,...] ints */ }
interface Drawing { v: 1; aspect: number /* w/h */; strokes: Stroke[] }
```

- The virtual box is `STROKE_UNITS` (1000) wide and `1000 / aspect` tall.
- Caps: `MAX_STROKE_POINTS` (1000 per stroke), `MAX_STROKES` (300), `MAX_DRAWING_POINTS`
  (5000). The largest drawing fits in one 64 KB message (`tests/strokes.test.ts`).
- `strokes.ts` is zod-free: types, caps, `makeDrawing`, `countPoints`, `strokeBounds`.
  Everything is re-exported from the kit.
- Game logic validates with `StrokeSchema`, `StrokesSchema` or `DrawingSchema` from
  `strokeSchema.ts` inside its `actionSchema`, then calls `ctx.putAsset(drawing)` and puts the id
  in views.

### Layout helpers (CSS classes)

| Class | Use |
|---|---|
| `g-stack` | Vertical stack with `--s4` gaps |
| `g-center` | Centred column that fills the stage (screen calls) |
| `g-row` / `g-spread` | Wrapping row / space-between row |
| `g-call` | The big display call in the accent (`--t-mega`) |
| `g-title` | Display title (`--t-xl`) |
| `g-muted` | Secondary text |
| `g-panel` | Card on the game's `--stage` color |
| `g-list` | Unstyled list of surface rows |
| `g-hit` | The giant full-width phone button (pressed state included) |
| `eyebrow` | Mono uppercase label |
| `btn`, `btn-primary`, `btn-ghost`, `btn-danger`, `btn-block`, `btn-s` | Buttons (56px tall; `btn-s` is 44px) |
| `input`, `field` | Text inputs |

