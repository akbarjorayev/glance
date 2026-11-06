import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';
import { Picture, UnsupportedImageError } from '../scripts/lib/picture.mjs';

const RED = [255, 0, 0, 255];
const BLUE = [0, 0, 255, 255];

// Left half red, right half blue.
function halves(width, height) {
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) rgba.set(x < width / 2 ? RED : BLUE, (y * width + x) * 4);
  }
  return new Picture(width, height, rgba);
}

test('decodes a PNG', () => {
  const png = new PNG({ width: 2, height: 1 });
  png.data.set([...RED, ...BLUE]);
  const picture = Picture.decode(PNG.sync.write(png));

  assert.equal(picture.width, 2);
  assert.deepEqual(picture.pixel(1, 0), BLUE);
});

test('decodes a JPEG, known by its bytes rather than a name', () => {
  const source = halves(16, 16);
  const bytes = jpeg.encode({ width: 16, height: 16, data: Buffer.from(source.rgba) }, 100).data;
  const picture = Picture.decode(bytes);

  assert.equal(picture.height, 16);
  assert.ok(picture.pixel(0, 0)[0] > 200, 'left stays red');
  assert.ok(picture.pixel(15, 0)[2] > 200, 'right stays blue');
});

test('refuses a format it cannot read', () => {
  assert.throws(() => Picture.decode(Buffer.from('GIF89a and the rest')), UnsupportedImageError);
});

test('shrinking averages the pixels each new pixel covers', () => {
  const small = halves(4, 2).resized(2, 1);

  assert.deepEqual(small.pixel(0, 0), RED);
  assert.deepEqual(small.pixel(1, 0), BLUE);
});

test('shrinking mixes colors as light does, so thin bright lines do not fade', () => {
  // Half white, half black: the eye sees the gray sRGB 188, not the darker 128.
  const stripes = new Picture(2, 1, Uint8Array.of(255, 255, 255, 255, 0, 0, 0, 255));

  assert.deepEqual(stripes.resized(1, 1).pixel(0, 0), [188, 188, 188, 255]);
});

test('enlarging repeats pixels', () => {
  const big = halves(2, 1).resized(4, 2);

  assert.deepEqual(big.pixel(1, 1), RED);
  assert.deepEqual(big.pixel(2, 1), BLUE);
});

test('fitting keeps the shape and never enlarges', () => {
  const fitted = halves(400, 100).fittedWithin(100);

  assert.deepEqual([fitted.width, fitted.height], [100, 25]);
  assert.equal(halves(50, 20).fittedWithin(100).width, 50);
});

test('round-trips through PNG', () => {
  const back = Picture.decode(halves(4, 2).toPng());

  assert.deepEqual(back.pixel(3, 1), BLUE);
});
