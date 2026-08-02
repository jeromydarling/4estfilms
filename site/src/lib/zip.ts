/**
 * A minimal, streaming, store-only ZIP writer.
 *
 * Store-only (no DEFLATE) is not a shortcut here — the payload is WebP and
 * JPEG, which are already compressed, so deflating them would burn CPU to
 * make the archive very slightly larger. It also means each entry can be
 * written straight through: nothing is buffered except the entry currently
 * being hashed, so a press kit of any size costs the same memory.
 *
 * Deliberately not a dependency: this is ~100 lines of a format that has not
 * changed since 1993, against a package that would ship a DEFLATE
 * implementation we would never call.
 */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Uint8Array, seed = 0): number {
  let c = ~seed >>> 0;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}

const u8 = (n: number) => n & 0xff;
const put32 = (a: number[], n: number) =>
  a.push(u8(n), u8(n >>> 8), u8(n >>> 16), u8(n >>> 24));
const put16 = (a: number[], n: number) => a.push(u8(n), u8(n >>> 8));

/** MS-DOS date/time. Fixed, so the same input always produces the same bytes. */
const DOS_TIME = 0;
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;

export interface ZipEntry {
  name: string;
  body: ArrayBuffer | Uint8Array;
}

/**
 * Builds the archive as a stream. Entries are pulled one at a time, so the
 * caller can fetch each file lazily rather than holding them all at once.
 */
export function zipStream(entries: AsyncIterable<ZipEntry> | Iterable<ZipEntry>): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const central: number[] = [];
      let offset = 0;
      let count = 0;

      for await (const entry of entries as AsyncIterable<ZipEntry>) {
        const name = enc.encode(entry.name);
        const data =
          entry.body instanceof Uint8Array ? entry.body : new Uint8Array(entry.body);
        const crc = crc32(data);

        const local: number[] = [];
        put32(local, 0x04034b50); // local file header
        put16(local, 20); // version needed
        put16(local, 0x0800); // UTF-8 filename
        put16(local, 0); // stored
        put16(local, DOS_TIME);
        put16(local, DOS_DATE);
        put32(local, crc);
        put32(local, data.length); // compressed
        put32(local, data.length); // uncompressed
        put16(local, name.length);
        put16(local, 0); // extra
        controller.enqueue(new Uint8Array(local));
        controller.enqueue(name);
        controller.enqueue(data);

        put32(central, 0x02014b50); // central directory header
        put16(central, 20); // version made by
        put16(central, 20); // version needed
        put16(central, 0x0800);
        put16(central, 0);
        put16(central, DOS_TIME);
        put16(central, DOS_DATE);
        put32(central, crc);
        put32(central, data.length);
        put32(central, data.length);
        put16(central, name.length);
        put16(central, 0); // extra
        put16(central, 0); // comment
        put16(central, 0); // disk
        put16(central, 0); // internal attrs
        put32(central, 0); // external attrs
        put32(central, offset);
        for (const b of name) central.push(b);

        offset += local.length + name.length + data.length;
        count++;
      }

      const dirOffset = offset;
      controller.enqueue(new Uint8Array(central));

      const end: number[] = [];
      put32(end, 0x06054b50); // end of central directory
      put16(end, 0); // disk
      put16(end, 0); // disk with start
      put16(end, count);
      put16(end, count);
      put32(end, central.length);
      put32(end, dirOffset);
      put16(end, 0); // comment length
      controller.enqueue(new Uint8Array(end));

      controller.close();
    },
  });
}
