import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';

const CHANNELS = 4;
// jpeg-js refuses big pictures unless told how much memory it may use.
const MAX_JPEG_MEMORY_MB = 1024;

export class UnsupportedImageError extends Error {}

// Pixel values are stored gamma-encoded (sRGB); light mixes in linear terms.
// Averaging encoded values darkens: a thin white line on black fades away.
const TO_LINEAR = Float64Array.from({ length: 256 }, (_, value) => {
  const v = value / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
});

function toEncoded(linear) {
  const v = linear <= 0.0031308 ? linear * 12.92 : 1.055 * linear ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, v)) * 255);
}

// Each format by the bytes it starts with: a file's name or a stated type
// can be wrong, its first bytes can't.
const DECODERS = [
  {
    signature: [0x89, 0x50, 0x4e, 0x47],
    decode: (bytes) => PNG.sync.read(Buffer.from(bytes)),
  },
  {
    signature: [0xff, 0xd8, 0xff],
    decode: (bytes) => jpeg.decode(bytes, { useTArray: true, maxMemoryUsageInMB: MAX_JPEG_MEMORY_MB }),
  },
];

// An immutable grid of RGBA pixels.
export class Picture {
  constructor(width, height, rgba) {
    if (rgba.length !== width * height * CHANNELS) throw new RangeError('pixel count does not match the size');
    this.width = width;
    this.height = height;
    this.rgba = rgba;
  }

  static decode(bytes) {
    const decoder = DECODERS.find(({ signature }) => signature.every((byte, index) => bytes[index] === byte));
    if (!decoder) throw new UnsupportedImageError('not a PNG or JPEG image');
    const { width, height, data } = decoder.decode(bytes);
    return new Picture(width, height, new Uint8Array(data.buffer, data.byteOffset, data.length));
  }

  pixel(x, y) {
    const at = (y * this.width + x) * CHANNELS;
    return Array.from(this.rgba.subarray(at, at + CHANNELS));
  }

  // The same picture at most `maxSide` pixels on its longer side.
  fittedWithin(maxSide) {
    const scale = Math.min(1, maxSide / Math.max(this.width, this.height));
    if (scale === 1) return this;
    return this.resized(Math.max(1, Math.round(this.width * scale)), Math.max(1, Math.round(this.height * scale)));
  }

  // Each new pixel is the average of the source pixels it covers, mixed in
  // linear light, so shrinking keeps detail instead of skipping or darkening
  // it; enlarging just repeats pixels.
  resized(width, height) {
    const out = new Uint8Array(width * height * CHANNELS);
    for (let y = 0; y < height; y++) {
      const [top, bottom] = span(y, height, this.height);
      for (let x = 0; x < width; x++) {
        const [left, right] = span(x, width, this.width);
        out.set(this.#average(left, right, top, bottom), (y * width + x) * CHANNELS);
      }
    }
    return new Picture(width, height, out);
  }

  toPng() {
    const png = new PNG({ width: this.width, height: this.height });
    png.data.set(this.rgba);
    return PNG.sync.write(png);
  }

  #average(left, right, top, bottom) {
    const sum = [0, 0, 0, 0];
    for (let y = top; y < bottom; y++) {
      for (let x = left; x < right; x++) {
        const at = (y * this.width + x) * CHANNELS;
        sum[0] += TO_LINEAR[this.rgba[at]];
        sum[1] += TO_LINEAR[this.rgba[at + 1]];
        sum[2] += TO_LINEAR[this.rgba[at + 2]];
        sum[3] += this.rgba[at + 3];
      }
    }
    const count = (right - left) * (bottom - top);
    return [toEncoded(sum[0] / count), toEncoded(sum[1] / count), toEncoded(sum[2] / count), Math.round(sum[3] / count)];
  }
}

// The source pixels [start, end) that target pixel `index` covers: at least one.
function span(index, targetSize, sourceSize) {
  const start = Math.floor((index * sourceSize) / targetSize);
  const end = Math.max(start + 1, Math.floor(((index + 1) * sourceSize) / targetSize));
  return [start, Math.min(end, sourceSize)];
}
