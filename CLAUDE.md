# glance

Claude Code plugin that shows pasted images as previews in the terminal: above the prompt while it's written, under the message once sent, and full size in a pane. This file is the spec: read it before changing behavior, and update it when behavior changes.

## Commands
- Unit tests: `npm test` (the scripts in `tests/`)
- Hooks module tests: `claude plugin test .` (the `*.test.ts(x)` files in `hooks/`)
- Validate the plugin: `claude plugin validate .`
- Run locally: `claude --plugin-dir .`
- Script directly: `node scripts/glance.mjs <paint|open>` with a JSON request on stdin (see its header)

## Where the images come from
Glance saves nothing. Claude Code already keeps every image:
- **Each paste, the moment it lands,** as `<root>/<project>/<session>/images/<n>.<ext>`, where `<n>` is the number in `[Image #n]`. `<root>` is `%TEMP%\claude` on Windows and `/tmp/claude-<uid>` elsewhere, both under `CLAUDE_CODE_TMPDIR` when it's set (`lib/claude-images.mjs`).
- **Every sent image, in the chat itself,** read with `$.session.messages({ as: 'api' })`. This is the fallback when the temp files are gone, as in an old chat after a cleanup.

Previews are painted in memory and kept in `$.state`, which Claude Code holds for the session and never writes to disk.

## How it fits together
- `hooks/register.tsx` is a hooks module. It has no Node, so it only finds images and draws them:
  - `session.start` starts the draft check and, in the background, rebuilds the last 30 sent messages' previews from the chat.
  - **Draft check, every 200ms:** reads the prompt box (`$.prompt.read`). Pasting an image raises no edit until the next key, so a timer is how the preview appears at once. `DraftWatcher` paints new `[Image #n]` placeholders from Claude Code's files and drops deleted ones. An unchanged draft costs nothing, and a paste whose file isn't written yet is tried again.
  - `prompt.submit` moves the draft's previews under the sent message. A `.catch` lets the prompt through whatever goes wrong.
  - `ui.render` on `AbovePrompt` (the draft, yielding to surveys) and on `UserMessage` (sent messages) draws the tiles (see Drawing rules).
  - `ui.render` on the `glance-view` Pane paints the pressed image again to fill the pane.
  - `hooks/transcript.ts` holds the pure logic: finding pasted images in the chat (inline image blocks of user messages, without Claude Code's added text blocks and tool results), placeholders, labels, matching and merging.
- `scripts/glance.mjs` is the thin CLI the module calls. It prints one line of JSON, or exits 1 with the reason on stderr:
  - `paint` takes requests whose sources are tried in order, `{ number }` (Claude Code's file) then `{ base64 }` (bytes from the chat).
  - `open` opens Claude Code's file of `[Image #n]` in the system's image viewer, started detached.
  - `lib/glance-app.mjs` reads each source, decodes and paints it, and says which source gave the image.
  - `lib/picture.mjs` decodes PNG and JPEG (`pngjs`, `jpeg-js`), recognized by their first bytes rather than a name, and resizes by area averaging in linear light so thin bright lines don't fade.
  - `lib/cells.mjs` paints `Raster` cells. Each cell is sampled on an 8×8 grid, and of the glyphs in `lib/glyphs.mjs` (halves, quadrants, eighths) it gets the one whose shape, in its two best colors, differs least from the picture. Rows are cut into strips because a Raster paints at most 1024 color pairs.
  - `lib/fit.mjs` fits a picture into a box of cells.
  - `lib/claude-images.mjs` finds Claude Code's file of a paste, and `lib/file-opener.mjs` opens a file with the system's default app.

## Drawing rules
- Glance draws with block characters (`Raster`) in every terminal. It never uses Claude Code's `Image` element, which only works in a few terminals.
- **Tiles:** every preview, above the prompt and under a message, is a frame of one size: a fixed 24×6 picture area inside a round border, with a **Preview** button under it. The image is fitted into the area and centered, so all tiles line up whatever the shapes. Tiles that don't fit across become `+N more`.
- **Full view:** the pane paints the image again at the pane's size. A terminal can't show full quality, so the pane offers **Open original**, which opens Claude Code's own file in the system's image viewer (`lib/file-opener.mjs`, script `open`). An image known only from the chat has no file, so it gets no button: glance never writes one.
- A cell is about twice as tall as wide (`lib/fit.mjs`).
- **The quality ceiling:** a cell shows one glyph in two colors. Shapes, layout and colors come through, but small text in a screenshot can't be read. Plugins can't send raw graphics to a terminal, so nothing in glance can lift this.
- To judge drawing quality, render the cells to a PNG (each glyph's mask in its two colors) and look at it, instead of guessing.
- Only the terminal draws tiles. On other surfaces the message is left as the engine draws it.

## Product rules (non-negotiable)
- Zero setup: it works with defaults. Node.js is the only requirement.
- Save nothing: no files, no caches on disk. Read images where Claude Code keeps them.
- A preview is never worth interrupting anyone: no messages on failure. Details go to the debug log (`$.ui.log(..., { to: 'debug' })`). The one exception is a missing Node.js, which only the person can fix: one toast per session.
- Never slow down or block typing or a prompt.
- Images stay on the machine. Nothing is uploaded.
- YAGNI: no feature, setting or abstraction without a user-facing reason.

## Code conventions
- Small single-purpose classes and pure functions in `scripts/lib/`. Keep `glance.mjs` as wiring. OS differences live only in `lib/claude-images.mjs` and `lib/file-opener.mjs`.
- In `hooks/`, the engine's `$` may only be called, never stored or passed on. Pass plain functions into classes (see `compose`).
- Inject I/O and environment (`listDir`, `readFile`, `env`, `start`, runners) so behavior is testable without them.
- Follow the global coding standards (OOP where it suits, SOLID, KISS, DRY, YAGNI) with judgment.

## Testing
- Test behavior. The hooks tests stand in for the engine with hooks (`state.get`, `process.run`, `prompt.read`, `ui.open`) and drive the draft check with `mock.clock`.
- Check the real paths with headless runs as well. For example, run `claude -p --resume <a test session with an image> --plugin-dir . "..."` and check that nothing is written. Use a session made for testing, never someone's real chat.
- Every bug fix gets a regression test.
- Only Windows can be run here. Review macOS and Linux paths by reading, and say so in the README.

## Releasing
Bump `version` in `.claude-plugin/plugin.json` and `package.json` together, following semver. Claude Code only updates users whose computed version differs, so a push without a bump reaches nobody. Keep `package-lock.json` committed: Claude Code installs the dependencies from it.

## Known gaps
- After `/compact`, the compacted messages leave the chat history; once Claude Code's temp files are gone too, their previews can't be rebuilt.
- Only PNG and JPEG are decoded. A WebP or GIF paste shows "no preview".
