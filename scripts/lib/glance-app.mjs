import { paintCells } from './cells.mjs';
import { fitCells } from './fit.mjs';
import { Picture } from './picture.mjs';

// Paints images as terminal cells. Glance keeps nothing of its own: an image
// is read from where Claude Code keeps it, painted in memory and handed back.
export class GlanceApp {
  #images;
  #readFile;
  #log;

  // `images.find(sessionId, number)` gives the path of Claude Code's copy of
  // a pasted image, or null; `readFile(path)` gives its bytes.
  constructor({ images, readFile, log }) {
    this.#images = images;
    this.#readFile = readFile;
    this.#log = log;
  }

  // Each request lists its sources in order of preference, `{ number }` for
  // Claude Code's file of "[Image #n]" or `{ base64 }` for bytes at hand, and
  // the box of cells to fit. The answer for each is the picture's size, its
  // cells and which source gave it (`sourceIndex`); or null when no source
  // gives an image.
  paint({ sessionId, requests }) {
    return requests.map(({ sources, box }) => {
      for (const [sourceIndex, source] of sources.entries()) {
        const found = this.#open(sessionId, source);
        if (!found) continue;
        return { width: found.width, height: found.height, ...paint(found, box), sourceIndex };
      }
      return null;
    });
  }

  #open(sessionId, source) {
    const file = source.number === undefined ? null : this.#images.find(sessionId, source.number);
    if (source.number !== undefined && !file) return null;
    try {
      return Picture.decode(file ? this.#readFile(file) : Buffer.from(source.base64, 'base64'));
    } catch (error) {
      this.#log(`could not read ${file ?? 'image'}: ${error?.message ?? error}`);
      return null;
    }
  }
}

function paint(picture, box) {
  return paintCells(picture, fitCells(picture, box));
}

