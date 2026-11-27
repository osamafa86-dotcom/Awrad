import { darkColors, lightColors, type } from '@awrad/design-tokens';
import { renderHook } from '@testing-library/react-native';
import * as RN from 'react-native';

import { fontMap } from '../src/lib/fonts';
import { useTheme } from '../src/lib/theme';

describe('useTheme', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns the light palette under the light scheme', async () => {
    jest.spyOn(RN, 'useColorScheme').mockReturnValue('light');
    const { result } = await renderHook(() => useTheme());
    expect(result.current.scheme).toBe('light');
    expect(result.current.colors).toBe(lightColors);
  });

  it('returns the dark palette under the dark scheme', async () => {
    jest.spyOn(RN, 'useColorScheme').mockReturnValue('dark');
    const { result } = await renderHook(() => useTheme());
    expect(result.current.scheme).toBe('dark');
    expect(result.current.colors).toBe(darkColors);
  });

  it('falls back to light when the scheme is unknown', async () => {
    jest.spyOn(RN, 'useColorScheme').mockReturnValue(null);
    const { result } = await renderHook(() => useTheme());
    expect(result.current.colors).toBe(lightColors);
  });

  it('sets the Hijri date in Markazi Text Bold', async () => {
    jest.spyOn(RN, 'useColorScheme').mockReturnValue('light');
    const { result } = await renderHook(() => useTheme());
    expect(result.current.type.displayHijri.fontFamily).toBe('MarkaziText-Bold');
  });

  it('registers a font file under every family name the type scale uses', async () => {
    const families = new Set(Object.values(type).map((t) => t.fontFamily));
    expect(Object.keys(fontMap).sort()).toEqual([...families].sort());
  });
});
