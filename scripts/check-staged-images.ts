/**
 * Pre-commit hook (installed by simple-git-hooks on `npm install`): blocks the
 * commit when a staged post still references local images, or when an image
 * file under src/content/ is staged (even with `git add -f`).
 *
 * Escape hatch for one commit: SKIP_SIMPLE_GIT_HOOKS=1 git commit …
 */
import { execFileSync } from 'node:child_process';
import { findReferences, IMAGE_EXT } from './lib/references.ts';

function git(args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf8' });
}

const staged = git(['diff', '--cached', '--name-only', '-z', '--diff-filter=ACMR'])
  .split('\0')
  .filter((f) => f.startsWith('src/content/'));

const images = staged.filter((f) => IMAGE_EXT.test(f));
const offenders: { file: string; refs: string[] }[] = [];
for (const file of staged.filter((f) => /\.(md|mdx)$/i.test(f))) {
  const refs = findReferences(git(['show', `:${file}`])).map((r) => r.path);
  if (refs.length) offenders.push({ file, refs });
}

if (images.length || offenders.length) {
  const lines = ['', 'Commit blocked: post images must be published before they are committed.', ''];
  if (images.length) {
    lines.push('  Staged image files under src/content/ (these are never committed):');
    for (const f of images) lines.push(`    ${f}`);
    lines.push('');
  }
  if (offenders.length) {
    lines.push('  Posts that still reference local images:');
    for (const o of offenders) lines.push(`    ${o.file}  →  ${o.refs.join(', ')}`);
    lines.push('');
  }
  lines.push('  Run `npm run images:publish`, then stage the rewritten posts and src/data/image-manifest.json.');
  lines.push('  Unstage image files with `git restore --staged <file>`. Details: docs/IMAGES.md');
  lines.push('');
  console.error(lines.join('\n'));
  process.exit(1);
}
