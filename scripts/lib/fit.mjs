// A terminal cell is about twice as tall as it is wide, so one cell shows two
// square pixels stacked: the top half and the bottom half.
export const PIXELS_PER_CELL_ROW = 2;

// The largest box of cells inside `box` that keeps the picture's shape.
export function fitCells({ width, height }, { columns, rows }) {
  const scale = Math.min(columns / width, (rows * PIXELS_PER_CELL_ROW) / height);
  return {
    columns: Math.max(1, Math.round(width * scale)),
    rows: Math.max(1, Math.round((height * scale) / PIXELS_PER_CELL_ROW)),
  };
}
