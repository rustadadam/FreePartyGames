// Protocol limits and name sanitizing, with no zod import, so the client shell can use
// them without bundling zod. protocol.ts re-exports everything here.

/** Inbound raw message cap (UTF-16 length of the string, close enough to bytes for ASCII JSON). */
export const MAX_MESSAGE_BYTES = 64 * 1024;
/** Cap on one serialized game view per viewer. Enforced by the contract test. */
export const MAX_VIEW_BYTES = 64 * 1024;
export const MAX_NAME_LENGTH = 24;
export const MAX_TOKEN_LENGTH = 64;
export const MAX_ID_LENGTH = 64;
export const MAX_ASSET_REQ = 64;
export const MAX_BOTS_PER_REQUEST = 20;

/** Trims, collapses whitespace and strips control characters. May return ''. */
export function sanitizeName(raw: string): string {
  return raw
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
