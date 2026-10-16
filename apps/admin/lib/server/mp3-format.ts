/**
 * Reads the real format of an MP3 from its bytes.
 *
 * Owner rule (2026-10-16): the audio standard is checked on the returned file, never inferred from
 * the name of a request parameter. The first MPEG audio frame header after an optional ID3v2 tag
 * is decoded; the sample rate and channel mode are fixed for a stream, and the bitrate of the
 * first frame is reported (a VBR stream is flagged by its Xing/Info tag).
 */
export interface Mp3Format {
  sampleRateHz: number;
  bitrateKbps: number;
  channels: 1 | 2;
  variableBitrate: boolean;
}

// MPEG-1 Layer III and MPEG-2/2.5 Layer III bitrate tables (kbps), index 1..14.
const BITRATES_V1_L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const BITRATES_V2_L3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
const SAMPLE_RATES: Record<number, number[]> = {
  3: [44100, 48000, 32000], // MPEG-1
  2: [22050, 24000, 16000], // MPEG-2
  0: [11025, 12000, 8000], // MPEG-2.5
};

function skipId3(bytes: Buffer): number {
  if (bytes.length < 10 || bytes.subarray(0, 3).toString('ascii') !== 'ID3') return 0;
  const size =
    ((bytes[6]! & 0x7f) << 21) |
    ((bytes[7]! & 0x7f) << 14) |
    ((bytes[8]! & 0x7f) << 7) |
    (bytes[9]! & 0x7f);
  const footer = (bytes[5]! & 0x10) !== 0 ? 10 : 0;
  return 10 + size + footer;
}

/** Returns the measured format, or null when no valid Layer III frame header is found. */
export function readMp3Format(bytes: Buffer): Mp3Format | null {
  const start = skipId3(bytes);
  const limit = Math.min(bytes.length - 4, start + 64 * 1024);
  for (let offset = start; offset <= limit; offset += 1) {
    if (bytes[offset] !== 0xff || (bytes[offset + 1]! & 0xe0) !== 0xe0) continue;
    const b1 = bytes[offset + 1]!;
    const b2 = bytes[offset + 2]!;
    const b3 = bytes[offset + 3]!;
    const version = (b1 >> 3) & 0x03; // 3 = MPEG-1, 2 = MPEG-2, 0 = MPEG-2.5, 1 reserved
    const layer = (b1 >> 1) & 0x03; // 1 = Layer III
    const bitrateIndex = (b2 >> 4) & 0x0f;
    const sampleIndex = (b2 >> 2) & 0x03;
    if (version === 1 || layer !== 1 || bitrateIndex === 0 || bitrateIndex === 15) continue;
    if (sampleIndex === 3) continue;
    const sampleRateHz = SAMPLE_RATES[version]![sampleIndex]!;
    const bitrateKbps = (version === 3 ? BITRATES_V1_L3 : BITRATES_V2_L3)[bitrateIndex]!;
    const channels: 1 | 2 = ((b3 >> 6) & 0x03) === 3 ? 1 : 2;
    // The Xing/Info tag sits after the side information of the first frame.
    const sideInfo = version === 3 ? (channels === 1 ? 17 : 32) : channels === 1 ? 9 : 17;
    const tagAt = offset + 4 + sideInfo;
    const tag = bytes.subarray(tagAt, tagAt + 4).toString('ascii');
    return { sampleRateHz, bitrateKbps, channels, variableBitrate: tag === 'Xing' };
  }
  return null;
}

/** The approved target (PDR-010 / owner 2026-10-16): MP3, 44.1 kHz, 128 kbps. */
export const PREFERRED_MP3_FORMAT = { sampleRateHz: 44100, bitrateKbps: 128 } as const;

export function meetsPreferredMp3Format(format: Mp3Format | null): boolean {
  return (
    format !== null &&
    format.sampleRateHz === PREFERRED_MP3_FORMAT.sampleRateHz &&
    format.bitrateKbps === PREFERRED_MP3_FORMAT.bitrateKbps &&
    !format.variableBitrate
  );
}
