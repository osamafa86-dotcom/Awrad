import Svg, { Circle, Polygon } from 'react-native-svg';

import { useTheme, type ThemeColors } from '../../lib/theme';

export interface RubMarkProps {
  size?: number;
  /** Completed: filled with gold (gold is reserved for completion). */
  filled?: boolean;
  /** Outline colour of the empty mark (a colour token value). */
  color: string;
}

const VIEWBOX = 24;
const CENTER = VIEWBOX / 2;
const OUTER = 10.5;
// Two overlapping squares (one turned 45°): the inner vertices sit where their edges cross.
const INNER = (OUTER * Math.cos(Math.PI / 4)) / Math.cos(Math.PI / 8);
const STROKE = 1.75;

export const STAR_POINTS = Array.from({ length: 16 }, (_, i) => {
  const r = i % 2 === 0 ? OUTER : INNER;
  const a = (i * Math.PI) / 8 - Math.PI / 2;
  return `${(CENTER + r * Math.cos(a)).toFixed(3)},${(CENTER + r * Math.sin(a)).toFixed(3)}`;
}).join(' ');

/** Gold only when completed (DESIGN.md §2 rule: gold is for completion alone). */
export function rubMarkPaint(filled: boolean, color: string, colors: ThemeColors) {
  return filled ? { fill: colors.goldGilt, stroke: colors.goldText } : { fill: 'none', stroke: color };
}

/** ۞ — the rub' al-hizb rosette: the daily wird mark (DESIGN.md §2). */
export function RubMark({ size = 24, filled = false, color }: RubMarkProps) {
  const { colors } = useTheme();
  const { fill, stroke } = rubMarkPaint(filled, color, colors);
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`} accessible={false}>
      <Polygon
        points={STAR_POINTS}
        fill={fill}
        stroke={stroke}
        strokeWidth={STROKE}
        strokeLinejoin="round"
      />
      <Circle cx={CENTER} cy={CENTER} r={3} fill="none" stroke={stroke} strokeWidth={STROKE} />
    </Svg>
  );
}
