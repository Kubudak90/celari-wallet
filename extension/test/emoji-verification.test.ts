// extension/test/emoji-verification.test.ts

import {
  EMOJI_ALPHABET,
  EMOJI_ALPHABET_SIZE,
  DEFAULT_EMOJI_GRID_SIZE,
  hashToEmoji,
  hashToEmojiArray,
} from "../public/src/lib/emoji-verification.js";

describe("emoji-verification", () => {
  it("alphabet is exactly 256 distinct emojis (8 bits/emoji)", () => {
    expect(EMOJI_ALPHABET_SIZE).toBe(256);
    expect(EMOJI_ALPHABET).toHaveLength(256);
    expect(new Set(EMOJI_ALPHABET).size).toBe(256); // all distinct
  });

  it("default grid size is 9 (3x3)", () => {
    expect(DEFAULT_EMOJI_GRID_SIZE).toBe(9);
    expect(hashToEmojiArray("00".repeat(32))).toHaveLength(9);
  });

  it("maps each hash byte to EMOJI_ALPHABET[byte % 256] (matches SDK algorithm)", () => {
    // bytes 0,1,2,3,4,5,6,7,8 -> alphabet[0..8]
    const hash = "000102030405060708";
    expect(hashToEmojiArray(hash)).toEqual(EMOJI_ALPHABET.slice(0, 9));
    expect(hashToEmoji(hash)).toBe(EMOJI_ALPHABET.slice(0, 9).join(""));
  });

  it("is deterministic and count-bounded", () => {
    const hash = "ff".repeat(32);
    expect(hashToEmoji(hash)).toBe(hashToEmoji(hash));
    expect(hashToEmojiArray(hash, 3)).toHaveLength(3);
    expect(hashToEmojiArray(hash, 3)).toEqual([EMOJI_ALPHABET[255], EMOJI_ALPHABET[255], EMOJI_ALPHABET[255]]);
  });

  it("hashToEmoji equals the joined array form", () => {
    const hash = "1a2b3c4d5e6f70819200a1b2c3d4e5f6";
    expect(hashToEmoji(hash)).toBe(hashToEmojiArray(hash).join(""));
  });
});
