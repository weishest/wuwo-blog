import assert from 'node:assert/strict';
import { test } from 'node:test';
import sharp from 'sharp';
import { hashOf, ImageError, MAX_BYTES, processImage, slugName } from './process.ts';

const solid = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: { r: 200, g: 40, b: 40 } } });

test('slugName and hashOf', () => {
  assert.equal(slugName('Mé Photo 1.JPG'), 'me-photo-1');
  assert.equal(slugName('___.png'), 'image');
  assert.equal(hashOf(Buffer.from('a')).length, 8);
});

test('raster: auto-orients, strips metadata, caps variants at the original width', async () => {
  // 1200×800 tagged "rotate 90°": the oriented image is 800×1200.
  const input = await solid(1200, 800).jpeg().withMetadata({ orientation: 6 }).toBuffer();
  const result = await processImage(input, 'Trip Photo.jpg', 'blog/trip');
  assert.deepEqual(result.widths, [480, 800]);
  assert.equal(result.width, 800);
  assert.equal(result.height, 1200);
  assert.match(result.key, /^blog\/trip\/trip-photo-[0-9a-f]{8}\.webp$/);
  assert.deepEqual(
    result.objects.map((o) => o.key),
    [result.key.replace(/\.webp$/, '-480.webp'), result.key],
  );
  for (const object of result.objects) {
    assert.equal(object.contentType, 'image/webp');
    const meta = await sharp(object.body).metadata();
    assert.equal(meta.format, 'webp');
    assert.equal(meta.exif, undefined);
    assert.equal(meta.icc, undefined);
    assert.equal(meta.orientation, undefined);
  }
  const largest = await sharp(result.objects[1]!.body).metadata();
  assert.equal(largest.width, 800);
  assert.equal(largest.height, 1200);
});

test('raster: wide images get all four variants and a 2400px largest', async () => {
  const input = await solid(3000, 1000).png().toBuffer();
  const result = await processImage(input, 'pano.png', 'blog/p');
  assert.deepEqual(result.widths, [480, 960, 1600, 2400]);
  assert.equal(result.height, 800);
  assert.equal(result.objects.length, 4);
  assert.ok(result.objects.every((o) => o.key.endsWith('.webp')));
});

test('raster: small images get one object', async () => {
  const input = await solid(300, 200).jpeg().toBuffer();
  const result = await processImage(input, 'tiny.jpeg', 'blog/t');
  assert.deepEqual(result.widths, [300]);
  assert.equal(result.objects.length, 1);
  assert.equal(result.objects[0]!.key, result.key);
});

test('svg and gif are kept as-is', async () => {
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60"><rect width="120" height="60"/></svg>');
  const result = await processImage(svg, 'Diagram.svg', 'blog/d');
  assert.equal(result.key, `blog/d/diagram-${hashOf(svg)}.svg`);
  assert.deepEqual(result.widths, [120]);
  assert.equal(result.height, 60);
  assert.equal(result.objects[0]!.contentType, 'image/svg+xml');
  assert.ok(result.objects[0]!.body.equals(svg));

  const gif = await solid(40, 30).gif().toBuffer();
  const g = await processImage(gif, 'anim.gif', 'blog/g');
  assert.equal(g.objects[0]!.contentType, 'image/gif');
  assert.ok(g.key.endsWith('.gif'));
});

test('rejects files over 25 MB and undecodable data', async () => {
  await assert.rejects(processImage(Buffer.alloc(MAX_BYTES + 1), 'huge.jpg', 'blog/h'), ImageError);
  await assert.rejects(processImage(Buffer.from('not an image'), 'bad.heic', 'blog/h'), (err: unknown) => {
    assert.ok(err instanceof ImageError);
    assert.match(err.message, /HEIC/);
    return true;
  });
});

test('download copy: full resolution, same format family, EXIF/GPS removed, ICC kept, attachment', async () => {
  // 3000×2000 JPEG with EXIF (incl. GPS-like fields), orientation 6 and an sRGB ICC profile
  const input = await solid(3000, 2000)
    .jpeg()
    .withMetadata({ orientation: 6, icc: 'srgb' })
    .withExif({ IFD0: { Make: 'TestCam', Model: 'X1' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '59/1 54/1 0/1' } })
    .toBuffer();
  const before = await sharp(input).metadata();
  assert.ok(before.exif, 'fixture has EXIF');

  const result = await processImage(input, 'Fjord Trip.JPG', 'blog/trip', { originals: true });
  assert.ok(result.original);
  assert.match(result.original.key, /^blog\/trip\/fjord-trip-[0-9a-f]{8}-original\.jpg$/);
  assert.equal(result.original.width, 2000); // rotated, not resized
  assert.equal(result.original.height, 3000);
  const object = result.objects.find((o) => o.key === result.original!.key)!;
  assert.equal(object.contentType, 'image/jpeg');
  assert.equal(object.contentDisposition, 'attachment; filename="fjord-trip.jpg"');
  assert.equal(result.original.bytes, object.body.length);
  const meta = await sharp(object.body).metadata();
  assert.equal(meta.format, 'jpeg');
  assert.equal(meta.exif, undefined);
  assert.equal(meta.xmp, undefined);
  assert.ok(meta.icc, 'ICC profile kept');
  // the web variants are unchanged
  assert.deepEqual(result.widths, [480, 960, 1600, 2000]);
});

test('download copy: png stays png, svg/gif get none', async () => {
  const png = await processImage(await solid(800, 600).png().toBuffer(), 'shot.png', 'blog/p', { originals: true });
  assert.ok(png.original?.key.endsWith('-original.png'));
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>');
  const s = await processImage(svg, 'd.svg', 'blog/p', { originals: true });
  assert.equal(s.original, undefined);
});
