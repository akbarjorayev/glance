import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GlanceApp } from '../scripts/lib/glance-app.mjs';
import { Picture } from '../scripts/lib/picture.mjs';

const SESSION = 'session-1';
const BOX = { columns: 40, rows: 10 };

function pngBytes(width, height) {
  return new Picture(width, height, new Uint8Array(width * height * 4).fill(200)).toPng();
}

// Claude Code's images for SESSION, by number, as paths to fake files.
function appWith(files) {
  const logs = [];
  const images = { find: (session, number) => (session === SESSION && `${number}` in files ? `/claude/${number}.png` : null) };
  const readFile = (path) => files[path.match(/(\d+)\.png$/)[1]];
  return { app: new GlanceApp({ images, readFile, log: (line) => logs.push(line) }), logs };
}

test('an image is painted from Claude Code\'s own file, sized to the box', () => {
  const { app } = appWith({ 3: pngBytes(800, 200) });

  const [painted] = app.paint({ sessionId: SESSION, requests: [{ sources: [{ number: 3 }], box: BOX }] });

  assert.deepEqual([painted.width, painted.height, painted.columns, painted.rows], [800, 200, 40, 5]);
  assert.equal(painted.strips.length, 1);
  assert.equal(painted.sourceIndex, 0);
});

test('when Claude Code\'s file is gone, the next source is used', () => {
  const { app } = appWith({});
  const base64 = pngBytes(10, 10).toString('base64');

  const [painted] = app.paint({ sessionId: SESSION, requests: [{ sources: [{ number: 9 }, { base64 }], box: BOX }] });

  assert.equal(painted.width, 10);
  assert.equal(painted.sourceIndex, 1, 'says which source gave the image');
});

test('an image no source can give is null, and the others still come', () => {
  const { app, logs } = appWith({ 1: pngBytes(4, 4), 2: Buffer.from('GIF89a and more') });

  const results = app.paint({
    sessionId: SESSION,
    requests: [{ sources: [{ number: 2 }], box: BOX }, { sources: [{ number: 5 }], box: BOX }, { sources: [{ number: 1 }], box: BOX }],
  });

  assert.equal(results[0], null);
  assert.equal(results[1], null);
  assert.equal(results[2].width, 4);
  assert.match(logs[0], /not a PNG or JPEG/);
});
