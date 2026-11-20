# Free Party Games: repo instructions

Free Party Games is a free Jackbox-style party platform. A host opens a room, and friends join from their phones by link or room code. The build plan and its decisions are in [plan/PLAN.md](plan/PLAN.md).

## Principles

- **DRY and abstraction first.** Before writing anything, check whether it already exists. Reuse and extend existing abstractions (`src/core`, `src/client/kit`, the game contract) rather than duplicating logic.
- **Research before acting.** Read the relevant files before writing code when a task touches unfamiliar territory or has non-obvious tradeoffs.
- **Architecture decisions.** Any choice that affects structure, boundaries, naming or how components relate is the owner's to make.
  - In interactive sessions, ask first.
  - In unattended cloud runs, follow `plan/PLAN.md`. Where the plan is silent, choose the most reversible option and log it under "Decisions" in `plan/LEDGER.md`.

## Project rules

- **Free only.** Use no paid service, paid API or paid font or CDN. Hosting is the Cloudflare Workers free plan with SQLite-backed Durable Objects.
- **Game logic.** `src/core` and each game's `logic.ts` must stay pure TypeScript, with no Cloudflare or DOM imports, so they run in Node tests.
- **Adding a game.** A game plugs in only through the `GameDefinition` contract and the two registries. Never special-case a game inside core.
- **The contract test is load-bearing.** `tests/contract.test.ts` holds that contract. Never weaken or skip it to get green.
- **Tests stay lean.** Test invariants that must not change, and tests that speed up development. Add no alerting.
- **Design.** Load `.claude/skills/frontend-design/SKILL.md` before building or reshaping UI. Design for phones first, and make screen views readable from a couch.
- **Original content.** Games are original in name, art, prompts and music. Don't recreate an existing commercial game's name, art or text.
