// QR code as crisp SVG, from the in-house encoder (no external service).
import { useMemo } from 'preact/hooks';
import { encodeQr, qrPath, type Ecc } from './qr';

export interface QRProps {
  /** Text to encode, usually the room link. */
  value: string;
  /** CSS length for width and height. Default 100%. */
  size?: string;
  ecc?: Ecc;
  /** Module color. Default night ink. Keep high contrast: scanners need it. */
  fg?: string;
  /** Background + quiet zone color. Default white. */
  bg?: string;
  /** Accessible label. Default "QR code for <value>". */
  label?: string;
  class?: string;
}

const QUIET = 2; // the white stub around it supplies the rest of the quiet zone

export function QR({ value, size = '100%', ecc = 'M', fg = '#1a1033', bg = '#ffffff', label, class: cls }: QRProps) {
  const qr = useMemo(() => {
    try {
      const m = encodeQr(value, ecc);
      return { n: m.size + QUIET * 2, d: qrPath(m, QUIET) };
    } catch {
      return null;
    }
  }, [value, ecc]);
  if (!qr) return null;
  return (
    <svg
      class={`k-qr${cls ? ` ${cls}` : ''}`}
      viewBox={`0 0 ${qr.n} ${qr.n}`}
      width={size}
      height={size}
      role="img"
      aria-label={label ?? `QR code for ${value}`}
      shape-rendering="crispEdges"
    >
      <rect width={qr.n} height={qr.n} fill={bg} />
      <path d={qr.d} fill={fg} />
    </svg>
  );
}
