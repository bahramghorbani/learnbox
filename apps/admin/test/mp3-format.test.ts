import { describe, expect, it } from 'vitest';

import { meetsPreferredMp3Format, readMp3Format } from '../lib/server/mp3-format';

function frame(b1: number, b2: number, b3: number): Buffer {
  const bytes = Buffer.alloc(128);
  bytes.set([0xff, b1, b2, b3]);
  return bytes;
}

describe('MP3 format is measured from the bytes', () => {
  it('reads MPEG-1 Layer III 44.1 kHz 128 kbps mono', () => {
    const format = readMp3Format(frame(0xfb, 0x90, 0xc4));
    expect(format).toEqual({
      sampleRateHz: 44100,
      bitrateKbps: 128,
      channels: 1,
      variableBitrate: false,
    });
    expect(meetsPreferredMp3Format(format)).toBe(true);
  });

  it('reads MPEG-2 Layer III 24 kHz 48 kbps mono, which is below the preferred format', () => {
    // MPEG-2 (version bits 10), Layer III, bitrate index 6 (48 kbps), sample index 1 (24 kHz).
    const format = readMp3Format(frame(0xf3, 0x64, 0xc4));
    expect(format).toMatchObject({ sampleRateHz: 24000, bitrateKbps: 48, channels: 1 });
    expect(meetsPreferredMp3Format(format)).toBe(false);
  });

  it('skips an ID3v2 tag before the first frame', () => {
    const id3 = Buffer.from([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 5, 1, 2, 3, 4, 5]);
    const format = readMp3Format(Buffer.concat([id3, frame(0xfb, 0x90, 0x44)]));
    expect(format).toMatchObject({ sampleRateHz: 44100, bitrateKbps: 128, channels: 2 });
  });

  it('flags a VBR stream by its Xing tag', () => {
    const bytes = frame(0xfb, 0x90, 0xc4);
    bytes.write('Xing', 4 + 17, 'ascii');
    const format = readMp3Format(bytes);
    expect(format?.variableBitrate).toBe(true);
    expect(meetsPreferredMp3Format(format)).toBe(false);
  });

  it('returns null for bytes that hold no Layer III frame', () => {
    expect(readMp3Format(Buffer.from('ID3'))).toBeNull();
    expect(readMp3Format(Buffer.from('not audio at all'))).toBeNull();
    expect(meetsPreferredMp3Format(null)).toBe(false);
  });
});
