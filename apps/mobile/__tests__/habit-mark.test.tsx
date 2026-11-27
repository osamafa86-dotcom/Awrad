import { render, screen } from '@testing-library/react-native';

type JsonNode = { type: string; children?: Array<JsonNode | string> | null };

function countType(node: JsonNode | string | null, type: string): number {
  if (!node || typeof node === 'string') return 0;
  return (
    (node.type === type ? 1 : 0) + (node.children ?? []).reduce((n, c) => n + countType(c, type), 0)
  );
}

import { darkColors, lightColors } from '@awrad/design-tokens';

import { HabitMark, markColor } from '../src/components/HabitMark';
import { ar } from '../src/messages/ar';

/** WCAG 2.x contrast ratio of two #rrggbb colours. */
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * bl!;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

describe('HabitMark', () => {
  test('each of the four states has its own shape marker and accessible name', async () => {
    const states = [undefined, 'done', 'not_done', 'not_required'] as const;
    for (const status of states) {
      await render(<HabitMark status={status} />);
      const key = status ?? 'unset';
      expect(screen.getByTestId(`habit-mark-${key}`)).toBeTruthy();
      expect(screen.getByLabelText(ar.today.markState[key])).toBeTruthy();
    }
  });

  test('shape differs, not colour alone: ring · gold fill · cross · dash', async () => {
    const shape = async (status: 'done' | 'not_done' | 'not_required' | undefined) => {
      await render(<HabitMark status={status} />);
      expect(screen.getByTestId(`habit-mark-${status ?? 'unset'}`)).toBeTruthy();
      const tree = screen.toJSON() as JsonNode;
      return { circles: countType(tree, 'RNSVGCircle'), lines: countType(tree, 'RNSVGLine') };
    };
    expect(await shape(undefined)).toEqual({ circles: 1, lines: 0 });
    expect(await shape('done')).toEqual({ circles: 1, lines: 0 });
    expect(await shape('not_done')).toEqual({ circles: 0, lines: 2 });
    expect(await shape('not_required')).toEqual({ circles: 0, lines: 1 });
  });

  // Final review mobile minor 1: «غير مطلوب» is meaning, not decoration (WCAG 1.4.11 non-text contrast ≥ 3:1), on the
  // card and on the canvas (date header), in light and dark. borderDefault gave 1.57:1.
  test.each([
    ['light', lightColors],
    ['dark', darkColors],
  ] as const)('every state meets 3:1 against the card and the canvas (%s)', (_name, colors) => {
    for (const state of ['unset', 'not_done', 'not_required'] as const) {
      const color = markColor(state, colors);
      expect(contrast(color, colors.bgSurface)).toBeGreaterThanOrEqual(3);
      expect(contrast(color, colors.bgCanvas)).toBeGreaterThanOrEqual(3);
    }
  });
});
