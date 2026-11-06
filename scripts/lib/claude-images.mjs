// Finds the images Claude Code itself keeps for a session. It saves each
// paste the moment it lands, as <root>/<project>/<session>/images/<n>.<ext>,
// where <n> is the number of its "[Image #n]" placeholder. Glance reads them
// from there and keeps no copies of its own.
//
// <root> is <base>\claude on Windows and <base>/claude-<uid> elsewhere, where
// <base> is CLAUDE_CODE_TMPDIR when set, else %TEMP% on Windows and /tmp
// elsewhere. The project folder is named after a working directory that may
// have moved since, so the session is found by its id instead.
export class ClaudeImages {
  #root;
  #listDir;
  #sessionDirs = new Map();

  // `listDir(path)` returns the names in a folder and throws when it's missing.
  constructor({ platform, env, uid, listDir }) {
    this.#root = rootOf(platform, env, uid);
    this.#listDir = listDir;
  }

  // The path of image `number` of the session, or null when it isn't there.
  find(sessionId, number) {
    const dir = this.#sessionDir(sessionId);
    if (!dir) return null;
    const name = this.#namesIn(dir).find((entry) => entry.startsWith(`${number}.`));
    return name ? `${dir}/${name}` : null;
  }

  #sessionDir(sessionId) {
    if (!this.#sessionDirs.has(sessionId)) {
      const dir = this.#namesIn(this.#root)
        .map((project) => `${this.#root}/${project}/${sessionId}/images`)
        .find((candidate) => this.#exists(candidate));
      this.#sessionDirs.set(sessionId, dir ?? null);
    }
    return this.#sessionDirs.get(sessionId);
  }

  #namesIn(dir) {
    try {
      return this.#listDir(dir);
    } catch {
      return [];
    }
  }

  #exists(dir) {
    try {
      this.#listDir(dir);
      return true;
    } catch {
      return false;
    }
  }
}

function rootOf(platform, env, uid) {
  const isWindows = platform === 'win32';
  const base = env.CLAUDE_CODE_TMPDIR ?? (isWindows ? env.TEMP : '/tmp');
  const trimmed = String(base).replaceAll('\\', '/').replace(/\/+$/, '');
  return isWindows ? `${trimmed}/claude` : `${trimmed}/claude-${uid}`;
}
