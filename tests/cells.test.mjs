import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Picture } from '../scripts/lib/picture.mjs';
import { paintCells } from '../scripts/lib/cells.mjs';

const WHITE = [255, 255, 255, 255];
const BLACK = [0, 0, 0, 255];
const CLEAR = [0, 0, 0, 0];
const TERMINAL_DEFAULT = 0x01000000;

// A picture of one 8×8 cell per `cells` entry, side by side, where
// `paint(x, y)` gives each pixel's color.
function cellsPicture(columns, rows, paint) {
  const width = columns * 8;
  const height = rows * 8;
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) rgba.set(paint(x, y), (y * width + x) * 4);
  return new Picture(width, height, rgba);
}

// The [codePoint, foreground, background] of every cell, row by row.
function decode({ strips }) {
  return strips.flatMap(({ cells }) => {
    const bytes = Buffer.from(cells, 'base64');
    const words = new Uint32Array(bytes.buffer, bytes.byteOffset, bytes.length / 4);
    const triplets = [];
    for (let at = 0; at < words.length; at += 3) triplets.push([words[at], words[at + 1], words[at + 2]]);
    return triplets;
  });
}

// What a cell looks like on screen: the color of each of its four quarters.
function quarters([codePoint, fg, bg]) {
  const shapes = { 0x2588: '1111', 0x2580: '1100', 0x258c: '1010', 0x2598: '1000', 0x259d: '0100', 0x2596: '0010', 0x2597: '0001', 0x259a: '1001' };
  return [...shapes[codePoint]].map((bit) => (bit === '1' ? fg : bg));
}

test('a cell of one color is drawn solid in that color', () => {
  const [cell] = decode(paintCells(cellsPicture(1, 1, () => [255, 136, 0, 255]), { columns: 1, rows: 1 }));

  assert.deepEqual(quarters(cell), [0xff8800, 0xff8800, 0xff8800, 0xff8800]);
});

test('a vertical edge is drawn as a left half, not blurred into one color', () => {
  const [cell] = decode(paintCells(cellsPicture(1, 1, (x) => (x < 4 ? WHITE : BLACK)), { columns: 1, rows: 1 }));

  assert.deepEqual(quarters(cell), [0xffffff, 0x000000, 0xffffff, 0x000000]);
});

test('a corner is drawn as a quadrant', () => {
  const picture = cellsPicture(1, 1, (x, y) => (x >= 4 && y < 4 ? WHITE : BLACK));
  const [cell] = decode(paintCells(picture, { columns: 1, rows: 1 }));

  assert.deepEqual(quarters(cell), [0x000000, 0xffffff, 0x000000, 0x000000]);
});

test('a thin line keeps its place in the cell', () => {
  const picture = cellsPicture(1, 1, (x, y) => (y === 7 ? WHITE : BLACK));
  const [[codePoint, fg, bg]] = decode(paintCells(picture, { columns: 1, rows: 1 }));

  assert.equal(codePoint, 0x2581);
  assert.deepEqual([fg, bg], [0xffffff, 0x000000]);
});

test('cells are laid out row by row', () => {
  const picture = cellsPicture(2, 2, (x, y) => (x >= 8 && y >= 8 ? WHITE : BLACK));
  const cells = decode(paintCells(picture, { columns: 2, rows: 2 }));

  assert.deepEqual(cells.map(quarters).map((q) => q[0]), [0, 0, 0, 0xffffff]);
});

test('a see-through cell shows the terminal background', () => {
  const [[, fg, bg]] = decode(paintCells(cellsPicture(1, 1, () => CLEAR), { columns: 1, rows: 1 }));

  assert.deepEqual([fg, bg], [TERMINAL_DEFAULT, TERMINAL_DEFAULT]);
});

test('rows are split into strips so no strip has more color pairs than the terminal paints', () => {
  // Each row a different gray: one color pair per row.
  const picture = cellsPicture(1, 5, (x, y) => [y * 8, y * 8, y * 8, 255]);
  const painted = paintCells(picture, { columns: 1, rows: 5 }, { maxPairs: 2 });

  assert.deepEqual(painted.strips.map((strip) => strip.rows), [2, 2, 1]);
  assert.equal(decode(painted).length, 5);
});
