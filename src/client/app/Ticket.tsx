// The signature: the room code on a raffle ticket with a perforated QR stub.
import { useState } from 'preact/hooks';
import { QR } from '../kit/QR';

export function roomUrl(code: string): string {
  return `${location.origin}/${code}`;
}

export function prettyUrl(code: string): string {
  return `${location.host}/${code}`;
}

export interface TicketProps {
  code: string;
  /** 'vertical': code on top, QR stub below (screen lobby). 'horizontal': stub on the right. */
  layout?: 'vertical' | 'horizontal';
  /** Hide the QR stub. */
  noQr?: boolean;
  maxPlayers?: number;
  class?: string;
}

export function Ticket({ code, layout = 'vertical', noQr, maxPlayers = 20, class: cls }: TicketProps) {
  return (
    <div class={`ticket ticket-${layout}${cls ? ` ${cls}` : ''}`}>
      <div class="ticket-main">
        <span class="ticket-eyebrow">Room code</span>
        <span class="ticket-code" aria-label={`Room code ${code.split('').join(' ')}`}>
          {code}
        </span>
        {layout === 'vertical' && <span class="ticket-url">{prettyUrl(code)}</span>}
      </div>
      {!noQr && (
        <div class="ticket-stub">
          <QR value={roomUrl(code)} label={`QR code: join room ${code}`} />
          <span class="ticket-fine">Scan to join · admits {maxPlayers}</span>
        </div>
      )}
    </div>
  );
}

/** Small header stub with the code (phones). */
export function TicketStub({ code }: { code: string }) {
  return (
    <span class="ticket-mini" aria-label={`Room ${code}`}>
      {code}
    </span>
  );
}

/** Share the room link: Web Share where available, else copy. */
export function ShareButton({ code, class: cls }: { code: string; class?: string }) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const url = roomUrl(code);
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    if (nav.share) {
      try {
        await nav.share({ title: 'Join my party game', text: `Room ${code}`, url });
        return;
      } catch (e) {
        if ((e as Error)?.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      prompt('Copy this link', url);
    }
  };
  return (
    <button type="button" class={`btn ${cls ?? ''}`} onClick={share}>
      {copied ? 'Link copied' : 'Share link'}
    </button>
  );
}
