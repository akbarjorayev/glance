import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitCells } from '../scripts/lib/fit.mjs';

const BOX = { columns: 40, rows: 10 };

test('a wide picture fills the box width', () => {
  assert.deepEqual(fitCells({ width: 800, height: 200 }, BOX), { columns: 40, rows: 5 });
});

test('a tall picture fills the box height, two pixels per cell row', () => {
  assert.deepEqual(fitCells({ width: 100, height: 400 }, BOX), { columns: 5, rows: 10 });
});

test('a small picture is scaled up to the box', () => {
  assert.deepEqual(fitCells({ width: 8, height: 4 }, BOX), { columns: 40, rows: 10 });
});

test('a sliver never shrinks below one cell', () => {
  assert.deepEqual(fitCells({ width: 4000, height: 1 }, BOX), { columns: 40, rows: 1 });
});
