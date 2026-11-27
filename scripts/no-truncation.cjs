// DESIGN.md §7 rule 9: no text is truncated. A one-line clamp is allowed only on a line that explains
// itself with a `// why:` comment:
//   - React Native: `numberOfLines={1}` / `numberOfLines: 1`;
//   - the web (Tailwind): the `truncate`, `line-clamp-1` and `text-ellipsis` classes, as whole class tokens
//     (with or without a variant prefix such as `md:`), so words like «truncates» or `line-clamp-10` pass;
//     comment-only lines are prose («names wrap, never truncate») and are not checked for them.
'use strict';

const CLAMP = /numberOfLines\s*(?:=\s*\{\s*1\s*\}|:\s*1(?!\d))/;
const WEB_CLAMP = /(?<![\w-])(?:truncate|line-clamp-1|text-ellipsis)(?![\w-])/;
const EXEMPTION = /\/\/\s*why:/;
const COMMENT_ONLY = /^\s*(?:\/\/|\/\*|\*|\{\s*\/\*)/;

/** True when the line clamps text to one line without a `// why:` justification. */
function isTruncationViolation(line) {
  const webClamp = WEB_CLAMP.test(line) && !COMMENT_ONLY.test(line);
  return (CLAMP.test(line) || webClamp) && !EXEMPTION.test(line);
}

/** 1-based line numbers of the violations in a source file. */
function findTruncations(source) {
  const out = [];
  source.split(/\r?\n/).forEach((line, i) => {
    if (isTruncationViolation(line)) out.push(i + 1);
  });
  return out;
}

module.exports = { isTruncationViolation, findTruncations };
