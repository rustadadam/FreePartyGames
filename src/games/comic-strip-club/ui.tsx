// Comic Strip Club UI. Phone: write a premise, draw a panel, watch, vote. Screen: big 3-up strips.
// With no screen connected the phones play the reveal themselves (single panel at a time).
import { useRef, useState } from 'preact/hooks';
import {
  DrawingCanvas,
  PlayerChip,
  RevealStage,
  RulesSheet,
  StrokeView,
  Timer,
  Vote,
  playerOf,
  sfx,
  useAssets,
  useServerNow,
  useSfxCount,
  useSfxCue,
  type Drawing,
  type Stroke,
} from '../../client/kit';
import type { ClientGameModule, PlayerProps, ScreenProps, AssetMap } from '../../client/gameModule';
import type { Lobby } from '../../shared/types';
import type { CscAction, CscView, Panel, Remix, StripView } from './logic';
import { MAX_PROMPT_CHARS, PANEL_ASPECT, PANELS } from './constants';
import { PREMISES } from './content';
import { play } from './sfx';
import './ui.css';

const INKS = ['#14101f', '#e5484d', '#ff8a1f', '#f2c200', '#3fbf6f', '#1d8fe0', '#7a5cff', '#8b5a2b'];

// ---------- shared bits ----------

/** Sound (room audio device only): a tick per premise, panel and vote in; a rimshot for the tally. */
function useComicCues(view: CscView) {
  useSfxCount(view.done.length);
  useSfxCount(view.voted.length);
  useSfxCue(view.phase, (p) => p === 'tally' && play('rimshot'));
}

const flip = () => play('flip');

function assetIds(view: CscView): string[] {
  const ids: string[] = [];
  const add = (p: Panel) => p.asset && ids.push(p.asset);
  view.strips?.forEach((s) => s.panels.forEach(add));
  view.remix?.forEach((r) => r.panels.forEach(add));
  if (view.you?.source?.kind === 'panel' && view.you.source.asset) ids.push(view.you.source.asset);
  return ids;
}

function PanelBox({ asset, assets, label, animate }: { asset: string | null; assets: AssetMap; label?: string; animate?: boolean }) {
  if (asset === null) return <div class="cs-panel cs-blank">Blank panel</div>;
  const drawing = assets[asset] as Drawing | undefined;
  return (
    <div class="cs-panel">
      {drawing ? <StrokeView drawing={drawing} aspect={PANEL_ASPECT} animate={animate ? 900 : undefined} label={label ?? 'Comic panel'} /> : <div class="cs-ghost" />}
    </div>
  );
}

function Caption({ children, auto }: { children: string; auto?: boolean }) {
  return (
    <p class="cs-caption">
      {children}
      {auto && <span class="cs-auto"> (random premise)</span>}
    </p>
  );
}

function ArtistRow({ panels, lobby }: { panels: Panel[]; lobby: Lobby }) {
  return (
    <p class="cs-credits">
      {panels.map((p, i) => (
        <span key={i}>
          {playerOf(lobby, p.by)?.name ?? 'Someone'}
          {p.asset === null ? ' (blank)' : ''}
          {i < panels.length - 1 ? ' · ' : ''}
        </span>
      ))}
    </p>
  );
}

/** A finished strip, all panels shown (vote options, tally). */
function Strip({ strip, assets, lobby }: { strip: StripView | Remix; assets: AssetMap; lobby: Lobby }) {
  const caption = 'prompt' in strip ? strip.prompt : strip.title;
  return (
    <figure class="cs-strip">
      <Caption auto={'auto' in strip && strip.auto}>{caption}</Caption>
      <div class="cs-row">
        {strip.panels.map((p, i) => (
          <PanelBox key={i} asset={p.asset} assets={assets} />
        ))}
      </div>
      <ArtistRow panels={strip.panels} lobby={lobby} />
    </figure>
  );
}

/** Which strip of a server-clock timeline is on right now. */
function useStripClock(startAt: number, stripMs: number, count: number) {
  const now = useServerNow(200);
  const t = now - startAt;
  if (t < 0) return { idx: -1, start: startAt, wait: -t };
  const idx = Math.min(count - 1, Math.floor(t / stripMs));
  return { idx, start: startAt + idx * stripMs, wait: 0 };
}

function Standings({ view, lobby, me, size }: { view: CscView; lobby: Lobby; me?: string; size?: string }) {
  const ids = [...view.players].sort((a, b) => (view.scores?.[b] ?? 0) - (view.scores?.[a] ?? 0));
  return (
    <ul class="g-list cs-standings">
      {ids.map((id) => (
        <li key={id}>
          <PlayerChip lobby={lobby} id={id} you={id === me} size={size} trailing={`+${view.scores?.[id] ?? 0}`} />
        </li>
      ))}
    </ul>
  );
}

function Progress({ view, lobby }: { view: CscView; lobby: Lobby }) {
  const waiting = view.players.filter((p) => !view.done.includes(p) && !view.gone.includes(p));
  return (
    <div class="cs-progress">
      <p class="eyebrow">
        {view.players.length - waiting.length - view.gone.length} of {view.players.length - view.gone.length} done
      </p>
      <div class="g-row cs-waiting">
        {waiting.map((id) => (
          <PlayerChip key={id} lobby={lobby} id={id} />
        ))}
      </div>
    </div>
  );
}

// ---------- reveal ----------

/** One strip being revealed: caption first, then a panel every stepMs. */
function RevealPhone({ view, assets, lobby }: { view: CscView; assets: AssetMap; lobby: Lobby }) {
  const strips = view.strips!;
  const r = view.reveal!;
  const { idx, start } = useStripClock(r.startAt, r.stripMs, strips.length);
  useSfxCue(idx, () => sfx.play('card'));
  if (idx < 0) return <p class="g-call cs-call">Strips start soon…</p>;
  const strip = strips[idx];
  return (
    <section class="g-stack">
      <p class="eyebrow">
        Strip {idx + 1} of {strips.length}
      </p>
      <RevealStage
        key={idx}
        layout="single"
        startAt={start}
        interval={r.stepMs}
        sound={(i) => i > 0 && flip()}
        items={[
          <Caption key="c" auto={strip.auto}>
            {strip.prompt}
          </Caption>,
          ...strip.panels.map((p, i) => <PanelBox key={i} asset={p.asset} assets={assets} animate />),
        ]}
      />
    </section>
  );
}

function RevealScreen({ view, assets, lobby }: { view: CscView; assets: AssetMap; lobby: Lobby }) {
  const strips = view.strips!;
  const r = view.reveal!;
  const { idx, start } = useStripClock(r.startAt, r.stripMs, strips.length);
  useSfxCue(idx, () => sfx.play('card'));
  if (idx < 0) return <div class="g-center"><p class="g-call cs-call">Strips start soon…</p></div>;
  const strip = strips[idx];
  return (
    <section class="cs-stage">
      <p class="eyebrow">
        Strip {idx + 1} of {strips.length}
      </p>
      <Caption auto={strip.auto}>{strip.prompt}</Caption>
      <div class="cs-board" key={idx}>
        <div class="cs-ghosts" aria-hidden="true">
          <span /> <span /> <span />
        </div>
        <RevealStage
          class="cs-overlay"
          layout="row"
          startAt={start + r.stepMs}
          interval={r.stepMs}
          sound={flip}
          items={strip.panels.map((p, i) => (
            <div key={i} class="cs-pane">
              <PanelBox asset={p.asset} assets={assets} animate />
              <span class="cs-by">{playerOf(lobby, p.by)?.name}</span>
            </div>
          ))}
        />
      </div>
    </section>
  );
}

function RemixView({ view, assets, lobby, screen }: { view: CscView; assets: AssetMap; lobby: Lobby; screen: boolean }) {
  const remix = view.remix ?? [];
  const { idx, start } = useStripClock(view.remixAt ?? 0, view.remixStripMs, remix.length || 1);
  if (!remix.length) return null;
  if (idx < 0) return <div class="g-center"><p class="g-call cs-call">Bonus round: remixed strips</p></div>;
  const strip = remix[idx];
  const step = view.stepMs;
  return (
    <section class={screen ? 'cs-stage' : 'g-stack'}>
      <p class="eyebrow">
        Bonus remix {idx + 1} of {remix.length}
      </p>
      <Caption>{strip.title}</Caption>
      <div class={screen ? 'cs-board' : ''} key={idx}>
        {screen && (
          <div class="cs-ghosts" aria-hidden="true">
            <span /> <span /> <span />
          </div>
        )}
        <RevealStage
          class={screen ? 'cs-overlay' : undefined}
          layout={screen ? 'row' : 'single'}
          startAt={start}
          interval={step}
          sound={flip}
          items={strip.panels.map((p, i) => (
            <div key={i} class="cs-pane">
              <PanelBox asset={p.asset} assets={assets} animate />
              <span class="cs-by">{playerOf(lobby, p.by)?.name}</span>
            </div>
          ))}
        />
      </div>
    </section>
  );
}

function Tally({ view, assets, lobby, screen }: { view: CscView; assets: AssetMap; lobby: Lobby; screen: boolean }) {
  const strips = [...(view.strips ?? [])].sort((a, b) => (view.counts?.[b.id] ?? 0) - (view.counts?.[a.id] ?? 0));
  const shown = strips.slice(0, screen ? 3 : 2);
  return (
    <section class={screen ? 'cs-stage' : 'g-stack'}>
      <p class="g-title">The votes are in</p>
      <div class={screen ? 'cs-tally' : 'g-stack'}>
        {shown.map((s, i) => (
          <div key={s.id} class={`cs-rank${i === 0 && (view.counts?.[s.id] ?? 0) > 0 ? ' is-top' : ''}`}>
            <span class="cs-votes">{view.counts?.[s.id] ?? 0}</span>
            <Strip strip={s} assets={assets} lobby={lobby} />
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------- phone steps ----------

function PromptStep({ view, send }: { view: CscView; send(a: CscAction): void }) {
  const [text, setText] = useState('');
  const sent = view.you?.submitted;
  const clean = text.trim();
  return (
    <>
      <section class="g-stack cs-body">
        <div class="g-spread">
          <span class="eyebrow">Step 1 · Write a premise</span>
          <Timer deadline={view.deadline} total={view.promptMs} />
        </div>
        <Caption>Write the idea for a comic. Another player will draw the first panel.</Caption>
        <textarea
          class="input cs-text"
          rows={4}
          maxLength={MAX_PROMPT_CHARS}
          placeholder="A snail opens a delivery company…"
          value={text}
          disabled={sent}
          onInput={(e) => setText((e.target as HTMLTextAreaElement).value)}
        />
        <div class="g-spread">
          <span class="g-muted">
            {text.length}/{MAX_PROMPT_CHARS}
          </span>
          <button type="button" class="btn btn-s" disabled={sent} onClick={() => setText(PREMISES[Math.floor(Math.random() * PREMISES.length)])}>
            Random premise
          </button>
        </div>
      </section>
      <div class="cs-dock">
        {sent ? (
          <p class="cs-wait">Premise sent. Waiting for the other players.</p>
        ) : (
          <button type="button" class="btn btn-primary btn-block" disabled={!clean} onClick={() => send({ type: 'prompt', text: clean })}>
            Send premise
          </button>
        )}
      </div>
    </>
  );
}

function DrawStep({ view, send, assets, lobby }: { view: CscView; send(a: CscAction): void; assets: AssetMap; lobby: Lobby }) {
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const sentRef = useRef(false);
  const latest = useRef(strokes);
  latest.current = strokes;
  const you = view.you!;
  const submit = () => {
    if (sentRef.current || you.submitted) return;
    sentRef.current = true;
    send({ type: 'panel', panel: view.round, strokes: latest.current });
  };
  const sent = you.submitted || sentRef.current;
  const src = you.source;
  return (
    <>
      <section class="g-stack cs-body">
        <div class="g-spread">
          <span class="eyebrow">Panel {view.round} of 3</span>
          <Timer deadline={view.deadline} total={view.drawMs} onExpire={submit} />
        </div>
        {src?.kind === 'prompt' ? (
          <div class="cs-source">
            <p class="eyebrow">Draw panel 1 for this premise</p>
            <Caption>{src.text}</Caption>
          </div>
        ) : (
          <div class="cs-source">
            <p class="eyebrow">Previous panel. Draw what happens next.</p>
            <PanelBox asset={src?.kind === 'panel' ? src.asset : null} assets={assets} />
          </div>
        )}
        <div class={`cs-paper${sent ? ' is-sent' : ''}`}>
          <DrawingCanvas aspect={PANEL_ASPECT} strokes={strokes} onChange={setStrokes} colors={INKS} disabled={sent} label={`Panel ${view.round}`} />
        </div>
      </section>
      <div class="cs-dock">
        {sent ? (
          <>
            <p class="cs-wait">Panel sent. Waiting for the other players.</p>
            <Progress view={view} lobby={lobby} />
          </>
        ) : (
          <button type="button" class="btn btn-primary btn-block" onClick={submit}>
            {strokes.length ? 'Submit panel' : 'Skip (leave panel blank)'}
          </button>
        )}
      </div>
    </>
  );
}

function VoteStep({ view, send, assets, lobby, me }: { view: CscView; send(a: CscAction): void; assets: AssetMap; lobby: Lobby; me: string }) {
  const options = (view.strips ?? []).map((s) => ({
    id: s.id,
    label: s.prompt,
    disabled: s.id === me,
    hint: s.id === me ? 'Your premise. You can’t vote for it.' : undefined,
    media: (
      <div class="cs-mini">
        {s.panels.map((p, i) => (
          <PanelBox key={i} asset={p.asset} assets={assets} />
        ))}
      </div>
    ),
  }));
  return (
    <section class="g-stack cs-body">
      <div class="g-spread">
        <span class="eyebrow">Vote for your favourite strip</span>
        <Timer deadline={view.deadline} total={40_000} />
      </div>
      <Vote options={options} value={view.you?.vote} onVote={(id) => send({ type: 'vote', strip: id })} label="Favourite strip" />
      <p class="g-muted">
        {view.voted.length} of {view.players.length - view.gone.length} voted
      </p>
    </section>
  );
}

// ---------- Player ----------

function Player({ view, send, me, assets: _a, lobby }: PlayerProps<CscView, CscAction>) {
  useComicCues(view);
  const assets = useAssets(assetIds(view));
  const screenOn = lobby.screenConnected;
  const body = (() => {
    switch (view.phase) {
      case 'prompt':
        return <PromptStep view={view} send={send} />;
      case 'draw':
        return <DrawStep key={view.round} view={view} send={send} assets={assets} lobby={lobby} />;
      case 'reveal':
        return (
          <section class="cs-body">
            {screenOn ? <p class="g-call cs-call">Look at the screen.</p> : <RevealPhone view={view} assets={assets} lobby={lobby} />}
          </section>
        );
      case 'vote':
        return <VoteStep view={view} send={send} assets={assets} lobby={lobby} me={me} />;
      case 'tally':
        return (
          <section class="cs-body g-stack">
            <Tally view={view} assets={assets} lobby={lobby} screen={false} />
            <Standings view={view} lobby={lobby} me={me} />
          </section>
        );
      default:
        return (
          <section class="cs-body">
            {screenOn ? <p class="g-call cs-call">Remixed strips are on the screen.</p> : <RemixView view={view} assets={assets} lobby={lobby} screen={false} />}
          </section>
        );
    }
  })();
  return <div class="cs-root">{body}</div>;
}

// ---------- Screen ----------

function Screen({ view, assets: _a, lobby }: ScreenProps<CscView>) {
  useComicCues(view);
  const assets = useAssets(assetIds(view));
  switch (view.phase) {
    case 'prompt':
    case 'draw':
      return (
        <section class="cs-stage cs-center">
          <p class="eyebrow">{view.phase === 'prompt' ? 'Round 1 · Premises' : `Panel ${view.round} of 3`}</p>
          <p class="g-title">{view.phase === 'prompt' ? 'Write a comic premise on your phone' : 'Draw your panel on your phone'}</p>
          <Timer deadline={view.deadline} total={view.phase === 'prompt' ? view.promptMs : view.drawMs} size="l" />
          <Progress view={view} lobby={lobby} />
        </section>
      );
    case 'reveal':
      return <RevealScreen view={view} assets={assets} lobby={lobby} />;
    case 'vote':
      return (
        <section class="cs-stage">
          <div class="g-spread">
            <p class="g-title">Vote for your favourite strip</p>
            <Timer deadline={view.deadline} total={40_000} size="m" />
          </div>
          <div class="cs-wall">
            {(view.strips ?? []).map((s) => (
              <Strip key={s.id} strip={s} assets={assets} lobby={lobby} />
            ))}
          </div>
          <p class="g-muted">
            {view.voted.length} of {view.players.length - view.gone.length} voted
          </p>
        </section>
      );
    case 'tally':
      return (
        <div class="cs-split">
          <Tally view={view} assets={assets} lobby={lobby} screen />
          <Standings view={view} lobby={lobby} size="4.5vh" />
        </div>
      );
    default:
      return <RemixView view={view} assets={assets} lobby={lobby} screen />;
  }
}

function Rules() {
  return (
    <RulesSheet
      story="The Comic Strip Club is open late, and every strip on tonight's bill starts with one idea from one of you. Nobody gets to finish their own. Pass it on, and see what it turns into."
      how={[
        'Everyone writes the idea for a comic. This is the premise.',
        `You get someone else's premise and draw the first panel. After that you only see the panel before yours, and draw the next one. Every strip has ${PANELS} panels.`,
        'Watch every strip play out, then vote for your favourite. You cannot vote for your own premise.',
        'After the votes, the club shuffles panels from different strips into remixed strips, just for fun.',
      ]}
      scoring={['Everyone who worked on a strip scores for each vote it gets']}
    />
  );
}

export default { Player, Screen, Rules } satisfies ClientGameModule;
