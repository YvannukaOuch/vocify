import { open } from 'node:fs/promises';

const OPUS_SAMPLE_RATE = 48_000;

/**
 * Duration of an Ogg Opus file in seconds. Reads the pre-skip from the OpusHead
 * packet and the granule position of the final page, so no ffprobe is needed.
 */
export async function oggOpusDuration(path: string): Promise<number> {
  const file = await open(path, 'r');
  try {
    const { size } = await file.stat();

    const head = Buffer.alloc(Math.min(size, 4096));
    await file.read(head, 0, head.length, 0);
    const opusHead = head.indexOf('OpusHead');
    if (opusHead < 0) throw new Error('Not an Ogg Opus file');
    const preSkip = head.readUInt16LE(opusHead + 10);

    const tail = Buffer.alloc(Math.min(size, 65_536));
    await file.read(tail, 0, tail.length, size - tail.length);
    const lastPage = findLastPage(tail);
    if (lastPage < 0) throw new Error('Could not find the last Ogg page');
    const granule = Number(tail.readBigInt64LE(lastPage + 6));

    return Math.max(0, granule - preSkip) / OPUS_SAMPLE_RATE;
  } finally {
    await file.close();
  }
}

/** Offset of the Ogg page that ends exactly at the end of the buffer (guards against "OggS" inside audio data). */
function findLastPage(buffer: Buffer): number {
  for (let at = buffer.lastIndexOf('OggS'); at >= 0; at = at > 0 ? buffer.lastIndexOf('OggS', at - 1) : -1) {
    if (at + 27 > buffer.length || buffer[at + 4] !== 0) continue;
    const segments = buffer[at + 26]!;
    if (at + 27 + segments > buffer.length) continue;
    let bodyLength = 0;
    for (let i = 0; i < segments; i++) bodyLength += buffer[at + 27 + i]!;
    if (at + 27 + segments + bodyLength === buffer.length) return at;
  }
  return -1;
}
