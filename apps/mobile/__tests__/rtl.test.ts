import { I18nManager, Platform } from 'react-native';

import { ensureRTL } from '../src/lib/rtl';

describe('ensureRTL', () => {
  const originalOS = Platform.OS;

  afterEach(() => {
    Platform.OS = originalOS;
    jest.restoreAllMocks();
  });

  it('allows and forces RTL layout on native', () => {
    Platform.OS = 'ios';
    const state = { isRTL: false };
    const allow = jest.spyOn(I18nManager, 'allowRTL').mockImplementation(() => undefined);
    const force = jest.spyOn(I18nManager, 'forceRTL').mockImplementation((v: boolean) => {
      state.isRTL = v;
    });

    ensureRTL();

    expect(allow).toHaveBeenCalledWith(true);
    expect(force).toHaveBeenCalledWith(true);
    expect(state.isRTL).toBe(true);
  });

  it('sets dir="rtl" and lang="ar" on the document on web without touching I18nManager', () => {
    Platform.OS = 'web';
    const documentElement = { dir: '', lang: '' };
    const g = globalThis as unknown as { document?: unknown };
    const previous = g.document;
    g.document = { documentElement };
    const force = jest.spyOn(I18nManager, 'forceRTL').mockImplementation(() => undefined);

    try {
      ensureRTL();
    } finally {
      g.document = previous;
    }

    expect(documentElement).toEqual({ dir: 'rtl', lang: 'ar' });
    expect(force).not.toHaveBeenCalled();
  });
});
