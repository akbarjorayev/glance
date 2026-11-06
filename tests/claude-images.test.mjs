import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ClaudeImages } from '../scripts/lib/claude-images.mjs';

const SESSION = 'a1b2c3d4-0000-4000-8000-000000000001';

// A file system of folders and the names in each; any other folder is missing.
function fakeFolders(tree) {
  const listed = [];
  const listDir = (path) => {
    listed.push(path);
    if (!(path in tree)) throw Object.assign(new Error(`ENOENT ${path}`), { code: 'ENOENT' });
    return tree[path];
  };
  return { listDir, listed };
}

test('on Windows the pastes are under %TEMP%\\claude\\<project>\\<session>\\images', () => {
  const { listDir } = fakeFolders({
    'C:/Temp/claude': ['1a2b3c4d5e6f7081', '9f8e7d6c5b4a3921'],
    [`C:/Temp/claude/9f8e7d6c5b4a3921/${SESSION}/images`]: ['6.png', '7.png', '8.png'],
  });
  const images = new ClaudeImages({ platform: 'win32', env: { TEMP: 'C:\\Temp\\' }, uid: null, listDir });

  assert.equal(images.find(SESSION, 7), `C:/Temp/claude/9f8e7d6c5b4a3921/${SESSION}/images/7.png`);
});

test('elsewhere they are under /tmp/claude-<uid>', () => {
  const { listDir } = fakeFolders({
    '/tmp/claude-501': ['proj'],
    [`/tmp/claude-501/proj/${SESSION}/images`]: ['1.jpg'],
  });
  const images = new ClaudeImages({ platform: 'darwin', env: {}, uid: 501, listDir });

  assert.equal(images.find(SESSION, 1), `/tmp/claude-501/proj/${SESSION}/images/1.jpg`);
});

test('CLAUDE_CODE_TMPDIR moves the folder Claude Code nests its own in', () => {
  const { listDir } = fakeFolders({
    '/scratch/claude-0': ['p'],
    [`/scratch/claude-0/p/${SESSION}/images`]: ['2.webp'],
  });
  const images = new ClaudeImages({ platform: 'linux', env: { CLAUDE_CODE_TMPDIR: '/scratch/' }, uid: 0, listDir });

  assert.equal(images.find(SESSION, 2), `/scratch/claude-0/p/${SESSION}/images/2.webp`);
});

test('an image number is matched whole: #1 is not #10', () => {
  const { listDir } = fakeFolders({
    '/tmp/claude-1': ['p'],
    [`/tmp/claude-1/p/${SESSION}/images`]: ['10.png'],
  });
  const images = new ClaudeImages({ platform: 'linux', env: {}, uid: 1, listDir });

  assert.equal(images.find(SESSION, 1), null);
});

test('a missing image or folder is null, and the session folder is looked up once', () => {
  const { listDir, listed } = fakeFolders({
    '/tmp/claude-1': ['a', 'b'],
    [`/tmp/claude-1/b/${SESSION}/images`]: ['1.png'],
  });
  const images = new ClaudeImages({ platform: 'linux', env: {}, uid: 1, listDir });

  assert.equal(images.find(SESSION, 4), null);
  assert.equal(images.find(SESSION, 1), `/tmp/claude-1/b/${SESSION}/images/1.png`);
  assert.equal(images.find('other-session', 1), null);
  assert.equal(listed.filter((path) => path === '/tmp/claude-1').length, 2, 'once per session asked about');
});
