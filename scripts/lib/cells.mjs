import { GLYPHS, GRID, SOLID } from './glyphs.mjs';

// Paints a picture as terminal cells for `Raster`. Each cell is fitted on its
// own: of every glyph, the one whose shape, filled with the two best colors,
// differs least from that patch of the picture. Picking shapes this way keeps
// edges and text strokes sharp where one color per half cell would smear them.
const SPACE = 0x20;
const TERMINAL_DEFAULT = 0x01000000;
const VISIBLE_ALPHA = 128;
const SUBPIXELS = GRID * GRID;
const WORDS_PER_CELL = 3;
// Claude Code paints this many color pairs per Raster and the rest as their
// nearest, so a picture is cut into strips that each stay within it.
const MAX_PAIRS_PER_RASTER = 1024;

export function paintCells(picture, { columns, rows }, { maxPairs = MAX_PAIRS_PER_RASTER } = {}) {
  const sized = picture.width === columns * GRID && picture.height === rows * GRID
    ? picture
    : picture.resized(columns * GRID, rows * GRID);
  const cellRows = Array.from({ length: rows }, (_, row) =>
    Array.from({ length: columns }, (_, column) => fitCell(sized, column, row)),
  );
  return { columns, rows, strips: stripsOf(cellRows, maxPairs) };
}

function fitCell(picture, column, row) {
  const { colors, alpha } = cellPixels(picture, column, row);
  if (alpha < VISIBLE_ALPHA) return [SPACE, TERMINAL_DEFAULT, TERMINAL_DEFAULT];

  const total = [0, 0, 0];
  let totalSquares = 0;
  for (let i = 0; i < SUBPIXELS; i++) {
    for (let c = 0; c < 3; c++) {
      total[c] += colors[i * 3 + c];
      totalSquares += colors[i * 3 + c] ** 2;
    }
  }

  let best = { glyph: SOLID, error: totalSquares - squaredLength(total) / SUBPIXELS, inside: total, count: SUBPIXELS };
  for (const glyph of GLYPHS) {
    if (glyph === SOLID) continue;
    const inside = [0, 0, 0];
    let count = 0;
    for (let i = 0; i < SUBPIXELS; i++) {
      if (!glyph.mask[i]) continue;
      count++;
      for (let c = 0; c < 3; c++) inside[c] += colors[i * 3 + c];
    }
    const outside = total.map((sum, c) => sum - inside[c]);
    // Squared error of painting each part in its mean color.
    const error = totalSquares - squaredLength(inside) / count - squaredLength(outside) / (SUBPIXELS - count);
    if (error < best.error) best = { glyph, error, inside, count };
  }

  const { glyph, inside, count } = best;
  const foreground = packColor(inside.map((sum) => sum / count));
  if (count === SUBPIXELS) return [glyph.codePoint, foreground, foreground];
  const background = packColor(total.map((sum, c) => (sum - inside[c]) / (SUBPIXELS - count)));
  return [glyph.codePoint, foreground, background];
}

// The cell's 64 colors, laid on black where they are partly see-through, and
// its mean opacity.
function cellPixels(picture, column, row) {
  const colors = new Float64Array(SUBPIXELS * 3);
  let alphaSum = 0;
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const [red, green, blue, alpha] = picture.pixel(column * GRID + x, row * GRID + y);
      const at = (y * GRID + x) * 3;
      const opacity = alpha / 255;
      colors[at] = red * opacity;
      colors[at + 1] = green * opacity;
      colors[at + 2] = blue * opacity;
      alphaSum += alpha;
    }
  }
  return { colors, alpha: alphaSum / SUBPIXELS };
}

function stripsOf(cellRows, maxPairs) {
  const strips = [];
  let current = [];
  let pairs = new Set();
  for (const cells of cellRows) {
    const rowPairs = cells.map(([, fg, bg]) => `${fg}:${bg}`);
    const merged = new Set([...pairs, ...rowPairs]);
    if (current.length > 0 && merged.size > maxPairs) {
      strips.push(encode(current));
      current = [];
      pairs = new Set(rowPairs);
    } else {
      pairs = merged;
    }
    current.push(cells);
  }
  if (current.length > 0) strips.push(encode(current));
  return strips;
}

function encode(rows) {
  const words = Uint32Array.from(rows.flat(2));
  // Uint32Array is little-endian on every platform Node runs on, as Raster expects.
  return { rows: rows.length, cells: Buffer.from(words.buffer).toString('base64') };
}

function squaredLength([red, green, blue]) {
  return red * red + green * green + blue * blue;
}

function packColor([red, green, blue]) {
  return (Math.round(red) << 16) | (Math.round(green) << 8) | Math.round(blue);
}
