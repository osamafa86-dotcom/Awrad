// DESIGN.md §7 rule 9: no text is truncated. A one-line clamp (`numberOfLines={1}` / `numberOfLines: 1`)
// is allowed only on a line that explains itself with a `// why:` comment.
'use strict';

const CLAMP = /numberOfLines\s*(?:=\s*\{\s*1\s*\}|:\s*1(?!\d))/;
const EXEMPTION = /\/\/\s*why:/;

/** True when the line clamps text to one line without a `// why:` justification. */
function isTruncationViolation(line) {
  return CLAMP.test(line) && !EXEMPTION.test(line);
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
