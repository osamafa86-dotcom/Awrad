import { darkColors, lightColors } from '@awrad/design-tokens';
import { render } from '@testing-library/react-native';

import { RubMark, rubMarkPaint, STAR_POINTS } from '../src/components/icons/RubMark';

describe('RubMark', () => {
  it('is an eight-pointed rosette (16 alternating outer/inner vertices)', () => {
    const points = STAR_POINTS.split(' ').map((p) => p.split(',').map(Number) as [number, number]);
    expect(points).toHaveLength(16);
    const radius = ([x, y]: [number, number]) => Math.hypot(x - 12, y - 12);
    const outer = points.filter((_, i) => i % 2 === 0).map(radius);
    const inner = points.filter((_, i) => i % 2 === 1).map(radius);
    expect(Math.min(...outer)).toBeGreaterThan(Math.max(...inner));
  });

  it('is outlined in the given colour while empty and gold only when filled', () => {
    expect(rubMarkPaint(false, lightColors.textTertiary, lightColors)).toEqual({
      fill: 'none',
      stroke: lightColors.textTertiary,
    });
    expect(rubMarkPaint(true, lightColors.textTertiary, darkColors)).toEqual({
      fill: darkColors.goldGilt,
      stroke: darkColors.goldText,
    });
  });

  it('renders without crashing in both states', async () => {
    await render(<RubMark color={lightColors.textTertiary} />);
    await render(<RubMark color={lightColors.textTertiary} filled size={32} />);
  });
});
