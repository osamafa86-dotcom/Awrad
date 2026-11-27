import { fireEvent, render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import ErrorPage from '../../app/error';
import GlobalError from '../../app/global-error';
import NotFound from '../../app/not-found';

// Final review admin M-2: an unknown URL or an uncaught render error showed Next's English fallback in an Arabic,
// right-to-left product. The root boundaries now speak Arabic and offer a way on.

describe('root not-found', () => {
  it('says so in Arabic and links back to the dashboard', () => {
    render(<NotFound />);
    expect(screen.getByRole('heading', { level: 1, name: 'الصفحة غير موجودة' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'العودة إلى اللوحة' })).toHaveAttribute('href', '/');
  });
});

describe('root error', () => {
  it('says so in Arabic, never shows the raw message, and retries on request', () => {
    const retry = vi.fn();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<ErrorPage error={new Error('PGRST301 secret detail')} retry={retry} />);
    expect(screen.getByRole('heading', { level: 1, name: 'حدث خطأ غير متوقّع' })).toBeInTheDocument();
    expect(screen.queryByText(/PGRST301/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'أعد المحاولة' }));
    expect(retry).toHaveBeenCalledOnce();
  });
});

describe('global error (replaces the root layout)', () => {
  it('renders its own Arabic RTL document with a retry button', () => {
    // why: a whole <html> document cannot be mounted inside the test container; the server markup shows its shape.
    const html = renderToStaticMarkup(<GlobalError error={new Error('x')} retry={() => undefined} />);
    expect(html).toMatch(/^<html lang="ar" dir="rtl">/);
    expect(html).toContain(`<title>${"أوراد — لوحة الإشراف"}</title>`);
    expect(html).toContain('حدث خطأ غير متوقّع');
    expect(html).toMatch(/<button[^>]*type="button"[^>]*>أعد المحاولة<\/button>/);
  });
});
