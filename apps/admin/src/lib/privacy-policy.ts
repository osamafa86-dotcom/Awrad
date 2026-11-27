import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * The canonical Arabic privacy policy (F-80) is content, kept in docs/ beside the other project documents.
 * Read at build time: /privacy is prerendered (force-static), so the running server never needs the file.
 * The path is from the admin app's directory, where `next build` and Vitest run.
 */
export function readPrivacyPolicy(): string {
  return readFileSync(path.join(process.cwd(), '..', '..', 'docs', 'privacy-policy.md'), 'utf8');
}
