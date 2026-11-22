// The "How to play" page every game's Rules component renders, so all games read the same way:
// a short story that sets the scene, the steps of play, then how points are won.
import type { ComponentChildren } from 'preact';

export interface RulesSheetProps {
  /** The scene-setting paragraph, in the storyteller's voice. Plain text. */
  story: string;
  /** What happens, in order. One paragraph per step. */
  how: ComponentChildren[];
  /** How points are won. One line each. */
  scoring?: ComponentChildren[];
  /** Small print: edge cases, what happens when someone leaves. */
  note?: ComponentChildren;
}

export function RulesSheet({ story, how, scoring, note }: RulesSheetProps) {
  return (
    <div class="k-rules">
      <p class="k-rules-story">{story}</p>
      <section class="k-rules-part" aria-label="How it plays">
        <h3 class="eyebrow">How it plays</h3>
        <ol class="k-rules-steps">
          {how.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
      </section>
      {scoring && scoring.length > 0 && (
        <section class="k-rules-part" aria-label="Scoring">
          <h3 class="eyebrow">Scoring</h3>
          <ul class="g-list">
            {scoring.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </section>
      )}
      {note && <p class="g-muted k-rules-note">{note}</p>}
    </div>
  );
}
