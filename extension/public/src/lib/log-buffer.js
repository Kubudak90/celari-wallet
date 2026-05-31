// extension/public/src/lib/log-buffer.js
// Tiny in-memory ring buffer for popup-side log capture. No persistence —
// it reflects the current popup session, which is what the Logs screen shows.
export function createLogBuffer(max = 200) {
  const entries = [];
  return {
    push(level, args, t) {
      const message = Array.isArray(args)
        ? args
            .map((a) => (typeof a === "string" ? a : safeStringify(a)))
            .join(" ")
        : String(args);
      entries.push({ level, message, t });
      if (entries.length > max) entries.splice(0, entries.length - max);
    },
    getAll() {
      return entries.slice();
    },
    clear() {
      entries.length = 0;
    },
  };
}

function safeStringify(v) {
  try {
    return typeof v === "object" ? JSON.stringify(v) : String(v);
  } catch {
    return String(v);
  }
}
