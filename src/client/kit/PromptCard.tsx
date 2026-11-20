// The card a prompt, category or secret word sits on. Index-card proportions with a
// punched corner; `secret` adds a hide/show toggle against shoulder-surfing.
import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';

export interface PromptCardProps {
  /** Small mono label above the text, e.g. "Category" or "Your secret word". */
  eyebrow?: string;
  children: ComponentChildren;
  /** Adds a lock label and a "Hide" / "Show" toggle. Starts shown unless `hidden`. */
  secret?: boolean;
  /** With `secret`: start hidden. */
  hidden?: boolean;
  /** 'm' (default) or 'l' for screen-sized prompts. */
  size?: 'm' | 'l';
  /** 'accent' fills the card with the game accent; 'plain' (default) is a surface card. */
  tone?: 'plain' | 'accent';
  /** Optional footnote line (e.g. a source citation). */
  footer?: ComponentChildren;
  class?: string;
}

export function PromptCard({ eyebrow, children, secret, hidden, size = 'm', tone = 'plain', footer, class: cls }: PromptCardProps) {
  const [shown, setShown] = useState(!hidden);
  return (
    <div class={`k-prompt k-prompt-${size} k-prompt-${tone}${secret ? ' is-secret' : ''}${cls ? ` ${cls}` : ''}`}>
      {(eyebrow || secret) && (
        <div class="k-prompt-head">
          {eyebrow && <span class="eyebrow">{eyebrow}</span>}
          {secret && (
            <button type="button" class="k-prompt-toggle" aria-pressed={!shown} onClick={() => setShown(!shown)}>
              {shown ? 'Hide' : 'Show'}
            </button>
          )}
        </div>
      )}
      <div class="k-prompt-body" aria-hidden={secret && !shown ? 'true' : undefined}>
        {secret && !shown ? <span class="k-prompt-veil">Only you can see this. Tap Show.</span> : children}
      </div>
      {footer && <div class="k-prompt-foot">{footer}</div>}
    </div>
  );
}
