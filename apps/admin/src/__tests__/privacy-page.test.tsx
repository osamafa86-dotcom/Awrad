import { readFileSync } from 'node:fs';
import path from 'node:path';

import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import PublicLayout from '../../app/(public)/layout';
import PrivacyPage from '../../app/(public)/privacy/page';

// F-80 (spec §13): the four sections the stores and the mobile Settings link rely on, in this order.
const HEADINGS = ['ما نجمعه', 'من يرى بياناتك', 'حذف حسابك', 'التواصل'];

const policy = readFileSync(path.resolve(import.meta.dirname, '../../../../docs/privacy-policy.md'), 'utf8');

describe('privacy policy (F-80)', () => {
  it('the canonical markdown has exactly the four ## headings, in order', () => {
    const headings = policy
      .split('\n')
      .filter((line) => line.startsWith('## '))
      .map((line) => line.slice(3).trim());
    expect(headings).toEqual(HEADINGS);
  });

  it('the markdown names the system, the deletion deadline and the last update', () => {
    expect(policy).toContain('أوراد — مفاتيح العلوم');
    expect(policy).toContain('30 يومًا');
    expect(policy).toContain('آخر تحديث');
  });

  it('the page renders the policy with the four section headings in order', () => {
    render(<PrivacyPage />);
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual(HEADINGS);
    expect(screen.getByText(/خلال 30 يومًا من تاريخ الطلب/)).toBeInTheDocument();
    // Deletion is described honestly: the minimal audit record and the backups are named.
    expect(screen.getByText(/سجلّ التدقيق/)).toBeInTheDocument();
    expect(screen.getByText(/النسخ الاحتياطية/)).toBeInTheDocument();
  });

  it('the public layout shows the brand and links back to the login page, without the dashboard shell', () => {
    render(
      <PublicLayout>
        <p>المحتوى</p>
      </PublicLayout>,
    );
    expect(screen.getByRole('banner')).toHaveTextContent('أوراد');
    expect(within(screen.getByRole('contentinfo')).getByRole('link')).toHaveAttribute('href', '/login');
    expect(screen.getByText('المحتوى')).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });
});
