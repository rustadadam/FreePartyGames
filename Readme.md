# Free Party Games

You should be here to have fun.

Otherwise, you may be disappointed.

Because we got a whole shipment of fun delivered to your door step.

## Welcome to Adam's Free Party Games.

This repo has all of the public source code for you to build your own games to play with your friends.

## Play

1. Open the site on a laptop or TV and tap **Use this screen as the TV**, or tap **Host from my phone** if there's no shared screen.
2. Friends scan the QR code, tap the texted link, or type the 4-letter room code on the home page.
3. The host picks a game and starts it. Everyone plays on their phones: up to 20 players (Cave Rave needs 2, the others 3).

Phones keep their seat if they lock or drop off: reopen the link and you're back in the same seat with the same score.

### The games

- **Forgery**: everyone but the forger knows the secret word. Take turns adding one stroke each to a shared drawing, then vote out the forger.
- **Comic Strip Club**: write a premise, then pass the strip along as everyone draws one panel, seeing only the panel before. Then read the strips and vote for a favorite.
- **Cracked Cookbook**: draw ingredients, then cook up a dish for a strange guest out of everyone's drawings.
- **Wiki-what**: team trivia about strange real Wikipedia topics, with a secret Mole steering you wrong.
- **Cave Rave**: three-lane rhythm duels in a knockout bracket. Knocked-out players get to sabotage the survivors.

## Run it yourself

It runs for free on Cloudflare Workers. See [docs/DEPLOY.md](docs/DEPLOY.md).

```sh
npm i
npm run build && npm run worker   # local server at http://localhost:8787, with dev bots
npm test                          # typecheck with `npm run typecheck`
```

## Make a game

Copy `src/games/_template`, add one line to each registry, and the contract test tells you when it's ready. See [docs/ADDING_A_GAME.md](docs/ADDING_A_GAME.md) and the design system in [docs/DESIGN.md](docs/DESIGN.md).
