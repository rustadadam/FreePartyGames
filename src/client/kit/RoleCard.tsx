// A full-page private card that tells one player their secret role at the start of a round
// (hidden-role games). Every role renders with the SAME layout, size and colors: there is no tone
// or style prop, so a glance at someone else's phone cannot spot the odd one out. Word the roles
// and details to a similar length for the same reason.
import { useServerNow } from './hooks';
import { PromptCard } from './PromptCard';

export interface RoleCardProps {
  /** Small mono line above the role, e.g. "Round 2 · your role". */
  eyebrow?: string;
  /** The big call, e.g. "You are the Forger" or "You are an artist". */
  role: string;
  /** One plain line under the card: the category or word, or what to do. */
  detail?: string;
  /** Server-ms deadline of the role phase. With `total`, a quiet bar shows it moving on by itself. */
  deadline?: number | null;
  /** Full length of the role phase in ms (the bar's 100%). */
  total?: number;
}

export function RoleCard({ eyebrow, role, detail, deadline, total }: RoleCardProps) {
  return (
    <section class="k-role" aria-label="Your secret role">
      <PromptCard eyebrow={eyebrow} tone="accent" size="l" class="k-role-card">
        {role}
      </PromptCard>
      {detail && <p class="k-role-detail">{detail}</p>}
      {deadline && total ? <RoleBar deadline={deadline} total={total} /> : null}
    </section>
  );
}

function RoleBar({ deadline, total }: { deadline: number; total: number }) {
  const now = useServerNow(200);
  const frac = Math.max(0, Math.min(1, (deadline - now) / total));
  return (
    <div class="k-role-bar" role="progressbar" aria-label="Time until the round starts" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(frac * 100)}>
      <span style={{ transform: `scaleX(${frac})` }} />
    </div>
  );
}
