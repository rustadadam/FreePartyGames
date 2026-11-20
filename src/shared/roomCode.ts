/** Room codes: 4 letters, A–Z without the ambiguous I, O and L. */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ';
export const CODE_LENGTH = 4;

const CODE_RE = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);

/** `random` returns a float in [0, 1), like Math.random. */
export function generateCode(random: () => number = Math.random): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length) % CODE_ALPHABET.length];
  }
  return code;
}

export function isValidCode(code: unknown): code is string {
  return typeof code === 'string' && CODE_RE.test(code);
}

/** Uppercases and strips everything that isn't a letter (" ab-cd " -> "ABCD"). */
export function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z]/g, '');
}
