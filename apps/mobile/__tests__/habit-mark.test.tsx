import { render, screen } from '@testing-library/react-native';

type JsonNode = { type: string; children?: Array<JsonNode | string> | null };

function countType(node: JsonNode | string | null, type: string): number {
  if (!node || typeof node === 'string') return 0;
  return (
    (node.type === type ? 1 : 0) + (node.children ?? []).reduce((n, c) => n + countType(c, type), 0)
  );
}

import { HabitMark } from '../src/components/HabitMark';
import { ar } from '../src/messages/ar';

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
});
