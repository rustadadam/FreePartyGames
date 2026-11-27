/** Retries player actions until the room confirms it processed them. */
type PendingAction = {
  payload: unknown;
  createdAt: number;
  attempts: number;
  timer: ReturnType<typeof setTimeout> | null;
};

export class ActionOutbox {
  private readonly pending = new Map<string, PendingAction>();

  constructor(
    private readonly transmit: (id: string, payload: unknown) => boolean,
    private readonly changed: (count: number) => void,
    private readonly expired: () => void,
  ) {}

  submit(payload: unknown): void {
    if (this.pending.size >= MAX_PENDING) {
      this.expired();
      return;
    }
    const id = newActionId();
    const item: PendingAction = { payload, createdAt: Date.now(), attempts: 0, timer: null };
    this.pending.set(id, item);
    this.changed(this.pending.size);
    this.deliver(id, item);
  }

  /** Re-send unconfirmed actions after the next welcome. IDs let the room deduplicate them. */
  reconnected(): void {
    const now = Date.now();
    for (const [id, item] of this.pending) {
      if (now - item.createdAt >= ACTION_TTL_MS) this.expire(id, item);
      else this.deliver(id, item);
    }
  }

  acknowledge(id: string): void {
    if (!this.pending.has(id)) return;
    // WebSocket messages are ordered: a later acknowledgment also proves earlier
    // submissions on that connection were processed, even if their own ack was lost.
    for (const [pendingId, item] of this.pending) {
      if (item.timer) clearTimeout(item.timer);
      this.pending.delete(pendingId);
      if (pendingId === id) break;
    }
    this.changed(this.pending.size);
  }

  dispose(): void {
    for (const item of this.pending.values()) if (item.timer) clearTimeout(item.timer);
    this.pending.clear();
    this.changed(0);
  }

  private deliver(id: string, item: PendingAction): void {
    if (item.timer) clearTimeout(item.timer);
    item.timer = null;
    const now = Date.now();
    if (now - item.createdAt >= ACTION_TTL_MS) return this.expire(id, item);
    const sent = this.transmit(id, item.payload);
    if (sent) item.attempts++;
    item.timer = setTimeout(() => {
      item.timer = null;
      if (Date.now() - item.createdAt >= ACTION_TTL_MS) this.expire(id, item);
      else this.deliver(id, item);
    }, sent ? Math.min(RETRY_MS * 2 ** (item.attempts - 1), MAX_RETRY_MS) : ACTION_TTL_MS - (now - item.createdAt));
  }

  private remove(id: string, item: PendingAction): void {
    if (item.timer) clearTimeout(item.timer);
    this.pending.delete(id);
    this.changed(this.pending.size);
  }

  private expire(id: string, item: PendingAction): void {
    this.remove(id, item);
    this.expired();
  }
}

const MAX_PENDING = 32;
const RETRY_MS = 900;
const MAX_RETRY_MS = 4_000;
const ACTION_TTL_MS = 20_000;

function newActionId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
