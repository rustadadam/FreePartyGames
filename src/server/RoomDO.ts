import { DurableObject } from 'cloudflare:workers';

// Placeholder Durable Object (U0). The real adapter around src/core/engine.ts arrives in U2.
export class RoomDO extends DurableObject {
  override async fetch(): Promise<Response> {
    return new Response('Not implemented', { status: 501 });
  }
}
