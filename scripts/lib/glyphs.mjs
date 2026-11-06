// The block characters glance draws with, each as the part of the cell it
// fills on an 8×8 grid. A cell shows one glyph in two colors (foreground on
// background), so a glyph and its swapped colors cover a shape and its
// inverse: halves, quarters and eighths together trace edges far more
// closely than plain half blocks. Terminals such as Windows Terminal draw
// these characters themselves, edge to edge, whatever the font.
export const GRID = 8;

// [code point, filled rectangles as [left, top, right, bottom) in grid units]
const SHAPES = [
  [0x2588, [[0, 0, 8, 8]]], // █ full: a cell of one color
  [0x2580, [[0, 0, 8, 4]]], // ▀ upper half
  [0x258c, [[0, 0, 4, 8]]], // ▌ left half
  [0x2594, [[0, 0, 8, 1]]], // ▔ upper eighth
  [0x2582, [[0, 6, 8, 8]]], // ▂ lower quarter
  [0x2583, [[0, 5, 8, 8]]], // ▃ lower three eighths
  [0x2585, [[0, 3, 8, 8]]], // ▅ lower five eighths
  [0x2586, [[0, 2, 8, 8]]], // ▆ lower three quarters
  [0x2581, [[0, 7, 8, 8]]], // ▁ lower eighth
  [0x2587, [[0, 1, 8, 8]]], // ▇ lower seven eighths
  [0x258f, [[0, 0, 1, 8]]], // ▏ left eighth
  [0x258e, [[0, 0, 2, 8]]], // ▎ left quarter
  [0x258d, [[0, 0, 3, 8]]], // ▍ left three eighths
  [0x258b, [[0, 0, 5, 8]]], // ▋ left five eighths
  [0x258a, [[0, 0, 6, 8]]], // ▊ left three quarters
  [0x2589, [[0, 0, 7, 8]]], // ▉ left seven eighths
  [0x2598, [[0, 0, 4, 4]]], // ▘ upper left quadrant
  [0x259d, [[4, 0, 8, 4]]], // ▝ upper right quadrant
  [0x2596, [[0, 4, 4, 8]]], // ▖ lower left quadrant
  [0x2597, [[4, 4, 8, 8]]], // ▗ lower right quadrant
  [0x259a, [[0, 0, 4, 4], [4, 4, 8, 8]]], // ▚ upper left and lower right
];

function maskOf(rectangles) {
  const mask = new Uint8Array(GRID * GRID);
  for (const [left, top, right, bottom] of rectangles) {
    for (let y = top; y < bottom; y++) mask.fill(1, y * GRID + left, y * GRID + right);
  }
  return mask;
}

export const GLYPHS = Object.freeze(
  SHAPES.map(([codePoint, rectangles]) => Object.freeze({ codePoint, mask: maskOf(rectangles) })),
);

// The glyph for a cell that is one color all over.
export const SOLID = GLYPHS[0];
