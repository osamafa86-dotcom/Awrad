// ۞ — the rub' al-hizb rosette, the brand mark (DESIGN.md §2). Same geometry as the mobile RubMark.
const VIEWBOX = 24;
const CENTER = VIEWBOX / 2;
const OUTER = 10.5;
// Two overlapping squares (one turned 45°): the inner vertices sit where their edges cross.
const INNER = (OUTER * Math.cos(Math.PI / 4)) / Math.cos(Math.PI / 8);

const STAR_POINTS = Array.from({ length: 16 }, (_, i) => {
  const r = i % 2 === 0 ? OUTER : INNER;
  const a = (i * Math.PI) / 8 - Math.PI / 2;
  return `${(CENTER + r * Math.cos(a)).toFixed(3)},${(CENTER + r * Math.sin(a)).toFixed(3)}`;
}).join(' ');

export interface RubMarkProps {
  /** Rendered size in pixels. */
  size: number;
  className?: string;
}

/** Decorative outline mark; it takes the text colour (`currentColor`). */
export function RubMark({ size, className }: RubMarkProps) {
  return (
    <svg width={size} height={size} viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`} aria-hidden="true" className={className}>
      <polygon points={STAR_POINTS} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinejoin="round" />
      <circle cx={CENTER} cy={CENTER} r={3} fill="none" stroke="currentColor" strokeWidth={1.75} />
    </svg>
  );
}
