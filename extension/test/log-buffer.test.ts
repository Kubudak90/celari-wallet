import { createLogBuffer } from "../public/src/lib/log-buffer.js";

describe("log-buffer", () => {
  it("stores entries with level, message, and time", () => {
    const b = createLogBuffer(10);
    b.push("info", "hello", 1000);
    expect(b.getAll()).toEqual([{ level: "info", message: "hello", t: 1000 }]);
  });
  it("caps at max size, dropping oldest (ring behaviour)", () => {
    const b = createLogBuffer(3);
    for (let i = 1; i <= 5; i++) b.push("info", "m" + i, i);
    expect(b.getAll().map((e) => e.message)).toEqual(["m3", "m4", "m5"]);
  });
  it("joins non-string args into one message", () => {
    const b = createLogBuffer(5);
    b.push("warn", ["sync at block", 42], 7);
    expect(b.getAll()[0].message).toBe("sync at block 42");
  });
  it("clear empties the buffer", () => {
    const b = createLogBuffer(5);
    b.push("error", "boom", 1);
    b.clear();
    expect(b.getAll()).toEqual([]);
  });
  it("default capacity is 200", () => {
    const b = createLogBuffer();
    for (let i = 0; i < 250; i++) b.push("info", "x", i);
    expect(b.getAll().length).toBe(200);
  });
});
