// Results: the podium (top three score levels rise 3rd, 2nd, 1st), then the ranking with this
// game's points and the room total. One shared page for every game; a game never builds its own.
//
// Ranking is "dense": players with the same score share a place, and the next score is the next
// place (1, 1, 2). A podium step is one place, so a tie stacks its players on the same step and
// there is never an empty step. Places with no points never get a step.
import { useEffect } from 'preact/hooks';
import type { Lobby, LobbyPlayer } from '../../shared/types';
import { sfx } from '../audio/sfx';
import { Avatar } from '../kit/Avatar';
import { playerOf } from '../kit/PlayerChip';

type Kind = 'phone' | 'screen';

interface Row {
  id: string;
  place: number;
  pts: number;
  p: LobbyPlayer | undefined;
}

const ORDINAL = ['', '1st', '2nd', '3rd'];
/** Podium start, gap between steps, and the extra beat before 1st (ms). Matches the CSS delays. */
const START_MS = 1000;
const GAP_MS = 800;
const LAST_BEAT_MS = 400;
/** Avatars shown on one step before "+n". */
const STEP_CAP = { phone: 4, screen: 6 };

const sizes = {
  phone: { list: '40px', solo: '52px', tied: '34px' },
  screen: { list: '3.8vh', solo: '11vh', tied: '7vh' },
};

function rise(count: number, i: number): number {
  return START_MS + i * GAP_MS + (i === count - 1 && count > 1 ? LAST_BEAT_MS : 0);
}

export function Results({ lobby, meId, kind }: { lobby: Lobby; meId?: string; kind: Kind }) {
  const r = lobby.lastResult;
  const rows: Row[] = [];
  if (r) {
    let place = 0;
    let prev: number | null = null;
    for (const id of r.ranking) {
      const pts = r.scores[id] ?? 0;
      if (pts !== prev) place++;
      prev = pts;
      rows.push({ id, place, pts, p: playerOf(lobby, id) });
    }
  }
  const scored = rows.length > 0 && rows[0].pts > 0;
  const winners = scored ? rows.filter((x) => x.place === 1) : [];
  // Steps in rising order: 3rd, 2nd, 1st (only the places that exist and have points).
  const steps = [3, 2, 1]
    .map((place) => ({ place, members: rows.filter((x) => x.place === place && x.pts > 0) }))
    .filter((s) => s.members.length > 0);
  const stepKey = steps.map((s) => `${s.place}:${s.members.length}`).join(',');
  const gameId = r?.gameId;

  // The sounds follow the same schedule as the CSS rise. Only the room's audio device plays.
  // Reduced motion skips the build-up (the fanfare on entering results still plays).
  useEffect(() => {
    if (!steps.length || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timers = steps.map((_, i) =>
      setTimeout(() => {
        sfx.play('reveal', { pitch: i * 2 });
        if (i === steps.length - 1) sfx.play('score', { delay: 180 });
      }, rise(steps.length, i)),
    );
    return () => timers.forEach(clearTimeout);
  }, [gameId, stepKey]);

  if (!r) return null;
  const title = lobby.games.find((g) => g.id === r.gameId)?.title ?? 'Game';
  const finalDelay = steps.length ? rise(steps.length, steps.length - 1) + 450 : 0;
  const late = { '--late': `${finalDelay}ms` } as Record<string, string>;
  const podiumIds = new Set(steps.flatMap((s) => s.members.map((m) => m.id)));
  // The TV shows the podium, then only the players who are not on it (the phones list everyone).
  const list = kind === 'screen' ? rows.filter((x) => !podiumIds.has(x.id)) : rows;
  const nameOf = (x: Row) => x.p?.name ?? 'Left the room';

  const headline =
    winners.length === 0
      ? 'Nobody scored'
      : winners.length === 1
        ? `${nameOf(winners[0])} wins`
        : winners.length === 2
          ? `${nameOf(winners[0])} and ${nameOf(winners[1])} tie`
          : `${winners.length}-way tie`;

  return (
    <section class={`results results-${kind}${steps.length ? ' has-podium' : ''}`} data-game={r.gameId} aria-labelledby="results-title">
      <header class="results-head">
        <span class="eyebrow">{title} · final</span>
        <h1 id="results-title" class="results-winner results-late" style={late}>
          {headline}
        </h1>
        {r.summary && (
          <p class="results-summary results-late" style={late}>
            {r.summary}
          </p>
        )}
      </header>

      {steps.length > 0 && (
        <ol class="podium" aria-label="Podium">
          {[...steps].reverse().map((s, k) => {
            const solo = s.members.length === 1;
            const cap = STEP_CAP[kind];
            const shown = s.members.slice(0, s.members.length > cap ? cap - 1 : cap);
            const more = s.members.length - shown.length;
            const names = s.members.map(nameOf);
            const av = solo ? sizes[kind].solo : sizes[kind].tied;
            return (
              <li
                key={s.place}
                class={`podium-step place-${s.place}`}
                style={{ '--rise': `${rise(steps.length, steps.length - 1 - k)}ms` } as Record<string, string>}
                aria-label={`${ORDINAL[s.place]} place: ${names.join(', ')}, ${s.members[0].pts} points`}
              >
                <div class="podium-who">
                  <span class="podium-faces">
                    {shown.map((m) => (
                      <Avatar key={m.id} name={nameOf(m)} color={m.p?.color ?? '#9aa5b1'} size={av} />
                    ))}
                    {more > 0 && <span class="podium-more">+{more}</span>}
                  </span>
                  <span class="podium-name">
                    {solo ? names[0] : shown.map(nameOf).join(', ')}
                    {solo && s.members[0].id === meId && <span class="results-you"> (you)</span>}
                  </span>
                  <span class="podium-pts">+{s.members[0].pts}</span>
                </div>
                <div class="podium-block" aria-hidden="true">
                  <span class="podium-n">{s.place}</span>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {list.length > 0 && (
        <ol class={`results-list results-late${kind === 'screen' ? ` results-cols-${columnsFor(list.length)}` : ''}`}
          style={{ ...late, '--cols': String(columnsFor(list.length)) } as Record<string, string>}>
          {list.map((x) => (
            <li key={x.id} class={`results-row${x.id === meId ? ' is-me' : ''}${scored && x.place === 1 ? ' is-first' : ''}`}>
              <span class="results-place">{scored ? x.place : '–'}</span>
              <Avatar name={nameOf(x)} color={x.p?.color ?? '#9aa5b1'} size={sizes[kind].list} />
              <span class="results-name">
                {nameOf(x)}
                {x.id === meId && <span class="results-you"> (you)</span>}
              </span>
              <span class="results-pts">
                +{x.pts}
                <span class="results-total">{x.p ? `${x.p.score} total` : ''}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** TV list columns: one column up to 3 rows, then more so 30 players still fit without scrolling. */
function columnsFor(n: number): number {
  return n <= 3 ? 1 : n <= 12 ? 2 : n <= 18 ? 3 : 4;
}
