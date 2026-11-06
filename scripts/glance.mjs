#!/usr/bin/env node
// What the hooks module calls, since it has no Node. It writes nothing to
// disk: it reads images where Claude Code keeps them (or takes their bytes on
// stdin), and prints one line of JSON.
//
//   paint   stdin: {"sessionId", "requests": [{"sources", "box"}]}
//           stdout: an answer per request (see GlanceApp.paint)
//   open    stdin: {"sessionId", "number"}
//           opens Claude Code's file of "[Image #n]" in the system's image
//           viewer, at full quality; stdout: {"opened": true | false}
//
// On a failure it prints the reason to stderr and exits 1.
import { spawn } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { ClaudeImages } from './lib/claude-images.mjs';
import { FileOpener } from './lib/file-opener.mjs';
import { GlanceApp } from './lib/glance-app.mjs';

const log = (line) => process.stderr.write(`${line}\n`);
const images = new ClaudeImages({
  platform: process.platform,
  env: process.env,
  uid: process.getuid?.() ?? null,
  listDir: (path) => readdirSync(path),
});
const app = new GlanceApp({ images, readFile: (path) => readFileSync(path), log });
// The viewer outlives this script, so it is started detached and let go.
const start = (command, args) => spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true }).unref();
const opener = new FileOpener({ platform: process.platform, start });

const readInput = () => JSON.parse(readFileSync(0, 'utf8'));

const COMMANDS = {
  paint: () => app.paint(readInput()),
  open: () => {
    const { sessionId, number } = readInput();
    const file = images.find(sessionId, number);
    if (file) opener.open(file);
    return { opened: Boolean(file) };
  },
};

try {
  const [command] = process.argv.slice(2);
  const run = COMMANDS[command];
  if (!run) throw new Error(`unknown command: ${command}`);
  process.stdout.write(`${JSON.stringify(run())}\n`);
} catch (error) {
  log(error?.stack ?? error);
  process.exitCode = 1;
}
