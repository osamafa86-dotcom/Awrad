import { render, screen, userEvent, fireEvent } from '@testing-library/react-native';
import { useState } from 'react';
import { I18nManager, StyleSheet } from 'react-native';

import { OtpInput, otpRowStyle } from '../src/components/OtpInput';
import { ar } from '../src/messages/ar';

function Harness({ error = false, onComplete }: { error?: boolean; onComplete?: (v: string) => void }) {
  const [value, setValue] = useState('');
  return <OtpInput value={value} onChange={setValue} error={error} onComplete={onComplete} />;
}

// The boxes are hidden from assistive tech (the real input announces the code), hence `hidden`.
const box = (i: number) => screen.getByTestId(`otp-box-${i}`, { hidden: true });

describe('OtpInput', () => {
  const original = I18nManager.isRTL;
  beforeEach(() => {
    Object.defineProperty(I18nManager, 'isRTL', { value: true, configurable: true });
  });
  afterEach(() => {
    Object.defineProperty(I18nManager, 'isRTL', { value: original, configurable: true });
  });

  // Where native Yoga puts child 0: `row` starts at the layout start (right in RTL), `row-reverse` at the end.
  const firstChildIsLeftmost = (flexDirection: unknown, isRTL: boolean) =>
    flexDirection === 'row' ? !isRTL : isRTL;

  it.each([true, false])(
    'on native with isRTL=%s the first digit lands in the leftmost box',
    async (isRTL) => {
      Object.defineProperty(I18nManager, 'isRTL', { value: isRTL, configurable: true });
      const user = userEvent.setup();
      await render(<Harness />);

      const row = screen.getByTestId('otp-row');
      const style = StyleSheet.flatten(row.props.style);
      expect(style.flexDirection).toBe(isRTL ? 'row-reverse' : 'row');
      expect(firstChildIsLeftmost(style.flexDirection, isRTL)).toBe(true);
      expect(row.children).toHaveLength(6);

      await user.type(screen.getByLabelText(ar.auth.otpLabel), '12');
      expect(box(0)).toHaveTextContent('1');
      expect(box(1)).toHaveTextContent('2');
      expect(box(2)).not.toHaveTextContent(/\d/);
    },
  );

  it('on web forces direction ltr with a plain row', () => {
    expect(otpRowStyle(false, 'web')).toEqual({ direction: 'ltr', flexDirection: 'row' });
    expect(otpRowStyle(true, 'ios')).toEqual({ flexDirection: 'row-reverse' });
    expect(otpRowStyle(true, 'android')).toEqual({ flexDirection: 'row-reverse' });
  });

  it('fills boxes in order as digits are typed', async () => {
    const user = userEvent.setup();
    await render(<Harness />);
    await user.type(screen.getByLabelText(ar.auth.otpLabel), '4821');
    ['4', '8', '2', '1'].forEach((d, i) => expect(box(i)).toHaveTextContent(d));
    expect(box(4)).not.toHaveTextContent(/\d/);
  });

  it('fills every box when a full code is pasted, and reports completion once', async () => {
    const onComplete = jest.fn();
    await render(<Harness onComplete={onComplete} />);
    await fireEvent.changeText(screen.getByLabelText(ar.auth.otpLabel), '123456');
    '123456'.split('').forEach((d, i) => expect(box(i)).toHaveTextContent(d));
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith('123456');
  });

  it('strips non-digits and ignores anything beyond six digits', async () => {
    await render(<Harness />);
    await fireEvent.changeText(screen.getByLabelText(ar.auth.otpLabel), '12 34-56789');
    '123456'.split('').forEach((d, i) => expect(box(i)).toHaveTextContent(d));
  });

  it('uses a numeric one-time-code keyboard', async () => {
    await render(<Harness />);
    const input = screen.getByLabelText(ar.auth.otpLabel);
    expect(input.props.keyboardType).toBe('number-pad');
    expect(input.props.maxLength).toBe(6);
    expect(input.props.textContentType).toBe('oneTimeCode');
  });

  it('marks the group invalid in the error state', async () => {
    await render(<Harness error />);
    expect(screen.getByLabelText(ar.auth.otpLabel).props['aria-invalid']).toBe(true);
  });
});
