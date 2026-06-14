// extension/public/src/lib/emoji-verification.js
//
// Visual connection-verification ("emoji grid"). EMOJI_ALPHABET and hashToEmoji
// are an EXACT copy of @aztec/wallet-sdk (dest/emoji_alphabet.js + dest/crypto.js
// hashToEmoji), so the grid Celari shows is byte-identical to what a dApp renders
// from the same verificationHash — the whole point of visual MITM verification.
// AUTO-GENERATED from @aztec/wallet-sdk@4.3.0. Do not hand-edit the alphabet.

export const EMOJI_ALPHABET = ["😀","😎","🤖","👻","💀","👽","🤡","🎃","😺","😈","👾","🗿","🤠","🥸","🧐","😵","🐶","🐱","🐸","🐵","🦊","🐻","🦁","🐯","🐮","🐷","🐔","🐧","🦉","🦇","🐺","🦄","🐘","🦒","🐊","🦈","🐙","🦋","🐢","🦀","🐍","🦅","🦆","🐳","🦭","🦩","🦚","🐉","🌵","🌴","🌲","🌳","🍄","🌍","🌕","🌙","🌟","🌈","🔥","💧","🌨","💢","🌞","🌤","🍎","🍌","🍇","🍉","🍓","🍍","🥑","🌽","🥕","🍔","🍕","🌮","🍣","🍪","🎂","🍩","🍺","🍷","🍸","🫗","🧃","🥛","🍵","🧁","🍫","🍬","🍭","🥨","🥯","🥞","🧇","🍿","💯","💔","💥","💫","🌀","🫨","🚧","🛑","🔴","🔵","🟢","🟡","🟣","⬛","⬜","🟤","💜","💙","💚","🧡","🖤","🤍","💘","💍","💎","👑","🎩","🧢","🪭","🎗","🎟","🏷","🕐","📱","💻","🖥","📷","🎥","📺","📻","🔋","💡","🔑","🔨","🛠","🧲","🧪","🔬","🔧","🪛","🔩","🪚","🪓","🧹","🪣","🧴","🛁","🚽","🪜","🔔","🕯","🪤","🧯","🪝","🚗","🚌","🚓","🚑","🚒","🚜","🚲","🏍","🛩","🚀","🛸","🚁","🚢","🚤","🚂","🚠","🥅","🏀","🏈","🏐","🏓","🎱","🎯","🎳","🎲","🎮","🕹","🧩","🎴","🎰","🃏","🀄","🎸","🎹","🎺","🎻","🥁","🎷","🎤","🎧","🎨","🖌","🎭","🎪","🎬","🎼","🪕","🪗","🏠","🏰","🗼","🗽","🏛","🕌","🛕","🏯","🎢","🎡","🛖","🏕","🗻","🏝","🌋","🏜","📦","🧳","🕰","🔦","🪫","📡","🔭","🔮","🧿","📿","🫙","💉","🩺","🩹","🧬","🦠","🏆","🎁","🎈","🎀","🪅","🧧","📨","📜","🗃","📎","🪡","🖋","📌","🔐","🧸","🪆"];
export const EMOJI_ALPHABET_SIZE = EMOJI_ALPHABET.length; // 256
export const DEFAULT_EMOJI_GRID_SIZE = 9; // 3x3 grid = 72 bits

/** Map a hex verificationHash to an array of `count` emojis (byte % 256). */
export function hashToEmojiArray(hash, count = DEFAULT_EMOJI_GRID_SIZE) {
  const emojis = [];
  for (let i = 0; i < hash.length && emojis.length < count; i += 2) {
    const byteValue = parseInt(hash.slice(i, i + 2), 16);
    emojis.push(EMOJI_ALPHABET[byteValue % EMOJI_ALPHABET_SIZE]);
  }
  return emojis;
}

/** Joined-string form, identical to the SDK hashToEmoji output. */
export function hashToEmoji(hash, count = DEFAULT_EMOJI_GRID_SIZE) {
  return hashToEmojiArray(hash, count).join("");
}
