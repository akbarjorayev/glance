import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FileOpener } from '../scripts/lib/file-opener.mjs';

const FILE = 'C:/Temp/claude/p/s/images/2.png';

function opener(platform) {
  const started = [];
  const start = (command, args) => started.push([command, ...args]);
  return { opener: new FileOpener({ platform, start }), started };
}

test('Windows opens the file in its default app', () => {
  const { opener: windows, started } = opener('win32');
  windows.open(FILE);

  assert.deepEqual(started, [['rundll32', 'url.dll,FileProtocolHandler', FILE]]);
});

test('macOS uses open, and Linux xdg-open', () => {
  const mac = opener('darwin');
  const linux = opener('linux');
  mac.opener.open(FILE);
  linux.opener.open(FILE);

  assert.deepEqual(mac.started, [['open', FILE]]);
  assert.deepEqual(linux.started, [['xdg-open', FILE]]);
});
