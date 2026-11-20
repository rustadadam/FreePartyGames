// Results: the winner stamped big, then the ranking with this game's points and the room total.
import type { Lobby } from '../../shared/types';
import { Avatar } from '../kit/Avatar';
import { playerOf } from '../kit/PlayerChip';

export function Results({ lobby, meId, avatarSize }: { lobby: Lobby; meId?: string; avatarSize: string }) {
  const r = lobby.lastResult;
  if (!r) return null;
  const title = lobby.games.find((g) => g.id === r.gameId)?.title ?? 'Game';
  const top = r.ranking.length ? r.scores[r.ranking[0]] : 0;
  const winners = r.ranking.filter((id) => r.scores[id] === top && top > 0);
  // Standard competition ranking: ties share a place.
  let place = 0;
  let prev: number | null = null;
  const rows = r.ranking.map((id, i) => {
    if (r.scores[id] !== prev) place = i + 1;
    prev = r.scores[id];
    return { id, place, p: playerOf(lobby, id) };
  });

  return (
    <section class="results" data-game={r.gameId} aria-labelledby="results-title">
      <span class="eyebrow">{title} · final</span>
      <h1 id="results-title" class="results-winner">
        {winners.length === 0
          ? 'Nobody scored'
          : winners.length === 1
            ? `${playerOf(lobby, winners[0])?.name ?? 'Someone'} wins`
            : `${winners.length}-way tie`}
      </h1>
      {r.summary && <p class="results-summary">{r.summary}</p>}
      <ol class="results-list">
        {rows.map(({ id, place, p }) => (
          <li key={id} class={`results-row${id === meId ? ' is-me' : ''}${place === 1 && top > 0 ? ' is-first' : ''}`}>
            <span class="results-place">{place}</span>
            <Avatar name={p?.name ?? '?'} color={p?.color ?? '#9aa5b1'} size={avatarSize} />
            <span class="results-name">
              {p?.name ?? 'Left the room'}
              {id === meId && <span class="results-you"> (you)</span>}
            </span>
            <span class="results-pts">
              +{r.scores[id] ?? 0}
              <span class="results-total">{p ? `${p.score} total` : ''}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
