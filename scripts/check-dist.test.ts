import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ASTRO_ASSET, isAllowedDistImage } from './check-dist.ts';

test('astro asset names parse to their stem', () => {
  assert.equal(ASTRO_ASSET.exec('diagram.D9z0VpB4.svg')?.groups?.stem, 'diagram');
  assert.equal(ASTRO_ASSET.exec('valley-wide.ClcMIBPc_Z1YFDNT.jpg')?.groups?.stem, 'valley-wide');
  assert.equal(ASTRO_ASSET.exec('alley.AinoHxqe_1vP433.webp')?.groups?.stem, 'alley');
  assert.equal(ASTRO_ASSET.exec('camp-panorama.8Vr1ck-y_1Bt6nT.jpg')?.groups?.stem, 'camp-panorama');
  assert.equal(ASTRO_ASSET.exec('my.logo.v2.Ab12Cd34.png')?.groups?.stem, 'my.logo.v2');
});

test('allows public files and theme assets, rejects everything else', () => {
  const themeStems = new Set(['logo', 'diagram']);
  assert.equal(isAllowedDistImage({ rel: 'favicon.svg', inPublic: true }, themeStems), true);
  assert.equal(isAllowedDistImage({ rel: '_astro/logo.Ab12Cd34_Z1abc.webp', inPublic: false }, themeStems), true);
  assert.equal(isAllowedDistImage({ rel: '_astro/diagram.D9z0VpB4.svg', inPublic: false }, themeStems), true);
  assert.equal(isAllowedDistImage({ rel: '_astro/valley-wide.ClcMIBPc_Z1YFDNT.jpg', inPublic: false }, themeStems), false);
  assert.equal(isAllowedDistImage({ rel: 'images/x.jpg', inPublic: false }, themeStems), false);
  assert.equal(isAllowedDistImage({ rel: '_astro/weird.jpg', inPublic: false }, themeStems), false);
});
