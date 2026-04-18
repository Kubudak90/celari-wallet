# Nemi-fi EIP-1193 Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** bridge.human.tech ve `@nemi-fi/wallet-sdk` kullanan dApp'lerin Celari Wallet'ı otomatik tanıyıp connect/tx onay akışlarını tam olarak çalıştırması.

**Architecture:** `azip6963:announceProvider` event + EIP-1193 `request()` provider (inpage-nemi.js). Background 5 RPC metodunu (`aztec_requestAccounts`, `aztec_accounts`, `aztec_sendTransaction`, `aztec_call`, `wallet_watchAssets`) origin-based izin modeli + 3 popup onay akışı ile çözer. Offscreen'de `nemi-serde.js` ile SerializedX → Aztec 4.2.0 tip decode'u yapılır; mevcut `handleWalletMethod` PXE çağrıları yeniden kullanılır.

**Tech Stack:**
- Chrome MV3 extension (existing)
- `@aztec/aztec.js 4.2.0`, `@aztec/stdlib 4.2.0` (mevcut)
- Pure JS + Web APIs (`CustomEvent`, `MessageChannel`, `chrome.storage.local`, `chrome.tabs`)
- Vitest + jsdom — yeni minimal test infra

**Spec referans:** `docs/superpowers/specs/2026-04-18-nemi-eip1193-provider-design.md`

**XSS Güvenliği:** Hiçbir yerde `innerHTML =` kullanmıyoruz. Popup sayfalarında tüm dinamik metinler `textContent` ile yazılıyor, liste öğeleri `document.createElement` + `appendChild` ile inşa ediliyor. Statik error sayfaları için `replaceChildren()` kullanılıyor.

---

## Phase 0 — Audit & Test Infrastructure

### Task 1: Aztec 4.2.0 API Signature Runtime Audit

Offscreen document yüklenirken, `nemi-serde.js`'in ihtiyaç duyduğu tüm import'ların var olduğunu doğrulayan preflight check. Başarısız olursa console.error + storage'a yazılır (popup'ta görünebilir).

**Files:**
- Create: `extension/public/src/lib/nemi-audit.js`
- Modify: `extension/public/src/offscreen.js` (en üste import + call)

- [ ] **Step 1: Oluştur `extension/public/src/lib/nemi-audit.js`**

```js
export async function runNemiAudit() {
  const results = { ok: true, checks: [] };

  async function check(name, fn) {
    try {
      const val = await fn();
      const ok = val !== undefined && val !== null;
      results.checks.push({ name, ok });
      if (!ok) results.ok = false;
    } catch (e) {
      results.checks.push({ name, ok: false, error: e.message });
      results.ok = false;
    }
  }

  const aztec = await import("@aztec/aztec.js");
  await check("AztecAddress", () => aztec.AztecAddress);
  await check("Fr", () => aztec.Fr);
  await check("FunctionSelector", () => aztec.FunctionSelector);
  await check("Capsule", () => aztec.Capsule);
  await check("PublicKeys", () => aztec.PublicKeys);
  await check("getAllFunctionAbis", () => aztec.getAllFunctionAbis);
  await check("AztecAddress.fromString", () => aztec.AztecAddress.fromString("0x0000000000000000000000000000000000000000000000000000000000000001"));
  await check("Fr.fromHexString", () => aztec.Fr.fromHexString("0x01"));
  await check("Fr.fromString", () => aztec.Fr.fromString("0x01"));

  try {
    const stdlibAbi = await import("@aztec/stdlib/abi");
    await check("ContractArtifactSchema", () => stdlibAbi.ContractArtifactSchema);
  } catch (e) {
    results.checks.push({ name: "@aztec/stdlib/abi import", ok: false, error: e.message });
    results.ok = false;
  }

  console.log("[NemiAudit] ok=" + results.ok, results.checks);
  try {
    chrome?.storage?.local?.set({ celari_nemi_audit: { ts: Date.now(), ...results } });
  } catch {}
  return results;
}
```

- [ ] **Step 2: offscreen.js'in en başına import + çağrı ekle**

`extension/public/src/offscreen.js` dosyasının en üstündeki import bloğunun hemen altına:

```js
import { runNemiAudit } from "./lib/nemi-audit.js";
runNemiAudit().catch((e) => console.warn("[NemiAudit] failed:", e?.message || e));
```

- [ ] **Step 3: Extension'ı rebuild + reload + audit log'u kontrol et**

```bash
cd "/Users/huseyinarslan/Desktop/celari-build-25 kopyası"
node extension/build.mjs
```

Chrome → `chrome://extensions` → Celari Wallet → Reload. Offscreen document DevTools'a gir.

Expected: `[NemiAudit] ok=true [{name:"AztecAddress",ok:true}, ...]`

Herhangi biri false ise, o satırı not al — Task 3-8'de serde yazarken adapt edilir.

- [ ] **Step 4: Commit**

```bash
git add extension/public/src/lib/nemi-audit.js extension/public/src/offscreen.js
git commit -m "feat(nemi): preflight audit for Aztec 4.2.0 API surface"
```

---

### Task 2: Vitest Unit Test Infrastructure

**Files:**
- Create: `extension/tests/vitest.config.js`
- Create: `extension/tests/setup.js`
- Create: `extension/tests/fixtures/nemi-payloads.js`
- Modify: `package.json` (root — devDependencies + scripts)

- [ ] **Step 1: Root `package.json`'a vitest devDep + script ekle**

`package.json`'da `devDependencies` bloğuna:

```json
"vitest": "^1.6.0",
"jsdom": "^24.0.0"
```

`scripts` bloğuna:

```json
"test:ext": "vitest run --config extension/tests/vitest.config.js",
"test:ext:watch": "vitest --config extension/tests/vitest.config.js"
```

- [ ] **Step 2: Oluştur `extension/tests/vitest.config.js`**

```js
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./extension/tests/setup.js"],
    include: ["extension/tests/unit/**/*.test.js"],
    globals: true,
  },
});
```

- [ ] **Step 3: Oluştur `extension/tests/setup.js`**

```js
import { vi, beforeEach } from "vitest";

const storage = new Map();

globalThis.chrome = {
  storage: {
    local: {
      get: vi.fn((keys, cb) => {
        const out = {};
        const keyArr = Array.isArray(keys) ? keys : typeof keys === "string" ? [keys] : Object.keys(keys || {});
        for (const k of keyArr) if (storage.has(k)) out[k] = storage.get(k);
        if (cb) cb(out); else return Promise.resolve(out);
      }),
      set: vi.fn((obj, cb) => {
        for (const [k, v] of Object.entries(obj)) storage.set(k, v);
        if (cb) cb(); else return Promise.resolve();
      }),
      remove: vi.fn((keys, cb) => {
        const arr = Array.isArray(keys) ? keys : [keys];
        for (const k of arr) storage.delete(k);
        if (cb) cb(); else return Promise.resolve();
      }),
    },
  },
  runtime: {
    id: "test-ext-id",
    sendMessage: vi.fn(() => Promise.resolve()),
    getURL: vi.fn((p) => `chrome-extension://test/${p}`),
  },
  tabs: {
    query: vi.fn((_q, cb) => cb([])),
    sendMessage: vi.fn(() => Promise.resolve()),
  },
  windows: {
    create: vi.fn(() => Promise.resolve({ id: 1 })),
  },
};

beforeEach(() => {
  storage.clear();
  vi.clearAllMocks();
});
```

- [ ] **Step 4: Oluştur `extension/tests/fixtures/nemi-payloads.js`**

```js
export const FIXTURE_ADDRESS = "0x1111111111111111111111111111111111111111111111111111111111111111";
export const FIXTURE_ADDRESS_2 = "0x2222222222222222222222222222222222222222222222222222222222222222";
export const FIXTURE_FR = "0x0000000000000000000000000000000000000000000000000000000000000042";
export const FIXTURE_SELECTOR = "0xaabbccdd";

export const FIXTURE_FUNCTION_CALL = {
  to: FIXTURE_ADDRESS,
  selector: FIXTURE_SELECTOR,
  args: [FIXTURE_FR, "0x0000000000000000000000000000000000000000000000000000000000000001"],
};

export const FIXTURE_CAPSULE = {
  contract: FIXTURE_ADDRESS,
  storageSlot: FIXTURE_FR,
  data: [FIXTURE_FR, FIXTURE_FR],
};

export const FIXTURE_CONTRACT_INSTANCE = {
  version: "0x1",
  salt: FIXTURE_FR,
  deployer: FIXTURE_ADDRESS,
  originalContractClassId: FIXTURE_FR,
  currentContractClassId: FIXTURE_FR,
  initializationHash: FIXTURE_FR,
  publicKeys: "0x" + "11".repeat(256),
};
```

- [ ] **Step 5: Install + smoke test vitest**

```bash
cd "/Users/huseyinarslan/Desktop/celari-build-25 kopyası"
npm install --legacy-peer-deps
npm run test:ext
```

Expected: `No test files found, exiting with code 1` (henüz test yok — beklenen).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json extension/tests/
git commit -m "test(nemi): vitest + jsdom scaffolding with chrome mocks"
```

---

## Phase 1 — Serde Layer (offscreen-side decode)

### Task 3: `nemi-serde.js` — Hex helpers + encodeFunctionCall + encodeCapsules

**Files:**
- Create: `extension/public/src/lib/nemi-serde.js`
- Test: `extension/tests/unit/nemi-serde-encode.test.js`

- [ ] **Step 1: Failing test yaz**

`extension/tests/unit/nemi-serde-encode.test.js`:

```js
import { describe, it, expect } from "vitest";
import { encodeFunctionCall, encodeCapsules, toHex, fromHex } from "../../public/src/lib/nemi-serde.js";
import { FIXTURE_ADDRESS, FIXTURE_FR, FIXTURE_SELECTOR } from "../fixtures/nemi-payloads.js";

describe("nemi-serde hex helpers", () => {
  it("toHex encodes a number", () => {
    expect(toHex(255)).toBe("0xff");
    expect(toHex(1)).toBe("0x1");
  });
  it("fromHex parses", () => {
    expect(fromHex("0xff")).toBe(255);
    expect(fromHex("0x1")).toBe(1);
  });
});

describe("encodeFunctionCall", () => {
  it("serializes a FunctionCall-like object", () => {
    const call = {
      to: { toString: () => FIXTURE_ADDRESS },
      selector: { toString: () => FIXTURE_SELECTOR },
      args: [{ toString: () => FIXTURE_FR }, { toString: () => "0x01" }],
    };
    expect(encodeFunctionCall(call)).toEqual({
      to: FIXTURE_ADDRESS,
      selector: FIXTURE_SELECTOR,
      args: [FIXTURE_FR, "0x01"],
    });
  });
});

describe("encodeCapsules", () => {
  it("serializes Capsule-like objects", () => {
    const cap = {
      contractAddress: { toString: () => FIXTURE_ADDRESS },
      storageSlot: { toString: () => FIXTURE_FR },
      data: [{ toString: () => FIXTURE_FR }],
    };
    expect(encodeCapsules([cap])).toEqual([{
      contract: FIXTURE_ADDRESS,
      storageSlot: FIXTURE_FR,
      data: [FIXTURE_FR],
    }]);
  });
});
```

- [ ] **Step 2: Test'in fail ettiğini doğrula**

```bash
npm run test:ext -- nemi-serde-encode
```

Expected: FAIL, `Cannot find module .../nemi-serde.js`.

- [ ] **Step 3: `extension/public/src/lib/nemi-serde.js` başlangıç implementasyonu**

```js
export const toHex = (n) => "0x" + n.toString(16);
export const fromHex = (h) => parseInt(h, 16);

export function encodeFunctionCall(call) {
  return {
    to: call.to.toString(),
    selector: call.selector.toString(),
    args: call.args.map((x) => x.toString()),
  };
}

export function encodeCapsules(capsules) {
  return capsules.map((c) => ({
    contract: c.contractAddress.toString(),
    storageSlot: c.storageSlot.toString(),
    data: c.data.map((x) => x.toString()),
  }));
}
```

- [ ] **Step 4: Test'lerin pass ettiğini doğrula**

```bash
npm run test:ext -- nemi-serde-encode
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add extension/public/src/lib/nemi-serde.js extension/tests/unit/nemi-serde-encode.test.js
git commit -m "feat(nemi): hex helpers + encode functions for FunctionCall/Capsule"
```

---

### Task 4: `nemi-serde.js` — decodeFunctionCall

**Files:**
- Modify: `extension/public/src/lib/nemi-serde.js`
- Test: `extension/tests/unit/nemi-serde-decode.test.js`

- [ ] **Step 1: Failing test yaz**

`extension/tests/unit/nemi-serde-decode.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FIXTURE_ADDRESS, FIXTURE_FR, FIXTURE_SELECTOR, FIXTURE_FUNCTION_CALL } from "../fixtures/nemi-payloads.js";

const mockFnArtifact = {
  name: "transfer",
  functionType: "private",
  isStatic: false,
  returnTypes: [],
  parameters: [],
};

vi.mock("@aztec/aztec.js", () => ({
  AztecAddress: { fromString: vi.fn((s) => ({ __type: "AztecAddress", s, toString: () => s })) },
  FunctionSelector: {
    fromString: vi.fn((s) => ({ __type: "FunctionSelector", s, toString: () => s, equals: (other) => other?.s === s })),
    fromNameAndParameters: vi.fn(async () => ({ __type: "FunctionSelector", s: FIXTURE_SELECTOR, equals: (other) => other?.s === FIXTURE_SELECTOR })),
  },
  Fr: { fromHexString: vi.fn((s) => ({ __type: "Fr", s, toString: () => s })) },
  getAllFunctionAbis: vi.fn(() => [mockFnArtifact]),
}));

let decodeFunctionCall;
beforeEach(async () => {
  vi.resetModules();
  ({ decodeFunctionCall } = await import("../../public/src/lib/nemi-serde.js"));
});

describe("decodeFunctionCall", () => {
  it("enriches serialized call with artifact metadata", async () => {
    const pxe = {
      getContractMetadata: vi.fn(async () => ({ contractInstance: { currentContractClassId: "cid" } })),
      getContractClassMetadata: vi.fn(async () => ({ artifact: { } })),
    };
    const result = await decodeFunctionCall(pxe, FIXTURE_FUNCTION_CALL);
    expect(result.to.__type).toBe("AztecAddress");
    expect(result.selector.__type).toBe("FunctionSelector");
    expect(result.args).toHaveLength(2);
    expect(result.name).toBe("transfer");
    expect(result.type).toBe("private");
    expect(result.isStatic).toBe(false);
    expect(result.returnTypes).toEqual([]);
    expect(pxe.getContractMetadata).toHaveBeenCalledWith(expect.objectContaining({ __type: "AztecAddress" }));
    expect(pxe.getContractClassMetadata).toHaveBeenCalledWith("cid", true);
  });

  it("throws when contract instance is missing", async () => {
    const pxe = { getContractMetadata: vi.fn(async () => ({ contractInstance: null })) };
    await expect(decodeFunctionCall(pxe, FIXTURE_FUNCTION_CALL)).rejects.toThrow(/no contract instance/);
  });
});
```

- [ ] **Step 2: Fail olduğunu doğrula**

```bash
npm run test:ext -- nemi-serde-decode
```

Expected: FAIL, `decodeFunctionCall is not a function`.

- [ ] **Step 3: `nemi-serde.js`'e decodeFunctionCall ekle**

```js
export async function decodeFunctionCall(pxe, fc) {
  const { AztecAddress, FunctionSelector, Fr } = await import("@aztec/aztec.js");
  const to = AztecAddress.fromString(fc.to);
  const selector = FunctionSelector.fromString(fc.selector);
  const args = fc.args.map((x) => Fr.fromHexString(x));
  const artifact = await getContractFunctionAbiFromPxe(pxe, to, selector);
  return {
    to,
    selector,
    args,
    name: artifact.name,
    type: artifact.functionType,
    isStatic: artifact.isStatic,
    returnTypes: artifact.returnTypes,
  };
}

export async function getContractFunctionAbiFromPxe(pxe, address, selector) {
  const { FunctionSelector, getAllFunctionAbis } = await import("@aztec/aztec.js");
  const instance = await pxe.getContractMetadata(address);
  if (!instance.contractInstance) {
    throw new Error(`no contract instance found for ${address}`);
  }
  const contractArtifact = await pxe.getContractClassMetadata(
    instance.contractInstance.currentContractClassId,
    true,
  );
  if (!contractArtifact.artifact) {
    throw new Error(`no contract artifact found for ${address}`);
  }
  const abis = getAllFunctionAbis(contractArtifact.artifact);
  const matches = await Promise.all(
    abis.map(async (f) => {
      const s = await FunctionSelector.fromNameAndParameters(f.name, f.parameters);
      return s.equals(selector) ? f : undefined;
    }),
  );
  const artifact = matches.find((f) => f != null);
  if (!artifact) throw new Error(`no function artifact found for ${address}`);
  return artifact;
}
```

- [ ] **Step 4: Pass'i doğrula**

```bash
npm run test:ext -- nemi-serde-decode
```

Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add extension/public/src/lib/nemi-serde.js extension/tests/unit/nemi-serde-decode.test.js
git commit -m "feat(nemi): decodeFunctionCall with PXE-based artifact enrichment"
```

---

### Task 5: `nemi-serde.js` — decodeCapsules

**Files:**
- Modify: `extension/public/src/lib/nemi-serde.js`
- Modify: `extension/tests/unit/nemi-serde-decode.test.js`

- [ ] **Step 1: Test ekle (mevcut mock'u genişlet + yeni describe bloku)**

`nemi-serde-decode.test.js` içindeki `vi.mock("@aztec/aztec.js", ...)` çağrısını şununla değiştir:

```js
vi.mock("@aztec/aztec.js", () => ({
  AztecAddress: { fromString: vi.fn((s) => ({ __type: "AztecAddress", s, toString: () => s })) },
  FunctionSelector: {
    fromString: vi.fn((s) => ({ __type: "FunctionSelector", s, toString: () => s, equals: (other) => other?.s === s })),
    fromNameAndParameters: vi.fn(async () => ({ __type: "FunctionSelector", s: FIXTURE_SELECTOR, equals: (other) => other?.s === FIXTURE_SELECTOR })),
  },
  Fr: {
    fromHexString: vi.fn((s) => ({ __type: "Fr", s, toString: () => s })),
    fromString: vi.fn((s) => ({ __type: "Fr", s, toString: () => s })),
  },
  Capsule: class {
    constructor(addr, slot, data) {
      this.contractAddress = addr;
      this.storageSlot = slot;
      this.data = data;
      this.__type = "Capsule";
    }
  },
  PublicKeys: { fromString: vi.fn((s) => ({ __type: "PublicKeys", s, toString: () => s })) },
  getAllFunctionAbis: vi.fn(() => [mockFnArtifact]),
}));
```

Yeni describe bloku ekle:

```js
describe("decodeCapsules", () => {
  it("constructs Capsule instances", async () => {
    const { decodeCapsules } = await import("../../public/src/lib/nemi-serde.js");
    const out = await decodeCapsules([{ contract: FIXTURE_ADDRESS, storageSlot: FIXTURE_FR, data: [FIXTURE_FR, FIXTURE_FR] }]);
    expect(out).toHaveLength(1);
    expect(out[0].__type).toBe("Capsule");
    expect(out[0].data).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Fail**

```bash
npm run test:ext -- nemi-serde-decode
```

Expected: FAIL, `decodeCapsules is not a function`.

- [ ] **Step 3: `nemi-serde.js`'e ekle**

```js
export async function decodeCapsules(capsules) {
  const { Capsule, Fr, AztecAddress } = await import("@aztec/aztec.js");
  return capsules.map(
    (c) => new Capsule(
      AztecAddress.fromString(c.contract),
      Fr.fromString(c.storageSlot),
      c.data.map((x) => Fr.fromString(x)),
    ),
  );
}
```

- [ ] **Step 4: Pass**

```bash
npm run test:ext -- nemi-serde-decode
```

Expected: PASS (3 tests total).

- [ ] **Step 5: Commit**

```bash
git add extension/public/src/lib/nemi-serde.js extension/tests/unit/nemi-serde-decode.test.js
git commit -m "feat(nemi): decodeCapsules"
```

---

### Task 6: `nemi-serde.js` — decodeContractInstance + decodeContractArtifact

**Files:**
- Modify: `extension/public/src/lib/nemi-serde.js`
- Modify: `extension/tests/unit/nemi-serde-decode.test.js`

- [ ] **Step 1: Test ekle**

`vi.mock("@aztec/stdlib/abi", ...)` ekle (mevcut `vi.mock("@aztec/aztec.js", ...)` çağrısının hemen altına):

```js
vi.mock("@aztec/stdlib/abi", () => ({
  ContractArtifactSchema: {
    parse: vi.fn((obj) => ({ __parsed: true, ...obj })),
  },
}));
```

Yeni testler:

```js
import { FIXTURE_CONTRACT_INSTANCE } from "../fixtures/nemi-payloads.js";

describe("decodeContractInstance", () => {
  it("maps 7 fields to typed instance", async () => {
    const { decodeContractInstance } = await import("../../public/src/lib/nemi-serde.js");
    const out = await decodeContractInstance(FIXTURE_CONTRACT_INSTANCE);
    expect(out.version).toBe(1);
    expect(out.salt.__type).toBe("Fr");
    expect(out.deployer.__type).toBe("AztecAddress");
    expect(out.publicKeys.__type).toBe("PublicKeys");
  });
});

describe("decodeContractArtifact", () => {
  it("parses literal artifact through schema", async () => {
    const { decodeContractArtifact } = await import("../../public/src/lib/nemi-serde.js");
    const out = await decodeContractArtifact({ type: "literal", literal: { name: "Foo" } });
    expect(out.__parsed).toBe(true);
    expect(out.name).toBe("Foo");
  });

  it("fetches URL artifact and parses", async () => {
    const { decodeContractArtifact } = await import("../../public/src/lib/nemi-serde.js");
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ name: "Remote" }),
    }));
    const out = await decodeContractArtifact({ type: "url", url: "https://example.com/a.json" });
    expect(out.__parsed).toBe(true);
    expect(out.name).toBe("Remote");
    expect(globalThis.fetch).toHaveBeenCalledWith("https://example.com/a.json");
  });
});
```

- [ ] **Step 2: Fail**

```bash
npm run test:ext -- nemi-serde-decode
```

Expected: FAIL.

- [ ] **Step 3: Implement**

`nemi-serde.js`'e ekle:

```js
export async function decodeContractInstance(data) {
  const { AztecAddress, Fr, PublicKeys } = await import("@aztec/aztec.js");
  return {
    version: fromHex(data.version),
    salt: Fr.fromString(data.salt),
    deployer: AztecAddress.fromString(data.deployer),
    originalContractClassId: Fr.fromString(data.originalContractClassId),
    currentContractClassId: Fr.fromString(data.currentContractClassId),
    initializationHash: Fr.fromString(data.initializationHash),
    publicKeys: PublicKeys.fromString(data.publicKeys),
  };
}

const _artifactCache = new Map();
export async function decodeContractArtifact(data) {
  let literal;
  if (data.type === "url") {
    let p = _artifactCache.get(data.url);
    if (!p) {
      p = fetch(data.url).then((r) => {
        if (!r.ok) throw new Error(`artifact fetch ${data.url}: HTTP ${r.status}`);
        return r.json();
      });
      _artifactCache.set(data.url, p);
    }
    literal = await p;
  } else {
    literal = data.literal;
  }
  const { ContractArtifactSchema } = await import("@aztec/stdlib/abi");
  return ContractArtifactSchema.parse(literal);
}
```

- [ ] **Step 4: Pass**

```bash
npm run test:ext -- nemi-serde-decode
```

Expected: PASS (6 tests total).

- [ ] **Step 5: Commit**

```bash
git add extension/public/src/lib/nemi-serde.js extension/tests/unit/nemi-serde-decode.test.js
git commit -m "feat(nemi): decodeContractInstance + decodeContractArtifact"
```

---

### Task 7: `nemi-serde.js` — decodeRegisterContract + decodeAuthWitnessRequest

**Files:**
- Modify: `extension/public/src/lib/nemi-serde.js`
- Modify: `extension/tests/unit/nemi-serde-decode.test.js`

- [ ] **Step 1: Test ekle**

```js
describe("decodeRegisterContracts", () => {
  it("decodes address + optional instance + optional artifact", async () => {
    const { decodeRegisterContracts } = await import("../../public/src/lib/nemi-serde.js");
    const out = await decodeRegisterContracts([
      { address: FIXTURE_ADDRESS, instance: FIXTURE_CONTRACT_INSTANCE, artifact: { type: "literal", literal: { name: "C" } } },
      { address: FIXTURE_ADDRESS_2 },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0].address.__type).toBe("AztecAddress");
    expect(out[0].instance).toBeDefined();
    expect(out[0].artifact.__parsed).toBe(true);
    expect(out[1].instance).toBeUndefined();
    expect(out[1].artifact).toBeUndefined();
  });
});
```

Import'lara `FIXTURE_ADDRESS_2` ekle.

- [ ] **Step 2: Fail**

```bash
npm run test:ext -- nemi-serde-decode
```

Expected: FAIL.

- [ ] **Step 3: Implement**

```js
export async function decodeRegisterContract(data) {
  const { AztecAddress } = await import("@aztec/aztec.js");
  return {
    address: AztecAddress.fromString(data.address),
    instance: data.instance ? await decodeContractInstance(data.instance) : undefined,
    artifact: data.artifact ? await decodeContractArtifact(data.artifact) : undefined,
  };
}

export async function decodeRegisterContracts(arr) {
  return Promise.all(arr.map(decodeRegisterContract));
}

export async function decodeAuthWitnessRequest(data, pxe) {
  const { AztecAddress } = await import("@aztec/aztec.js");
  const action = pxe ? await decodeFunctionCall(pxe, data.action) : data.action;
  return {
    caller: AztecAddress.fromString(data.caller),
    action,
  };
}
```

- [ ] **Step 4: Pass**

```bash
npm run test:ext -- nemi-serde-decode
```

Expected: PASS (7 tests total).

- [ ] **Step 5: Commit**

```bash
git add extension/public/src/lib/nemi-serde.js extension/tests/unit/nemi-serde-decode.test.js
git commit -m "feat(nemi): decodeRegisterContract + decodeAuthWitnessRequest"
```

---

## Phase 2 — Permission Store + Rate Limiter

### Task 8: `nemi-permissions.js`

**Files:**
- Create: `extension/public/src/lib/nemi-permissions.js`
- Test: `extension/tests/unit/nemi-permissions.test.js`

- [ ] **Step 1: Failing test yaz**

```js
import { describe, it, expect } from "vitest";
import {
  getPermission,
  setPermission,
  revokePermission,
  listPermissions,
} from "../../public/src/lib/nemi-permissions.js";

const ORIGIN = "https://bridge.human.tech";
const ADDR = "0x1111111111111111111111111111111111111111111111111111111111111111";

describe("nemi-permissions", () => {
  it("returns undefined for unknown origin", async () => {
    const p = await getPermission(ORIGIN);
    expect(p).toBeUndefined();
  });

  it("stores and retrieves a permission", async () => {
    await setPermission(ORIGIN, { addresses: [ADDR], selectedAddress: ADDR, chainId: "0x1" });
    const p = await getPermission(ORIGIN);
    expect(p).toBeDefined();
    expect(p.addresses).toEqual([ADDR]);
    expect(p.revoked).toBe(false);
    expect(typeof p.connectedAt).toBe("number");
  });

  it("revokes and excludes revoked from getPermission when live=true", async () => {
    await setPermission(ORIGIN, { addresses: [ADDR], selectedAddress: ADDR, chainId: "0x1" });
    await revokePermission(ORIGIN);
    const p = await getPermission(ORIGIN, { live: true });
    expect(p).toBeUndefined();
    const raw = await getPermission(ORIGIN, { live: false });
    expect(raw.revoked).toBe(true);
  });

  it("listPermissions returns only non-revoked by default", async () => {
    await setPermission("https://a.com", { addresses: [ADDR], selectedAddress: ADDR, chainId: "0x1" });
    await setPermission("https://b.com", { addresses: [ADDR], selectedAddress: ADDR, chainId: "0x1" });
    await revokePermission("https://a.com");
    const list = await listPermissions();
    expect(list.map((x) => x.origin)).toEqual(["https://b.com"]);
  });
});
```

- [ ] **Step 2: Fail**

```bash
npm run test:ext -- nemi-permissions
```

Expected: FAIL.

- [ ] **Step 3: Implement**

```js
const KEY = "celari_nemi_perms";

async function readAll() {
  return new Promise((resolve) => {
    chrome.storage.local.get(KEY, (r) => resolve(r?.[KEY] || {}));
  });
}

async function writeAll(all) {
  return new Promise((resolve) => chrome.storage.local.set({ [KEY]: all }, () => resolve()));
}

export async function getPermission(origin, { live = true } = {}) {
  const all = await readAll();
  const rec = all[origin];
  if (!rec) return undefined;
  if (live && rec.revoked) return undefined;
  return rec;
}

export async function setPermission(origin, { addresses, selectedAddress, chainId }) {
  const all = await readAll();
  all[origin] = {
    connectedAt: Date.now(),
    addresses,
    selectedAddress,
    chainId,
    revoked: false,
  };
  await writeAll(all);
  return all[origin];
}

export async function revokePermission(origin) {
  const all = await readAll();
  if (all[origin]) {
    all[origin].revoked = true;
    await writeAll(all);
  }
}

export async function listPermissions({ includeRevoked = false } = {}) {
  const all = await readAll();
  return Object.entries(all)
    .filter(([_, v]) => includeRevoked || !v.revoked)
    .map(([origin, v]) => ({ origin, ...v }));
}

export async function updateSelectedAddress(origin, selectedAddress) {
  const all = await readAll();
  if (all[origin] && !all[origin].revoked) {
    all[origin].selectedAddress = selectedAddress;
    await writeAll(all);
  }
}
```

- [ ] **Step 4: Pass**

```bash
npm run test:ext -- nemi-permissions
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add extension/public/src/lib/nemi-permissions.js extension/tests/unit/nemi-permissions.test.js
git commit -m "feat(nemi): origin-based permission store"
```

---

### Task 9: `nemi-rate-limit.js`

**Files:**
- Create: `extension/public/src/lib/nemi-rate-limit.js`
- Test: `extension/tests/unit/nemi-rate-limit.test.js`

- [ ] **Step 1: Failing test**

```js
import { describe, it, expect, beforeEach, vi } from "vitest";
import { checkAndRecord, _reset } from "../../public/src/lib/nemi-rate-limit.js";

beforeEach(() => _reset());

describe("nemi-rate-limit", () => {
  it("allows up to 10 tx per minute per origin", () => {
    for (let i = 0; i < 10; i++) {
      expect(checkAndRecord("https://a.com", "aztec_sendTransaction")).toBe(true);
    }
    expect(checkAndRecord("https://a.com", "aztec_sendTransaction")).toBe(false);
  });

  it("isolates origins", () => {
    for (let i = 0; i < 10; i++) checkAndRecord("https://a.com", "aztec_sendTransaction");
    expect(checkAndRecord("https://b.com", "aztec_sendTransaction")).toBe(true);
  });

  it("resets after 60s", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    for (let i = 0; i < 10; i++) checkAndRecord("https://a.com", "aztec_sendTransaction");
    expect(checkAndRecord("https://a.com", "aztec_sendTransaction")).toBe(false);
    vi.setSystemTime(new Date("2026-01-01T00:01:01Z"));
    expect(checkAndRecord("https://a.com", "aztec_sendTransaction")).toBe(true);
    vi.useRealTimers();
  });

  it("read methods are unlimited", () => {
    for (let i = 0; i < 100; i++) {
      expect(checkAndRecord("https://a.com", "aztec_call")).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Fail**

```bash
npm run test:ext -- nemi-rate-limit
```

- [ ] **Step 3: Implement**

```js
const WINDOW_MS = 60_000;
const LIMIT_WRITE = 10;
const WRITE_METHODS = new Set(["aztec_sendTransaction", "wallet_watchAssets"]);

const buckets = new Map();

export function checkAndRecord(origin, method) {
  if (!WRITE_METHODS.has(method)) return true;
  const now = Date.now();
  const arr = buckets.get(origin) || [];
  const recent = arr.filter((t) => now - t < WINDOW_MS);
  if (recent.length >= LIMIT_WRITE) {
    buckets.set(origin, recent);
    return false;
  }
  recent.push(now);
  buckets.set(origin, recent);
  return true;
}

export function _reset() {
  buckets.clear();
}
```

- [ ] **Step 4: Pass**

```bash
npm run test:ext -- nemi-rate-limit
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add extension/public/src/lib/nemi-rate-limit.js extension/tests/unit/nemi-rate-limit.test.js
git commit -m "feat(nemi): per-origin rate limit for write methods"
```

---

## Phase 3 — Inpage Provider + Content Script

### Task 10: `inpage-nemi.js` — azip6963 announce + provider.request scaffold

**Files:**
- Create: `extension/public/src/inpage-nemi.js`
- Modify: `extension/public/manifest.json`

- [ ] **Step 1: Oluştur `inpage-nemi.js`**

```js
(() => {
  if (window.__celariNemiEnabled === false) {
    console.log("[Celari] nemi provider disabled via feature flag");
    return;
  }

  const WALLET_UUID = "celari-wallet-eip6963";
  const WALLET_NAME = "Celari";
  const WALLET_ICON = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=";

  const AZIP6963_REQUEST = "azip6963:requestProviders";
  const AZIP6963_ANNOUNCE = "azip6963:announceProvider";

  let requestCounter = 0;
  const pending = new Map();
  const eventHandlers = Object.create(null);

  function sendRequest(method, params) {
    return new Promise((resolve, reject) => {
      const reqId = `nemi_${++requestCounter}_${Date.now()}`;
      pending.set(reqId, { resolve, reject });
      window.postMessage({
        target: "celari-nemi",
        reqId,
        method,
        params,
      }, window.location.origin);
      setTimeout(() => {
        if (pending.has(reqId)) {
          pending.delete(reqId);
          const err = new Error("Request timed out");
          err.code = -32603;
          reject(err);
        }
      }, 5 * 60_000);
    });
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const d = event.data;
    if (!d || typeof d !== "object") return;

    if (d.target === "celari-nemi-response" && d.reqId) {
      const p = pending.get(d.reqId);
      if (!p) return;
      pending.delete(d.reqId);
      if (d.error) {
        const err = new Error(d.error.message);
        err.code = d.error.code;
        err.data = d.error.data;
        p.reject(err);
      } else {
        p.resolve(d.result);
      }
      return;
    }

    if (d.target === "celari-nemi-event") {
      const handlers = eventHandlers[d.event] || [];
      for (const h of handlers) {
        try { h(d.data); } catch {}
      }
    }
  });

  const provider = {
    async request({ method, params = [] }) {
      return sendRequest(method, params);
    },
    on(event, handler) {
      (eventHandlers[event] ||= []).push(handler);
    },
    removeListener(event, handler) {
      const arr = eventHandlers[event] || [];
      const i = arr.indexOf(handler);
      if (i >= 0) arr.splice(i, 1);
    },
  };

  function announce() {
    const detail = {
      info: { uuid: WALLET_UUID, name: WALLET_NAME, icon: WALLET_ICON },
      provider,
    };
    window.dispatchEvent(new CustomEvent(AZIP6963_ANNOUNCE, { detail }));
  }

  window.addEventListener(AZIP6963_REQUEST, announce);
  announce();
  console.log("[Celari] nemi provider announced (azip6963)");
})();
```

- [ ] **Step 2: `manifest.json`'ı güncelle**

`web_accessible_resources[0].resources` dizisine `"src/inpage-nemi.js"` ekle:

```json
"web_accessible_resources": [
  {
    "resources": ["src/inpage.js", "src/inpage-nemi.js", "wasm/*"],
    "matches": ["<all_urls>"]
  }
]
```

- [ ] **Step 3: Commit**

```bash
git add extension/public/src/inpage-nemi.js extension/public/manifest.json
git commit -m "feat(nemi): inpage EIP-1193 provider + azip6963 announce"
```

---

### Task 11: `content.js` — injection + nemi relay + feature flag bootstrap

**Files:**
- Modify: `extension/public/src/content.js`

- [ ] **Step 1: content.js'te mevcut inpage.js injection bloğunun hemen altına nemi injection (flag gate'li) ekle**

`content.js` ~53. satır (`script.onload = () => script.remove();` bitiminden sonra):

```js
// Inject the nemi-fi EIP-1193 provider (flag-gated)
try {
  chrome.storage.local.get("celari_nemi_enabled", (r) => {
    const enabled = r?.celari_nemi_enabled !== false; // default true
    const marker = document.createElement("script");
    marker.textContent = `window.__celariNemiEnabled = ${enabled ? "true" : "false"};`;
    (document.head || document.documentElement).appendChild(marker);
    marker.remove();
    const s2 = document.createElement("script");
    s2.src = safeGetURL("src/inpage-nemi.js");
    s2.type = "text/javascript";
    (document.head || document.documentElement).appendChild(s2);
    s2.onload = () => s2.remove();
  });
} catch {}
```

- [ ] **Step 2: content.js sonuna nemi relay bloku ekle (`handleLegacyMessage` fonksiyonunun altına)**

```js
// ─── Nemi-fi protocol relay (page ↔ content ↔ background) ─────
window.addEventListener("message", (event) => {
  try {
    if (event.source !== window) return;
    const d = event.data;
    if (!d || d.target !== "celari-nemi") return;
    if (_celariCtxInvalid) {
      window.postMessage({
        target: "celari-nemi-response",
        reqId: d.reqId,
        error: { code: -32603, message: "Extension reloaded — please refresh this page" },
      }, window.location.origin);
      return;
    }
    chrome.runtime.sendMessage({
      origin: "nemi-cs",
      type: "nemi-rpc",
      reqId: d.reqId,
      method: d.method,
      params: d.params,
    }).then((resp) => {
      window.postMessage({ target: "celari-nemi-response", reqId: d.reqId, ...resp }, window.location.origin);
    }).catch((e) => {
      if (_celariIsCtxInvalidError(e)) _celariCtxInvalid = true;
      window.postMessage({
        target: "celari-nemi-response",
        reqId: d.reqId,
        error: { code: -32603, message: e.message },
      }, window.location.origin);
    });
  } catch (e) {
    if (_celariIsCtxInvalidError(e)) _celariCtxInvalid = true;
  }
});

// Nemi events broadcast: background → tab → page
chrome.runtime.onMessage.addListener((message) => {
  if (message?.origin === "nemi-bg" && message.type === "nemi-event") {
    window.postMessage({
      target: "celari-nemi-event",
      event: message.event,
      data: message.data,
    }, window.location.origin);
  }
});
```

- [ ] **Step 3: Rebuild + manuel test**

```bash
node extension/build.mjs
```

Reload extension. Herhangi bir sayfada DevTools:

```js
let provider;
window.addEventListener("azip6963:announceProvider", (e) => { provider = e.detail.provider; });
window.dispatchEvent(new CustomEvent("azip6963:requestProviders"));
setTimeout(() => console.log("provider:", provider?.info || "—", typeof provider?.request), 100);
```

Expected: `provider: undefined function` (detail'de provider var, request fn mevcut). Background handler henüz yok.

- [ ] **Step 4: Commit**

```bash
git add extension/public/src/content.js
git commit -m "feat(nemi): content injection + page↔bg relay + feature flag bootstrap"
```

---

## Phase 4 — Background Provider Module

### Task 12: `_nemiProvider` dispatcher skeleton

**Files:**
- Modify: `extension/public/src/background.js`

- [ ] **Step 1: `background.js` en üstüne import + state ekle**

Mevcut `// --- Network Presets ---` satırının hemen üstüne:

```js
import * as nemiPerms from "./lib/nemi-permissions.js";
import { checkAndRecord as nemiRateCheck } from "./lib/nemi-rate-limit.js";

const _nemiPendingConnects = new Map();
const _nemiPendingSigns    = new Map();
const _nemiPendingWatches  = new Map();
const NEMI_CONNECT_TIMEOUT_MS = 2 * 60_000;
const NEMI_SIGN_TIMEOUT_MS    = 5 * 60_000;
```

- [ ] **Step 2: Dispatcher fn ekle (`_wsHandleProtocolMessage` bitiminden sonra)**

```js
// ─── Nemi-fi EIP-1193 RPC dispatcher ─────
async function _nemiHandleRpc(message, sender) {
  const tabId = sender.tab?.id;
  const tabUrl = sender.tab?.url;
  if (!tabId || !tabUrl) return { error: { code: -32603, message: "Invalid sender" } };

  let origin;
  try { origin = new URL(tabUrl).origin; }
  catch { return { error: { code: -32603, message: "Bad origin" } }; }

  const { method, params, reqId } = message;

  if (!nemiRateCheck(origin, method)) {
    return { error: { code: -32005, message: "Rate limit exceeded" } };
  }

  try {
    switch (method) {
      case "aztec_requestAccounts":
        return await _nemiRequestAccounts(origin, tabId, reqId);
      case "aztec_accounts":
        return await _nemiAccounts(origin);
      case "aztec_sendTransaction":
        return await _nemiSendTransaction(origin, tabId, reqId, params?.[0]);
      case "aztec_call":
        return await _nemiCall(origin, params?.[0]);
      case "wallet_watchAssets":
        return await _nemiWatchAssets(origin, tabId, reqId, params?.[0]);
      default:
        return { error: { code: 4200, message: `Method ${method} not supported` } };
    }
  } catch (e) {
    console.warn("[Nemi]", method, "error:", e?.message || e);
    return { error: { code: e.code || -32603, message: e.message || "Internal error" } };
  }
}

async function _nemiRequestAccounts(_o, _t, _r) { return { error: { code: 4200, message: "not implemented" } }; }
async function _nemiAccounts(_o) { return { error: { code: 4200, message: "not implemented" } }; }
async function _nemiSendTransaction(_o, _t, _r, _req) { return { error: { code: 4200, message: "not implemented" } }; }
async function _nemiCall(_o, _req) { return { error: { code: 4200, message: "not implemented" } }; }
async function _nemiWatchAssets(_o, _t, _r, _req) { return { error: { code: 4200, message: "not implemented" } }; }
```

- [ ] **Step 3: `chrome.runtime.onMessage.addListener` başına nemi routing ekle**

Mevcut `if (message?.origin === _WS_CS)` bloğunun hemen altına:

```js
if (message?.origin === "nemi-cs" && message.type === "nemi-rpc") {
  _nemiHandleRpc(message, sender).then((resp) => sendResponse(resp || {})).catch((e) => {
    sendResponse({ error: { code: -32603, message: e?.message || "Internal" } });
  });
  return true;
}
```

- [ ] **Step 4: Rebuild + manuel smoke**

```bash
node extension/build.mjs
```

DevTools:

```js
let provider;
window.addEventListener("azip6963:announceProvider", (e) => { provider = e.detail.provider; });
window.dispatchEvent(new CustomEvent("azip6963:requestProviders"));
setTimeout(async () => {
  try { await provider.request({ method: "aztec_accounts", params: [] }); }
  catch (e) { console.log("expected 'not implemented':", e.code, e.message); }
}, 100);
```

Expected: `expected 'not implemented': 4200 not implemented`.

- [ ] **Step 5: Commit**

```bash
git add extension/public/src/background.js
git commit -m "feat(nemi): RPC dispatcher skeleton with rate limit + origin check"
```

---

### Task 13: `aztec_accounts` (no popup)

**Files:**
- Modify: `extension/public/src/background.js`

- [ ] **Step 1: Stub'ı gerçekle**

```js
async function _nemiAccounts(origin) {
  const perm = await nemiPerms.getPermission(origin, { live: true });
  if (!perm) return { result: [] };
  return { result: [perm.selectedAddress, ...perm.addresses.filter((a) => a !== perm.selectedAddress)] };
}
```

- [ ] **Step 2: Rebuild + smoke**

```bash
node extension/build.mjs
```

DevTools:

```js
let p; window.addEventListener("azip6963:announceProvider", (e) => { p = e.detail.provider; });
window.dispatchEvent(new CustomEvent("azip6963:requestProviders"));
setTimeout(async () => console.log(await p.request({method:"aztec_accounts", params:[]})), 100);
```

Expected: `[]` (henüz bağlı site yok).

- [ ] **Step 3: Commit**

```bash
git add extension/public/src/background.js
git commit -m "feat(nemi): aztec_accounts reconnect (no popup)"
```

---

### Task 14: `aztec_requestAccounts` + connect popup trigger

**Files:**
- Modify: `extension/public/src/background.js`

- [ ] **Step 1: Gerçekle**

```js
async function _nemiRequestAccounts(origin, tabId, _reqId) {
  const existing = await nemiPerms.getPermission(origin, { live: true });
  if (existing) {
    return { result: [existing.selectedAddress, ...existing.addresses.filter((a) => a !== existing.selectedAddress)] };
  }

  const popupReqId = `nemicon_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (_nemiPendingConnects.has(popupReqId)) {
        _nemiPendingConnects.delete(popupReqId);
        resolve({ error: { code: 4001, message: "User rejected the request (timeout)" } });
      }
    }, NEMI_CONNECT_TIMEOUT_MS);
    _nemiPendingConnects.set(popupReqId, { origin, tabId, resolve, timer });
    chrome.windows.create({
      url: `popup.html?nemi-connect=${encodeURIComponent(popupReqId)}`,
      type: "popup",
      width: 400,
      height: 600,
      focused: true,
    }).catch((e) => {
      clearTimeout(timer);
      _nemiPendingConnects.delete(popupReqId);
      resolve({ error: { code: -32603, message: `popup create failed: ${e.message}` } });
    });
  });
}
```

- [ ] **Step 2: Popup approval case'lerini onMessage switch'ine ekle**

```js
case "NEMI_GET_PENDING_CONNECT": {
  const p = _nemiPendingConnects.get(message.reqId);
  if (!p) { sendResponse({ success: false, error: "Not found" }); break; }
  sendResponse({ success: true, origin: p.origin });
  break;
}

case "NEMI_APPROVE_CONNECT": {
  const p = _nemiPendingConnects.get(message.reqId);
  if (!p) { sendResponse({ success: false, error: "Not found" }); break; }
  clearTimeout(p.timer);
  _nemiPendingConnects.delete(message.reqId);
  (async () => {
    const { selectedAddress, addresses, chainId } = message;
    await nemiPerms.setPermission(p.origin, { addresses, selectedAddress, chainId });
    const resolvedList = [selectedAddress, ...addresses.filter((a) => a !== selectedAddress)];
    _nemiBroadcastAccountsChanged(p.origin, resolvedList).catch(() => {});
    p.resolve({ result: resolvedList });
    sendResponse({ success: true });
  })();
  return true;
}

case "NEMI_REJECT_CONNECT": {
  const p = _nemiPendingConnects.get(message.reqId);
  if (!p) { sendResponse({ success: false, error: "Not found" }); break; }
  clearTimeout(p.timer);
  _nemiPendingConnects.delete(message.reqId);
  p.resolve({ error: { code: 4001, message: "User rejected the request" } });
  sendResponse({ success: true });
  break;
}
```

- [ ] **Step 3: `_nemiBroadcastAccountsChanged` helper fn'i ekle**

```js
async function _nemiBroadcastAccountsChanged(origin, addresses) {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (!tab.url) continue;
    try {
      const tabOrigin = new URL(tab.url).origin;
      if (tabOrigin !== origin) continue;
      chrome.tabs.sendMessage(tab.id, {
        origin: "nemi-bg",
        type: "nemi-event",
        event: "accountsChanged",
        data: addresses,
      }).catch(() => {});
    } catch {}
  }
}
```

- [ ] **Step 4: Commit (popup UI Task 19'a kadar boş kalır, pipeline çalışır)**

```bash
git add extension/public/src/background.js
git commit -m "feat(nemi): aztec_requestAccounts + connect pending state + accountsChanged broadcaster"
```

---

### Task 15: `aztec_sendTransaction` + sign popup trigger + offscreen NEMI_SEND_TX

**Files:**
- Modify: `extension/public/src/background.js`
- Modify: `extension/public/src/offscreen.js`

- [ ] **Step 1: `_nemiSendTransaction` gerçekle**

```js
async function _nemiSendTransaction(origin, tabId, _reqId, req) {
  const perm = await nemiPerms.getPermission(origin, { live: true });
  if (!perm) return { error: { code: 4100, message: "The requested method requires authorization" } };
  if (!req || typeof req !== "object") return { error: { code: -32602, message: "Invalid params" } };

  const popupReqId = `nemisign_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (_nemiPendingSigns.has(popupReqId)) {
        _nemiPendingSigns.delete(popupReqId);
        resolve({ error: { code: 4001, message: "User rejected the transaction (timeout)" } });
      }
    }, NEMI_SIGN_TIMEOUT_MS);
    _nemiPendingSigns.set(popupReqId, { origin, tabId, payload: req, resolve, timer });
    chrome.windows.create({
      url: `popup.html?nemi-sign=${encodeURIComponent(popupReqId)}`,
      type: "popup",
      width: 400,
      height: 700,
      focused: true,
    }).catch((e) => {
      clearTimeout(timer);
      _nemiPendingSigns.delete(popupReqId);
      resolve({ error: { code: -32603, message: `popup create failed: ${e.message}` } });
    });
  });
}
```

- [ ] **Step 2: Sign popup approval case'leri**

```js
case "NEMI_GET_PENDING_SIGN": {
  const p = _nemiPendingSigns.get(message.reqId);
  if (!p) { sendResponse({ success: false, error: "Not found" }); break; }
  sendResponse({ success: true, origin: p.origin, payload: p.payload });
  break;
}

case "NEMI_APPROVE_SIGN": {
  const p = _nemiPendingSigns.get(message.reqId);
  if (!p) { sendResponse({ success: false, error: "Not found" }); break; }
  clearTimeout(p.timer);
  _nemiPendingSigns.delete(message.reqId);
  sendResponse({ success: true });
  sendToPXE({ type: "NEMI_SEND_TX", payload: p.payload })
    .then((pxeResp) => {
      if (pxeResp?.error) p.resolve({ error: { code: -32603, message: pxeResp.error } });
      else p.resolve({ result: pxeResp?.txHash });
    })
    .catch((e) => p.resolve({ error: { code: -32603, message: e?.message || "PXE error" } }));
  return true;
}

case "NEMI_REJECT_SIGN": {
  const p = _nemiPendingSigns.get(message.reqId);
  if (!p) { sendResponse({ success: false, error: "Not found" }); break; }
  clearTimeout(p.timer);
  _nemiPendingSigns.delete(message.reqId);
  p.resolve({ error: { code: 4001, message: "User rejected the transaction" } });
  sendResponse({ success: true });
  break;
}
```

- [ ] **Step 3: `offscreen.js`'te `NEMI_SEND_TX` handler**

`offscreen.js`'te mevcut `case "PXE_WALLET_METHOD":` bloğunun yanına:

```js
case "NEMI_SEND_TX": {
  try {
    const serde = await import("./lib/nemi-serde.js");
    const { payload } = message;
    const calls = await Promise.all(
      (payload.calls || []).map((c) => serde.decodeFunctionCall(wallet, c))
    );
    const authWits = await Promise.all(
      (payload.authWitnesses || []).map((aw) => serde.decodeAuthWitnessRequest(aw))
    );
    const capsules = await serde.decodeCapsules(payload.capsules || []);
    const registers = await serde.decodeRegisterContracts(payload.registerContracts || []);

    const acctWallet = getActiveWallet();
    if (!acctWallet) return { error: "No account registered in PXE" };
    for (const r of registers) {
      if (r.instance) await wallet.registerContract(r.instance, r.artifact);
    }
    for (const aw of authWits) {
      if (typeof acctWallet.setPublicAuthWit === "function") {
        await acctWallet.setPublicAuthWit(aw.action, true);
      }
    }
    const tx = await acctWallet.sendTx({ calls, capsules });
    const txHash = tx?.hash?.toString?.() || String(tx);
    return { txHash };
  } catch (e) {
    return { error: e?.message || String(e) };
  }
}
```

Not: `wallet.sendTx` imzası 4.2.0'da `({calls, capsules})` yerine `(calls, capsules)` ise T25 smoke test'te düzelt.

- [ ] **Step 4: Commit**

```bash
git add extension/public/src/background.js extension/public/src/offscreen.js
git commit -m "feat(nemi): aztec_sendTransaction — sign popup + offscreen NEMI_SEND_TX"
```

---

### Task 16: `aztec_call` (no popup)

**Files:**
- Modify: `extension/public/src/background.js`
- Modify: `extension/public/src/offscreen.js`

- [ ] **Step 1: `_nemiCall` gerçekle**

```js
async function _nemiCall(origin, req) {
  const perm = await nemiPerms.getPermission(origin, { live: true });
  if (!perm) return { error: { code: 4100, message: "The requested method requires authorization" } };
  if (!req || typeof req !== "object") return { error: { code: -32602, message: "Invalid params" } };
  const pxeResp = await sendToPXE({ type: "NEMI_CALL", payload: req });
  if (pxeResp?.error) return { error: { code: -32603, message: pxeResp.error } };
  return { result: pxeResp?.results };
}
```

- [ ] **Step 2: `offscreen.js`'e `NEMI_CALL` handler**

```js
case "NEMI_CALL": {
  try {
    const serde = await import("./lib/nemi-serde.js");
    const { payload } = message;
    const calls = await Promise.all(
      (payload.calls || []).map((c) => serde.decodeFunctionCall(wallet, c))
    );
    const registers = await serde.decodeRegisterContracts(payload.registerContracts || []);
    for (const r of registers) {
      if (r.instance) await wallet.registerContract(r.instance, r.artifact);
    }
    const acctWallet = getActiveWallet();
    if (!acctWallet) return { error: "No account registered in PXE" };
    const results = [];
    for (const call of calls) {
      const res = await acctWallet.simulateTx({ calls: [call] });
      results.push((res?.returnValues || []).map((x) => x?.toString?.() ?? String(x)));
    }
    return { results };
  } catch (e) {
    return { error: e?.message || String(e) };
  }
}
```

- [ ] **Step 3: Commit**

```bash
node extension/build.mjs
git add extension/public/src/background.js extension/public/src/offscreen.js
git commit -m "feat(nemi): aztec_call read-only simulation"
```

---

### Task 17: `wallet_watchAssets` + watch popup trigger

**Files:**
- Modify: `extension/public/src/background.js`

- [ ] **Step 1: `_nemiWatchAssets` gerçekle**

```js
async function _nemiWatchAssets(origin, tabId, _reqId, req) {
  if (!req?.assets?.length) return { error: { code: -32602, message: "Invalid params: assets[]" } };

  const popupReqId = `nemiwatch_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (_nemiPendingWatches.has(popupReqId)) {
        _nemiPendingWatches.delete(popupReqId);
        resolve({ error: { code: 4001, message: "User rejected (timeout)" } });
      }
    }, NEMI_CONNECT_TIMEOUT_MS);
    _nemiPendingWatches.set(popupReqId, { origin, tabId, asset: req.assets[0], resolve, timer });
    chrome.windows.create({
      url: `popup.html?nemi-watch=${encodeURIComponent(popupReqId)}`,
      type: "popup",
      width: 380,
      height: 500,
      focused: true,
    }).catch((e) => {
      clearTimeout(timer);
      _nemiPendingWatches.delete(popupReqId);
      resolve({ error: { code: -32603, message: `popup create failed: ${e.message}` } });
    });
  });
}
```

- [ ] **Step 2: Watch approval case'leri**

```js
case "NEMI_GET_PENDING_WATCH": {
  const p = _nemiPendingWatches.get(message.reqId);
  if (!p) { sendResponse({ success: false, error: "Not found" }); break; }
  sendResponse({ success: true, origin: p.origin, asset: p.asset });
  break;
}

case "NEMI_APPROVE_WATCH": {
  const p = _nemiPendingWatches.get(message.reqId);
  if (!p) { sendResponse({ success: false, error: "Not found" }); break; }
  clearTimeout(p.timer);
  _nemiPendingWatches.delete(message.reqId);
  (async () => {
    const r = await chrome.storage.local.get("celari_tokens");
    const existing = r?.celari_tokens || [];
    const opts = p.asset.options;
    if (!existing.find((t) => t.address === opts.address && t.chainId === opts.chainId)) {
      existing.push({
        address: opts.address,
        symbol: opts.symbol,
        name: opts.name,
        decimals: opts.decimals,
        image: opts.image,
        chainId: opts.chainId,
        addedAt: Date.now(),
      });
      await chrome.storage.local.set({ celari_tokens: existing });
    }
    p.resolve({ result: undefined });
    sendResponse({ success: true });
  })();
  return true;
}

case "NEMI_REJECT_WATCH": {
  const p = _nemiPendingWatches.get(message.reqId);
  if (!p) { sendResponse({ success: false, error: "Not found" }); break; }
  clearTimeout(p.timer);
  _nemiPendingWatches.delete(message.reqId);
  p.resolve({ error: { code: 4001, message: "User rejected the asset watch" } });
  sendResponse({ success: true });
  break;
}
```

- [ ] **Step 3: Commit**

```bash
git add extension/public/src/background.js
git commit -m "feat(nemi): wallet_watchAssets + watch popup trigger"
```

---

### Task 18: Connected Sites API (list + revoke)

**Files:**
- Modify: `extension/public/src/background.js`

- [ ] **Step 1: `NEMI_LIST_PERMISSIONS` + `NEMI_REVOKE_ORIGIN` case'leri ekle**

```js
case "NEMI_LIST_PERMISSIONS": {
  (async () => {
    const list = await nemiPerms.listPermissions();
    sendResponse({ success: true, permissions: list });
  })();
  return true;
}

case "NEMI_REVOKE_ORIGIN": {
  (async () => {
    await nemiPerms.revokePermission(message.origin);
    await _nemiBroadcastAccountsChanged(message.origin, []);
    sendResponse({ success: true });
  })();
  return true;
}
```

- [ ] **Step 2: Commit**

```bash
git add extension/public/src/background.js
git commit -m "feat(nemi): list + revoke permissions IPC for popup UI"
```

---

## Phase 5 — Popup Pages (XSS-safe, textContent/createElement only)

### Task 19: Popup routing + `nemi-connect` page

**Files:**
- Modify: `extension/public/popup.html`
- Create: `extension/public/src/pages/nemi-connect.html`
- Create: `extension/public/src/pages/nemi-connect.js`

- [ ] **Step 1: popup.html'in `<head>` bitimine veya `<body>`'nin en üstüne query-string router ekle**

```html
<script>
  (function routeNemi() {
    var p = new URLSearchParams(location.search);
    if (p.has("nemi-connect")) {
      location.replace("src/pages/nemi-connect.html?reqId=" + encodeURIComponent(p.get("nemi-connect")));
    } else if (p.has("nemi-sign")) {
      location.replace("src/pages/nemi-sign.html?reqId=" + encodeURIComponent(p.get("nemi-sign")));
    } else if (p.has("nemi-watch")) {
      location.replace("src/pages/nemi-watch-asset.html?reqId=" + encodeURIComponent(p.get("nemi-watch")));
    }
  })();
</script>
```

- [ ] **Step 2: Oluştur `extension/public/src/pages/nemi-connect.html`**

```html
<!doctype html>
<html><head>
  <meta charset="utf-8">
  <title>Celari — Connect</title>
  <style>
    body { width: 400px; padding: 20px; font-family: system-ui, sans-serif; background: #0a0a0a; color: #eee; margin: 0; }
    .origin { font-size: 14px; color: #888; word-break: break-all; margin: 8px 0; }
    .account { padding: 12px; border: 1px solid #333; border-radius: 8px; margin: 12px 0; font-family: monospace; font-size: 12px; word-break: break-all; }
    .permissions { background: #151515; padding: 12px; border-radius: 8px; margin: 12px 0; font-size: 13px; line-height: 1.5; }
    .permissions ul { margin: 4px 0 0 0; padding-left: 20px; }
    .buttons { display: flex; gap: 8px; margin-top: 16px; }
    button { flex: 1; padding: 10px; border-radius: 8px; cursor: pointer; border: none; font-weight: 600; }
    .reject { background: #222; color: #eee; }
    .approve { background: #0ea5e9; color: #fff; }
    .approve:disabled { background: #555; cursor: not-allowed; }
    #errorMsg { color: #f87171; }
  </style>
</head><body>
  <h2>Siteye Bağlan</h2>
  <div class="origin" id="origin"></div>
  <div>Aktif Hesap</div>
  <div class="account" id="account">Yükleniyor…</div>
  <div class="permissions">
    Bu site şunları yapabilecek:
    <ul>
      <li>Hesap adresini görmek</li>
      <li>Onayınızla transaction göndermek</li>
      <li>Public state okumak</li>
    </ul>
  </div>
  <div id="errorMsg"></div>
  <div class="buttons">
    <button class="reject" id="reject">Reddet</button>
    <button class="approve" id="approve" disabled>Bağlan</button>
  </div>
  <script src="nemi-connect.js" type="module"></script>
</body></html>
```

- [ ] **Step 3: Oluştur `extension/public/src/pages/nemi-connect.js` (textContent only)**

```js
const params = new URLSearchParams(location.search);
const reqId = params.get("reqId");

const originEl = document.getElementById("origin");
const accountEl = document.getElementById("account");
const approveBtn = document.getElementById("approve");
const rejectBtn = document.getElementById("reject");
const errorEl = document.getElementById("errorMsg");

const state = { origin: "", selectedAddress: "", addresses: [], chainId: "0x0" };

function showError(msg) {
  errorEl.textContent = msg;
  approveBtn.disabled = true;
}

async function init() {
  const resp = await chrome.runtime.sendMessage({ type: "NEMI_GET_PENDING_CONNECT", reqId });
  if (!resp?.success) {
    accountEl.textContent = "Bu istek artık geçerli değil.";
    approveBtn.disabled = true;
    return;
  }
  state.origin = resp.origin;
  originEl.textContent = resp.origin;

  const stateResp = await chrome.runtime.sendMessage({ type: "GET_STATE" });
  const accounts = stateResp?.state?.accounts || [];
  const active = accounts[stateResp?.state?.activeAccountIndex || 0];
  if (!active?.address) {
    showError("Hesap yok — önce Celari'de hesap oluştur.");
    accountEl.textContent = "—";
    return;
  }
  state.selectedAddress = active.address;
  state.addresses = [active.address];
  state.chainId = stateResp?.state?.nodeInfo?.l1ChainId
    ? ("0x" + Number(stateResp.state.nodeInfo.l1ChainId).toString(16))
    : "0x0";
  accountEl.textContent = active.address;
  approveBtn.disabled = false;
}

approveBtn.addEventListener("click", async () => {
  approveBtn.disabled = true;
  await chrome.runtime.sendMessage({
    type: "NEMI_APPROVE_CONNECT",
    reqId,
    selectedAddress: state.selectedAddress,
    addresses: state.addresses,
    chainId: state.chainId,
  });
  window.close();
});

rejectBtn.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "NEMI_REJECT_CONNECT", reqId });
  window.close();
});

init().catch((e) => showError(e?.message || "Hata"));
```

- [ ] **Step 4: E2E manuel test**

```bash
node extension/build.mjs
```

DevTools:

```js
let provider;
window.addEventListener("azip6963:announceProvider", (e) => { provider = e.detail.provider; });
window.dispatchEvent(new CustomEvent("azip6963:requestProviders"));
setTimeout(() => provider.request({ method: "aztec_requestAccounts", params: [] })
  .then(r => console.log("connected:", r))
  .catch(e => console.log("rejected:", e.code, e.message)), 100);
```

Expected: Popup açılır, origin + active address. "Bağlan" → `connected: ["0x..."]`. Tekrar `aztec_accounts` → aynı adres döner.

- [ ] **Step 5: Commit**

```bash
git add extension/public/popup.html extension/public/src/pages/nemi-connect.html extension/public/src/pages/nemi-connect.js
git commit -m "feat(nemi): connect popup page + popup.html routing"
```

---

### Task 20: `nemi-sign` popup page

**Files:**
- Create: `extension/public/src/pages/nemi-sign.html`
- Create: `extension/public/src/pages/nemi-sign.js`

- [ ] **Step 1: HTML**

```html
<!doctype html>
<html><head>
  <meta charset="utf-8">
  <title>Celari — Transaction Onayla</title>
  <style>
    body { width: 400px; padding: 20px; font-family: system-ui, sans-serif; background: #0a0a0a; color: #eee; margin: 0; }
    .origin { color: #888; font-size: 13px; word-break: break-all; margin-bottom: 12px; }
    .summary { background: #151515; padding: 12px; border-radius: 8px; }
    .row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 13px; }
    .row .k { color: #888; }
    .row .v { font-family: monospace; }
    .details { margin-top: 12px; display: none; }
    .details.open { display: block; }
    .details pre { background: #000; padding: 12px; border-radius: 8px; font-size: 11px; overflow-x: auto; max-height: 300px; white-space: pre-wrap; }
    #toggle { background: transparent; color: #0ea5e9; border: none; cursor: pointer; padding: 8px 0; }
    .buttons { display: flex; gap: 8px; margin-top: 16px; }
    button.action { flex: 1; padding: 10px; border-radius: 8px; cursor: pointer; border: none; font-weight: 600; }
    .reject { background: #222; color: #eee; }
    .approve { background: #16a34a; color: #fff; }
    .approve:disabled { background: #555; cursor: not-allowed; }
  </style>
</head><body>
  <h2>Transaction Onayla</h2>
  <div class="origin" id="origin"></div>
  <div class="summary">
    <div class="row"><span class="k">Gönderen</span><span class="v" id="from"></span></div>
    <div class="row"><span class="k">Chain</span><span class="v" id="chain"></span></div>
    <div class="row"><span class="k">Call sayısı</span><span class="v" id="callCount"></span></div>
    <div class="row"><span class="k">AuthWit</span><span class="v" id="awCount"></span></div>
    <div class="row"><span class="k">Register contract</span><span class="v" id="rcCount"></span></div>
  </div>
  <button id="toggle">Detayları göster</button>
  <div class="details" id="details">
    <pre id="detailsJson"></pre>
  </div>
  <div class="buttons">
    <button class="action reject" id="reject">Reddet</button>
    <button class="action approve" id="approve" disabled>Onayla</button>
  </div>
  <script src="nemi-sign.js" type="module"></script>
</body></html>
```

- [ ] **Step 2: JS (textContent + JSON.stringify, no HTML injection)**

```js
const params = new URLSearchParams(location.search);
const reqId = params.get("reqId");

function shortAddr(a) {
  if (typeof a !== "string" || a.length < 12) return String(a || "—");
  return a.slice(0, 8) + "…" + a.slice(-6);
}

function showMessage(msg) {
  const el = document.getElementById("origin");
  if (el) el.textContent = msg;
  const approve = document.getElementById("approve");
  if (approve) approve.disabled = true;
}

async function init() {
  const resp = await chrome.runtime.sendMessage({ type: "NEMI_GET_PENDING_SIGN", reqId });
  if (!resp?.success) {
    showMessage("Bu istek artık geçerli değil.");
    return;
  }
  document.getElementById("origin").textContent = resp.origin;
  const payload = resp.payload || {};
  document.getElementById("from").textContent = shortAddr(payload.from);
  document.getElementById("chain").textContent = payload.chainId || "—";
  document.getElementById("callCount").textContent = String((payload.calls || []).length);
  document.getElementById("awCount").textContent = String((payload.authWitnesses || []).length);
  document.getElementById("rcCount").textContent = String((payload.registerContracts || []).length);
  document.getElementById("detailsJson").textContent = JSON.stringify(payload, null, 2);
  document.getElementById("approve").disabled = false;
}

document.getElementById("toggle").addEventListener("click", () => {
  document.getElementById("details").classList.toggle("open");
});

document.getElementById("approve").addEventListener("click", async () => {
  document.getElementById("approve").disabled = true;
  await chrome.runtime.sendMessage({ type: "NEMI_APPROVE_SIGN", reqId });
  window.close();
});

document.getElementById("reject").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "NEMI_REJECT_SIGN", reqId });
  window.close();
});

init().catch((e) => showMessage(e?.message || "Hata"));
```

- [ ] **Step 3: Manuel smoke test**

```bash
node extension/build.mjs
```

DevTools (önce connect et):

```js
const res = await provider.request({
  method: "aztec_sendTransaction",
  params: [{
    chainId: "0x1",
    from: "0x1111111111111111111111111111111111111111111111111111111111111111",
    calls: [],
    authWitnesses: [],
    capsules: [],
    registerContracts: [],
  }],
}).catch(e => e);
console.log(res);
```

Expected: Sign popup açılır → summary + details toggle çalışır → boş calls ile offscreen fail → `-32603` dönüşü.

- [ ] **Step 4: Commit**

```bash
git add extension/public/src/pages/nemi-sign.html extension/public/src/pages/nemi-sign.js
git commit -m "feat(nemi): sign popup page with summary + details toggle (XSS-safe)"
```

---

### Task 21: `nemi-watch-asset` popup page

**Files:**
- Create: `extension/public/src/pages/nemi-watch-asset.html`
- Create: `extension/public/src/pages/nemi-watch-asset.js`

- [ ] **Step 1: HTML**

```html
<!doctype html>
<html><head>
  <meta charset="utf-8">
  <title>Celari — Token Ekle</title>
  <style>
    body { width: 380px; padding: 20px; font-family: system-ui, sans-serif; background: #0a0a0a; color: #eee; margin: 0; }
    .origin { color: #888; font-size: 13px; word-break: break-all; margin-bottom: 12px; }
    .token { display: flex; gap: 12px; align-items: center; padding: 16px; background: #151515; border-radius: 8px; margin: 12px 0; }
    .token img { width: 48px; height: 48px; border-radius: 24px; background: #333; object-fit: cover; }
    .token .name { font-weight: 600; }
    .token .sym { color: #888; font-size: 13px; }
    .token .addr { font-family: monospace; font-size: 11px; color: #666; word-break: break-all; margin-top: 4px; }
    .buttons { display: flex; gap: 8px; margin-top: 16px; }
    button { flex: 1; padding: 10px; border-radius: 8px; border: none; cursor: pointer; font-weight: 600; }
    .reject { background: #222; color: #eee; }
    .approve { background: #0ea5e9; color: #fff; }
  </style>
</head><body>
  <h2>Token Ekle</h2>
  <div class="origin" id="origin"></div>
  <div class="token">
    <img id="img" src="" alt="">
    <div>
      <div class="name" id="name"></div>
      <div class="sym" id="sym"></div>
      <div class="addr" id="addr"></div>
    </div>
  </div>
  <div class="buttons">
    <button class="reject" id="reject">Reddet</button>
    <button class="approve" id="approve">Ekle</button>
  </div>
  <script src="nemi-watch-asset.js" type="module"></script>
</body></html>
```

- [ ] **Step 2: JS (textContent + src attribute — resim URL'i attribute olarak güvenli, textContent değil)**

```js
const params = new URLSearchParams(location.search);
const reqId = params.get("reqId");

function showMessage(msg) {
  const el = document.getElementById("origin");
  if (el) el.textContent = msg;
}

async function init() {
  const resp = await chrome.runtime.sendMessage({ type: "NEMI_GET_PENDING_WATCH", reqId });
  if (!resp?.success) {
    showMessage("Bu istek artık geçerli değil.");
    return;
  }
  document.getElementById("origin").textContent = resp.origin;
  const opts = resp.asset?.options || {};
  document.getElementById("name").textContent = opts.name || "—";
  document.getElementById("sym").textContent = opts.symbol || "—";
  document.getElementById("addr").textContent = opts.address || "—";
  if (opts.image && typeof opts.image === "string" && /^https?:\/\//.test(opts.image)) {
    document.getElementById("img").setAttribute("src", opts.image);
  }
}

document.getElementById("approve").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "NEMI_APPROVE_WATCH", reqId });
  window.close();
});

document.getElementById("reject").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "NEMI_REJECT_WATCH", reqId });
  window.close();
});

init().catch((e) => showMessage(e?.message || "Hata"));
```

Not: `image` URL'i yalnızca `http(s)://` prefix'i olanları kabul eder — `javascript:` veya `data:` URL injection'ını önler.

- [ ] **Step 3: Commit**

```bash
git add extension/public/src/pages/nemi-watch-asset.html extension/public/src/pages/nemi-watch-asset.js
git commit -m "feat(nemi): watch-asset popup page (XSS-safe, http(s) image only)"
```

---

### Task 22: "Connected Sites" UI in main popup (createElement-only)

**Files:**
- Modify: `extension/public/popup.html` (new section)
- Modify: Popup JS (bulunduğu dosyaya göre — mevcut popup state dosyasını bul)

- [ ] **Step 1: popup.html'de (ana görünümdeki uygun yer) Connected Sites bölümü ekle**

```html
<section id="connectedSites" style="margin-top: 20px;">
  <h3>Bağlı Siteler</h3>
  <div id="connectedSitesList"></div>
</section>
```

- [ ] **Step 2: Popup JS'ye load + revoke fonksiyonları ekle**

Popup ana JS dosyasına (örn: popup.js, veya popup.html içindeki mevcut `<script>` bloğuna):

```js
async function loadConnectedSites() {
  const container = document.getElementById("connectedSitesList");
  if (!container) return;
  container.replaceChildren();

  const resp = await chrome.runtime.sendMessage({ type: "NEMI_LIST_PERMISSIONS" });
  const perms = resp?.permissions || [];

  if (perms.length === 0) {
    const empty = document.createElement("p");
    empty.textContent = "Henüz bağlı site yok.";
    empty.style.color = "#888";
    empty.style.fontSize = "13px";
    container.appendChild(empty);
    return;
  }

  for (const p of perms) {
    const row = document.createElement("div");
    row.style.padding = "8px 0";
    row.style.borderBottom = "1px solid #222";
    row.style.display = "flex";
    row.style.justifyContent = "space-between";
    row.style.alignItems = "center";

    const label = document.createElement("div");
    label.style.fontSize = "13px";
    label.style.wordBreak = "break-all";
    label.style.marginRight = "8px";
    label.textContent = p.origin; // textContent — no HTML injection

    const btn = document.createElement("button");
    btn.textContent = "Bağlantıyı Kes";
    btn.style.padding = "4px 8px";
    btn.style.fontSize = "12px";
    btn.style.background = "#7f1d1d";
    btn.style.color = "#fff";
    btn.style.border = "none";
    btn.style.borderRadius = "4px";
    btn.style.cursor = "pointer";
    btn.style.flex = "0 0 auto";
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      await chrome.runtime.sendMessage({ type: "NEMI_REVOKE_ORIGIN", origin: p.origin });
      loadConnectedSites();
    });

    row.appendChild(label);
    row.appendChild(btn);
    container.appendChild(row);
  }
}

// Call on popup open
if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadConnectedSites);
  } else {
    loadConnectedSites();
  }
}
```

- [ ] **Step 3: Manuel test — connect et, popup aç, bağlantıyı kes**

```bash
node extension/build.mjs
```

Reload + bir sitede connect et. Celari popup aç → "Bağlı Siteler" → origin görünüyor + "Bağlantıyı Kes" butonu çalışıyor → sayfada `accountsChanged: []` event'i gelir.

- [ ] **Step 4: Commit**

```bash
git add extension/public/popup.html
git commit -m "feat(nemi): connected sites UI in main popup (createElement-only)"
```

---

## Phase 6 — Test Harness + E2E

### Task 23: Test harness HTML page

**Files:**
- Create: `extension/test-harness/nemi-test.html`
- Create: `extension/test-harness/nemi-test.js`

- [ ] **Step 1: Oluştur nemi-test.html**

```html
<!doctype html>
<html><head>
  <meta charset="utf-8">
  <title>Celari Nemi Test Harness</title>
  <style>
    body { font-family: monospace; padding: 20px; background: #0a0a0a; color: #eee; }
    button { padding: 8px 16px; margin: 4px; background: #0ea5e9; color: #fff; border: none; border-radius: 4px; cursor: pointer; }
    pre { background: #000; padding: 12px; border-radius: 8px; overflow-x: auto; max-height: 500px; white-space: pre-wrap; }
    .section { margin: 20px 0; border: 1px solid #222; padding: 12px; border-radius: 8px; }
  </style>
</head><body>
  <h1>Celari Nemi Test Harness</h1>
  <div class="section">
    <h3>Discovery</h3>
    <button id="discover">1. Request Providers</button>
    <pre id="discoveryLog">—</pre>
  </div>
  <div class="section">
    <h3>RPC Calls</h3>
    <button id="requestAccounts">aztec_requestAccounts</button>
    <button id="accounts">aztec_accounts</button>
    <button id="sendTx">aztec_sendTransaction (empty)</button>
    <button id="call">aztec_call (empty)</button>
    <button id="watchAsset">wallet_watchAssets (USDC)</button>
    <pre id="rpcLog">—</pre>
  </div>
  <div class="section">
    <h3>Events</h3>
    <button id="subscribe">Subscribe to accountsChanged</button>
    <pre id="eventLog">—</pre>
  </div>
  <script src="nemi-test.js"></script>
</body></html>
```

- [ ] **Step 2: nemi-test.js (textContent ile log)**

```js
let provider = null;
const disc = document.getElementById("discoveryLog");
const rpc = document.getElementById("rpcLog");
const ev = document.getElementById("eventLog");

function log(el, msg, data) {
  const stamp = new Date().toISOString().slice(11, 23);
  const line = `[${stamp}] ${msg}\n${data ? JSON.stringify(data, null, 2) : ""}\n\n`;
  el.textContent = line + el.textContent;
}

window.addEventListener("azip6963:announceProvider", (e) => {
  log(disc, "announce received", { info: e.detail?.info });
  provider = e.detail?.provider;
});

document.getElementById("discover").addEventListener("click", () => {
  provider = null;
  log(disc, "dispatching azip6963:requestProviders");
  window.dispatchEvent(new CustomEvent("azip6963:requestProviders"));
});

async function call(method, params = []) {
  if (!provider) { log(rpc, "no provider — run discovery first"); return; }
  try {
    const r = await provider.request({ method, params });
    log(rpc, `${method} → success`, r);
  } catch (e) {
    log(rpc, `${method} → error`, { code: e.code, message: e.message });
  }
}

document.getElementById("requestAccounts").addEventListener("click", () => call("aztec_requestAccounts"));
document.getElementById("accounts").addEventListener("click", () => call("aztec_accounts"));
document.getElementById("sendTx").addEventListener("click", () => call("aztec_sendTransaction", [{
  chainId: "0x1",
  from: "0x1111111111111111111111111111111111111111111111111111111111111111",
  calls: [],
  authWitnesses: [],
}]));
document.getElementById("call").addEventListener("click", () => call("aztec_call", [{
  chainId: "0x1",
  from: "0x1111111111111111111111111111111111111111111111111111111111111111",
  calls: [],
}]));
document.getElementById("watchAsset").addEventListener("click", () => call("wallet_watchAssets", [{
  assets: [{
    type: "ARC20",
    options: {
      chainId: "0x1",
      address: "0x2222222222222222222222222222222222222222222222222222222222222222",
      decimals: 6,
      symbol: "USDC",
      name: "USD Coin",
      image: "https://cryptologos.cc/logos/usd-coin-usdc-logo.png",
    },
  }],
}]));

document.getElementById("subscribe").addEventListener("click", () => {
  if (!provider) { log(ev, "no provider"); return; }
  provider.on("accountsChanged", (addrs) => log(ev, "accountsChanged", addrs));
  log(ev, "subscribed to accountsChanged");
});
```

- [ ] **Step 3: Harness'ı serve et**

```bash
cd extension/test-harness && python3 -m http.server 8765
```

Chrome'da `http://localhost:8765/nemi-test.html` aç. "Request Providers" → announce. "requestAccounts" → connect popup. Tüm 5 RPC butonunu + event subscribe'ı doğrula.

- [ ] **Step 4: Commit**

```bash
git add extension/test-harness/
git commit -m "test(nemi): manual harness for all 5 RPCs + event subscribe"
```

---

### Task 24: bridge.human.tech smoke test documentation

**Files:**
- Create: `docs/superpowers/tests/2026-04-19-nemi-bridge-smoke-test.md`

- [ ] **Step 1: Smoke test checklist**

```markdown
# Nemi-fi Bridge Smoke Test

**Pre-req:** Extension yüklü + reload edilmiş. Celari'de en az 1 deployed account var (testnet). `celari_nemi_enabled = true` (default).

## Steps

### 1. Discovery
- [ ] `https://bridge.human.tech` aç
- [ ] "Connect Wallet" butonuna tıkla
- [ ] **Expected:** Wallet listesinde "Celari" görünüyor (UUID: celari-wallet-eip6963)
- [ ] **Regression:** Obsidion hala listede

### 2. Connect
- [ ] "Celari"yi seç
- [ ] **Expected:** Celari connect popup'ı açılır, origin `https://bridge.human.tech`, aktif hesap gösteriliyor
- [ ] "Bağlan" → popup kapanır → bridge site adresi gösteriyor ("Connected as 0x...")

### 3. Reconnect persistence
- [ ] Bridge sayfasını reload et
- [ ] **Expected:** Connect popup açılmıyor (aztec_accounts otomatik dönüyor)

### 4. Transaction (Deposit L1→L2)
- [ ] Bridge UI'da L1'den L2'ye küçük miktar deposit başlat
- [ ] **Expected:** Celari sign popup'ı açılır, summary görünür (call count > 0)
- [ ] "Detayları göster" → JSON payload okunabilir
- [ ] "Onayla" → popup kapanır → bridge tx hash alır → testnet explorer'da görünür

### 5. Disconnect
- [ ] Celari popup aç → "Bağlı Siteler" → bridge.human.tech için "Bağlantıyı Kes"
- [ ] Bridge sayfasında accountsChanged event'i alındı mı? (dApp UI "Disconnected" gösteriyor mu?)

### 6. Legacy regression
- [ ] `window.celari.isCelari === true` (console)
- [ ] Mevcut iç test dApp'ı (varsa) hala çalışıyor
- [ ] `@aztec/wallet-sdk` kullanan dApp'ler (ECDH protokolü) hala connect edebiliyor

## Failure Debugging

- Discovery list'de Celari yoksa: sayfa DevTools → `[Celari] nemi provider announced (azip6963)` log'u ara, yoksa inpage injection başarısız
- Connect popup açılmıyorsa: background DevTools → `chrome.windows.create` hatası var mı
- Sign popup'ta "payload" boş görünüyorsa: `NEMI_GET_PENDING_SIGN` response kontrol
- Tx fail olursa: offscreen console → `[Nemi]` veya `[PXE]` logları
- Audit: `chrome.storage.local.get("celari_nemi_audit")`
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/tests/2026-04-19-nemi-bridge-smoke-test.md
git commit -m "test(nemi): bridge.human.tech smoke test checklist"
```

---

### Task 25: Final cleanup + full test run + CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Full unit test run**

```bash
cd "/Users/huseyinarslan/Desktop/celari-build-25 kopyası"
npm run test:ext
```

Expected: All tests pass (serde + permissions + rate-limit, ~20 tests total).

- [ ] **Step 2: Full build**

```bash
node extension/build.mjs
```

Expected: No errors. `extension/dist/` güncel.

- [ ] **Step 3: CLAUDE.md'ye nemi provider bölümü ekle**

"Key Architecture Decisions" bölümünün altına yeni madde ekle:

```markdown
- Nemi-fi EIP-1193 provider (inpage-nemi.js) via `azip6963` announce — compatible with bridge.human.tech and any `@nemi-fi/wallet-sdk`-based dApp. Flag: `celari_nemi_enabled` (default true).
```

- [ ] **Step 4: Smoke test'i manuel çalıştır**

`docs/superpowers/tests/2026-04-19-nemi-bridge-smoke-test.md`'deki 6 adımı uygula. Sonuçları commit mesajına not düş.

- [ ] **Step 5: Final commit**

```bash
git add CLAUDE.md
git commit -m "docs: note nemi-fi EIP-1193 provider in architecture decisions"
```

---

## Self-Review Checklist

- [ ] **Spec §3 Goals:**
  - bridge tanıma → T10-11 (announce + injection)
  - Connect akışı → T14 + T19 (popup)
  - Tx onay → T15 + T20
  - Legacy bozulmasın → T10 ayrı dosya + T11 ayrı target; T23 harness multi-protocol test
  - Aztec 4.2.0 ABI → T3-7 serde + T1 audit
- [ ] **Spec §5 Serde map tablosu:** T3-7'de 7 tipin her biri kapsandı (FunctionCall T4, Capsule T5, ContractInstance T6, Artifact T6, RegisterContract T7, AuthWitness T7). Hex helpers T3'te.
- [ ] **Spec §6 Permission model:** T8 (store), T14/15/17 (3 popup), T18 (list/revoke API), T22 (UI)
- [ ] **Spec §7 Error codes:** T12 dispatcher global error; T14/15/16/17'de method-specific (4001, 4100, -32602, -32605)
- [ ] **Spec §7 accountsChanged event:** T14 broadcaster, T18 revoke broadcasts, T10 provider.on/removeListener
- [ ] **Spec §7 Testing Tier 1/2/3:** T2+T3-9 vitest (Tier 1), T23 harness (Tier 2), T24 smoke doc (Tier 3)
- [ ] **Spec §7.5 Feature flag:** T10 provider gate + T11 storage read + bootstrap inject; disable testi T11 Step 3
- [ ] **Spec §10 Success criteria:** T24 smoke test 6 adımının her biri bir success criterion
- [ ] **Placeholder scan:** "TODO"/"TBD"/"implement later" yok. Her step'te ya kod, ya komut.
- [ ] **Type consistency:** `_nemiPendingConnects` T12'de tanımlı, T14'te kullanılıyor. `_nemiBroadcastAccountsChanged` T14 Step 3'te tanımlı, T18'de kullanılıyor. `sendToPXE` mevcut kodda var. `getActiveWallet` mevcut offscreen.js'de var.

## Open Implementation Decisions (Spec §9)

1. `ContractArtifactSchema` import path → T1 audit sonucu belirleyecek
2. Multi-account UI → v1 single only (T19 HTML öyle)
3. `aztec_call` popup'sız → T16 doğrudan
4. Connected Sites UI lokasyonu → T22 main popup'a entegre
5. Artifact URL fetch CSP → T6 implementation sırasında offscreen fetch runtime testi
6. Offscreen CSP güncellemesi → T6 sonunda gerekirse `content_security_policy.extension_pages` güncellenir
