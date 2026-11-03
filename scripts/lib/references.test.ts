import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findImportHazards, findReferences, isLocalImagePath, maskCode, postKey, rewrite } from './references.ts';

const paths = (text: string) => findReferences(text).map((r) => `${r.kind}:${r.path}`);

test('isLocalImagePath', () => {
  assert.equal(isLocalImagePath('./a.jpg'), true);
  assert.equal(isLocalImagePath('images/a.PNG'), true);
  assert.equal(isLocalImagePath('../up/a.webp?x=1'), true);
  assert.equal(isLocalImagePath('https://cdn.example/a.jpg'), false);
  assert.equal(isLocalImagePath('/images/a.jpg'), false);
  assert.equal(isLocalImagePath('./notes.md'), false);
  assert.equal(isLocalImagePath('{photo}'), false);
});

test('frontmatter: bare, quoted, list items, inline arrays; not prose', () => {
  const text = `---
title: Trip
cover: ./cover.jpg
thumb: "./thumbs/small.png"
gallery:
  - ./one.jpg
  - './two.jpeg'
more: [./three.gif, "./four.webp"]
description: see photo.jpg and ./five.jpg in the text
remote: https://cdn.example/x.jpg
---
body
`;
  assert.deepEqual(paths(text), [
    'frontmatter:./cover.jpg',
    'frontmatter:./thumbs/small.png',
    'frontmatter:./one.jpg',
    'frontmatter:./two.jpeg',
    'frontmatter:./three.gif',
    'frontmatter:./four.webp',
  ]);
});

test('frontmatter only when the file starts with ---', () => {
  const text = `Intro

---

cover: ./not-frontmatter.jpg
`;
  assert.deepEqual(paths(text), []);
});

test('markdown images: titles with parentheses, angle paths, encoded spaces, nested brackets', () => {
  const text = [
    '![A cat](./cat.jpg "Cat (asleep)")',
    '![Space](<./my photo.jpg>)',
    '![Enc](./my%20photo.jpg)',
    '![a [b] c](./nested.png)',
    "![Single](./s.jpg 'title')",
    '![Remote](https://cdn.example/x.jpg)',
    '![Public](/images/x.jpg)',
  ].join('\n');
  assert.deepEqual(paths(text), [
    'markdown:./cat.jpg',
    'markdown:./my photo.jpg',
    'markdown:./my photo.jpg',
    'markdown:./nested.png',
    'markdown:./s.jpg',
  ]);
});

test('fenced code blocks, inline code and definitions', () => {
  const text = `---
cover: ./real.jpg
---
Use \`![x](./inline.jpg)\` like this:

\`\`\`yaml
cover: ./images/my-cover.jpg
\`\`\`

~~~
![y](./tilde.jpg)
~~~

![z][shot]

[shot]: ./shot.jpg "Shot"
[doc]: ./doc.pdf
`;
  assert.deepEqual(paths(text), ['frontmatter:./real.jpg', 'definition:./shot.jpg']);
  assert.equal(maskCode(text).length, text.length);
});

test('links, attributes and srcset', () => {
  const text = [
    '[download](./full.jpg)',
    '<a href="./big.png">big</a>',
    "<img src='./a.jpg' alt=\"x\">",
    '<Figure src="./f.jpg" alt="x" />',
    '<video poster="./p.jpg"></video>',
    '<img srcset="./one.jpg 1x, ./two.jpg 2x" src="https://cdn.example/x.jpg">',
  ].join('\n');
  assert.deepEqual(paths(text), [
    'link:./full.jpg',
    'link:./big.png',
    'attr:./a.jpg',
    'attr:./f.jpg',
    'attr:./p.jpg',
    'attr:./one.jpg',
    'attr:./two.jpg',
  ]);
});

test('imports become exports and hazards are detected', () => {
  const text = `import Figure from '../../components/mdx/Figure.astro';
import river from './misty-river.jpg';
import { Image } from 'astro:assets';

<Figure src={river} alt="r" />
<Image src={river} alt="r" width={480} />
Width: {river.width}
`;
  const refs = findReferences(text);
  assert.deepEqual(refs.map((r) => [r.kind, r.path, r.name]), [['import', './misty-river.jpg', 'river']]);
  const out = rewrite(text, refs, () => 'https://cdn.example/blog/x/misty-river-abcd1234.webp');
  assert.match(out, /^export const river = 'https:\/\/cdn\.example\/blog\/x\/misty-river-abcd1234\.webp';$/m);
  assert.doesNotMatch(out, /import river/);
  const hazards = findImportHazards(text, refs);
  assert.equal(hazards.length, 2);
  assert.match(hazards[0]!, /river\.width/);
  assert.match(hazards[1]!, /<Image src=\{river\}>/);
});

test('rewrite keeps everything else byte for byte', () => {
  const text = `---
cover: "./cover.jpg"
---
Text ![A](./a.jpg "t") more [b](./b.jpg) end.
`;
  const refs = findReferences(text);
  const out = rewrite(text, refs, (r) => `https://cdn/${r.path.slice(2)}`);
  assert.equal(
    out,
    `---
cover: "https://cdn/cover.jpg"
---
Text ![A](https://cdn/a.jpg "t") more [b](https://cdn/b.jpg) end.
`,
  );
});

test('postKey', () => {
  assert.deepEqual(postKey('blog/trip/index.md'), { collection: 'blog', slug: 'trip', key: 'blog/trip' });
  assert.deepEqual(postKey('blog/trip.mdx'), { collection: 'blog', slug: 'trip', key: 'blog/trip' });
  assert.deepEqual(postKey('blog/2026/trip/index.md'), { collection: 'blog', slug: '2026/trip', key: 'blog/2026/trip' });
  assert.deepEqual(postKey('blog/2026/trip.md'), { collection: 'blog', slug: '2026/trip', key: 'blog/2026/trip' });
});
