# Nemi-fi EIP-1193 Provider Shim — Design Spec

**Date:** 2026-04-18
**Target:** Celari Wallet (Chrome extension, MV3)
**Motivation:** `bridge.human.tech` ve `@nemi-fi/wallet-sdk` kullanan diğer Aztec dApp'lerinin Celari cüzdanını tanıyabilmesi
**Status:** Design — brainstormed, pending implementation plan
**Approved by:** user (2026-04-18)

---

## 1. Executive Summary

Celari bugün iki protokol destekliyor:

- `window.celari` — kendi özel legacy API'si
- `aztec-wallet-discovery` + ECDH MessageChannel — resmi `@aztec/wallet-sdk` (v4.x) protokolü

Ancak Aztec ekosisteminde dApp'lerin büyük bölümü (bridge.human.tech, Obsidion ecosystem) üçüncü bir SDK kullanıyor: **`@nemi-fi/wallet-sdk`**. Bu SDK kendi discovery protokolünü tanımlıyor:

- `window.dispatchEvent(CustomEvent("azip6963:requestProviders"))`
- `window.addEventListener("azip6963:announceProvider", ...)` ile cüzdan provider'larını topluyor
- Provider EIP-1193 tarzı `request({method, params})` API'si implement ediyor
- 5 RPC metodu: `aztec_requestAccounts`, `aztec_accounts`, `aztec_sendTransaction`, `aztec_call`, `wallet_watchAssets`

Celari bu protokolü hiç yayınlamıyor, bu nedenle bridge.human.tech Celari'yi **göremiyor**. Bu spec, Celari'ye `azip6963` announcement + EIP-1193 provider shim ekleme tasarımını tanımlar. Upstream PR gerekmez — `nemi-fi/wallet-sdk/src/injected.ts` kodu okunduğunda görülüyor ki wallet ID whitelist'i yok, herhangi bir uyumlu provider otomatik tanınıyor.

---

## 2. Problem Statement

### Mevcut durum

Kullanıcı Celari'yi yükleyip bridge.human.tech'te "Connect Wallet" butonuna bastığında Celari wallet listesinde görünmüyor. Sebebi tek: **protokol uyumsuzluğu**. Celari'nin yayınladığı iki protokolü de bridge dinlemiyor.

### Rekabet analizi

| Wallet | Strateji |
|---|---|
| **Obsidion** | `nemi-fi/wallet-sdk` içinde birinci sınıf connector (`src/obsidion.ts`) |
| **Azguard** | `window.azguard` globalini expose ediyor + nemi-fi SDK'da shim var (`src/azguard.ts` — "nuke this when azguard properly implements EIP-6963" yorumuyla) |
| **Celari (hedef)** | Standart `azip6963` EIP-6963-benzeri announce + EIP-1193 provider — upstream coordination gerekmez |

### Versiyon durumu

- Celari: `@aztec/aztec.js 4.2.0`
- `@nemi-fi/wallet-sdk 2.0.3` npm latest, pinli `@aztec/aztec.js 2.0.3`
- bridge.human.tech sitesi Aztec Testnet 4.2.0 hedefliyor (kullanıcı doğruladı)

→ Varsayım: nemi-fi SDK wire-format'ı pragmatik olarak versiyon-toleranslı (tümü primitive hex string); Obsidion'ın bugün çalışması kanıt. Serde layer implementation sırasında fiilen doğrulanacak.

---

## 3. Goals / Non-Goals

### Goals
1. bridge.human.tech ve `@nemi-fi/wallet-sdk` kullanan diğer dApp'ler Celari'yi wallet list'inde otomatik görmeli
2. Kullanıcı connect → address expose → transaction onaylama akışı çalışmalı
3. `wallet_watchAssets` ile dApp'ten gelen token ekleme talebi kullanıcı onayı ile çalışmalı
4. Mevcut `window.celari` legacy API ve `aztec-wallet-discovery` ECDH protokolü bozulmamalı
5. Aztec 4.2.0 ABI ile serialize/deserialize doğru yapılmalı

### Non-Goals
- Upstream PR'ı `nemi-fi/wallet-sdk` repo'suna
- Özel "Celari connector" export — sadece standart EIP-6963 announcement
- WalletConnect v2 entegrasyonu (ayrı spec — Phase 3 roadmap'te)
- iOS tarafında aynı protokolü destekleme (v1'de sadece Chrome extension)
- Multi-chain provider (sadece Aztec; `chainId` kontrolü yapılır ama fallback yok)

---

## 4. Architecture

### 4.1 Mesaj akışı (örnek: `aztec_sendTransaction`)

```
bridge.human.tech (dApp)
   │  window.dispatchEvent("azip6963:requestProviders")
   ▼
inpage-nemi.js  (YENİ — extension/public/src/)
   │  dispatch "azip6963:announceProvider" { info: {uuid,name,icon}, provider }
   │  provider.request({method:"aztec_sendTransaction", params:[...]})
   │  window.postMessage({target:"celari-nemi", type, payload, reqId}, origin)
   ▼
content.js  (nemi relay bloku EKLENİR)
   │  chrome.runtime.sendMessage({origin:"nemi-cs", type, payload, reqId})
   ▼
background.js  _nemiProvider modülü (YENİ)
   │  1. origin izni kontrol → yoksa popup
   │  2. sign popup → kullanıcı onayı
   │  3. raw SerializedX payload'ı JSON string olarak offscreen'e yolla
   ▼
offscreen.js  (nemi-serde.js import edilir)
   │  decode SerializedX → Aztec 4.2.0 tipleri
   │  wallet.sendTx(call, authWitnesses, capsules, registerContracts)
   │  return txHash
   ▲
   └─ ters yolla dönüp inpage-nemi.js'te Promise resolve olur
```

### 4.2 Yeni dosyalar

| Dosya | Sorumluluk | ~LOC |
|---|---|---|
| `extension/public/src/inpage-nemi.js` | azip6963 announce + EIP-1193 provider (5 RPC, events) | ~180 |
| `extension/public/src/lib/nemi-serde.js` | Serialized↔Aztec 4.2.0 tip çevirimi (offscreen'de load) | ~220 |
| `extension/public/src/lib/nemi-permissions.js` | Origin-based consent store (chrome.storage wrapper) | ~80 |
| `extension/public/src/pages/nemi-connect.html`  + `.js` | Connect approval UI (hesap seç + origin) | ~120 |
| `extension/public/src/pages/nemi-sign.html` + `.js` | Transaction approval UI (call decode + details) | ~150 |
| `extension/public/src/pages/nemi-watch-asset.html` + `.js` | Token ekleme onayı | ~60 |

### 4.3 Değişen mevcut dosyalar

| Dosya | Değişiklik |
|---|---|
| `extension/public/manifest.json` | `web_accessible_resources` → `inpage-nemi.js` eklenir |
| `extension/public/src/content.js` | `inpage-nemi.js` inject + `celari-nemi` target mesaj relay'i |
| `extension/public/src/background.js` | `_nemiProvider` modülünü import + 7 yeni mesaj case (CONNECT_REQUEST, SIGN_REQUEST, CALL_REQUEST, WATCH_ASSET_REQUEST + APPROVE/REJECT/TIMEOUT karşılıkları) |
| `extension/public/src/offscreen.js` | `nemi-serde.js` import + `NEMI_SEND_TX`/`NEMI_CALL` handler'ları |
| `extension/public/src/popup.html` + popup.js | `?nemi-connect=...`, `?nemi-sign=...`, `?nemi-watch=...` query string route |

### 4.4 Mevcut kodla çakışma

- `window.celari` legacy API: **korunur**, `celari-content` target değişmez
- `aztec-wallet-discovery` ECDH protokolü (`@aztec/wallet-sdk` v4.x uyumlu): **korunur**
- `_nemiProvider` tamamen ayrı kanal: `chrome.runtime.onMessage` handler'ında `origin:"nemi-cs"` ile ayrıştırılır
- `offscreen.js`'te `handleWalletMethod` mevcut; `nemi-serde` sadece decode layer ekler, PXE çağrıları aynı

### 4.5 Neden serde layer'ı offscreen.js'te
`@aztec/aztec.js` ve `@aztec/stdlib` paketleri sadece offscreen.js'te bundled. Background service worker onlara erişemez. Dolayısıyla background, raw JSON payload'ı taşır; decode offscreen'de olur. Bu aynı zamanda performans olarak da iyi — background'da ağır tip construction yok.

---

## 5. Serde Adapter

### 5.1 Referans implementasyon

nemi-fi'nin kendi `src/serde.ts` dosyası (okundu: GitHub `nemi-fi/wallet-sdk`) birebir referans olarak kullanılacak. Dosya 166 satır, encoding/decoding pure functions + PXE'den artifact zenginleştirmesi içeriyor. Aztec 4.2.0 API yüzeyi (AztecAddress, Fr, FunctionSelector, Capsule, PublicKeys, ContractArtifactSchema, getAllFunctionAbis) nemi'nin kullandığı 2.0.3 yüzeyi ile aynı — fiilen bire bir port edilebilir.

### 5.2 Map tablosu (input: dApp'ten gelen)

| Nemi `Serialized*` | Aztec 4.2.0 dest | Çeviri fn |
|---|---|---|
| `"0xabcd..."` AztecAddress str | `AztecAddress` | `AztecAddress.fromString(s)` |
| `"0x..."` Fr str | `Fr` | `Fr.fromHexString(s)` args için, `Fr.fromString(s)` salt/slot için (nemi'nin ayrımı) |
| `SerializedFunctionCall {to, selector, args[]}` | `FunctionCall {to, selector, args, name, type, isStatic, returnTypes}` | `decodeFunctionCall(pxe, fc)` — PXE'den `getContractMetadata → getContractClassMetadata(classId, true) → getAllFunctionAbis()` zinciri ile selector eşleştir ve zenginleştir |
| `SerializedCapsule {contract, storageSlot, data[]}` | `Capsule` | `new Capsule(addr, slot, data[])` (3-arg ctor) |
| `SerializedAuthWitness {caller, action}` | `{caller: AztecAddress, action: FunctionCall}` | `account.setPublicAuthWit(msgHash, true)` akışında kullanılır (private değil public) |
| `SerializedContractInstance {version, salt, deployer, originalContractClassId, currentContractClassId, initializationHash, publicKeys}` | `ContractInstanceWithAddress` | `decodeContractInstance` — `version = parseInt(hex, 16)`, `publicKeys = PublicKeys.fromString(...)`, diğerleri `Fr.fromString` / `AztecAddress.fromString` |
| `SerializedContractArtifact {type:"url"\|"literal"}` | `ContractArtifact` | `decodeContractArtifact` — `url` ise fetch (cache) → sonra `ContractArtifactSchema.parse(literal)` (`@aztec/stdlib/abi`'den import) |

### 5.3 Map tablosu (output: dApp'e dönen)

| Aztec 4.2.0 | Wire format | Çeviri |
|---|---|---|
| `AztecAddress` | `"0x..."` | `.toString()` |
| `Fr` | `"0x..."` | `.toString()` |
| `TxHash` | `"0x..."` | `.toString()` |
| `Fr[][]` (aztec_call return) | `string[][]` | `.map(r => r.map(x => x.toString()))` |

### 5.4 Doğrulama gereken API'ler

Aşağıdaki imports'ların 4.2.0'da var olduğu varsayımı serde.ts'ten kopyalanmaktadır. Plan'ın **ilk task'ı** bunları fiilen runtime'da doğrulamak olacak (tek bir test dosyasıyla import + instantiation):

1. `AztecAddress, Fr, FunctionSelector, Capsule, PublicKeys, getAllFunctionAbis` from `@aztec/aztec.js`
2. `ContractArtifactSchema` from `@aztec/stdlib/abi`
3. `ContractInstance.version` alan tipi hala `number` mi?
4. `pxe.getContractClassMetadata(classId, true)` — true flag ile artifact döner mi?
5. `FunctionCall` tipi şeması: `{to, selector, args, name?, type?, isStatic?, returnTypes?}`

Sapma bulunursa `nemi-serde.js`'te adapt edilir; map tablosu güncellenir.

### 5.5 `ox` bağımlılığı
Nemi `ox` library'den sadece `Hex.fromNumber/toNumber` kullanıyor. Native JS ile değiştirilecek (helper ~5 LOC):
```js
const toHex = (n) => "0x" + n.toString(16);
const fromHex = (h) => parseInt(h, 16);
```
Yeni npm dep eklenmiyor.

### 5.6 Artifact URL fetch

dApp artifact URL'si gönderirse download gerekir. Alternatifler:

- **(a)** `optional_host_permissions` ile runtime isteyip background'dan fetch (origin kullanıcıdan izin ister)
- **(b)** offscreen'den fetch — offscreen document extension origin'inden çalıştığı için CORS kontrolü aktif, güvenli **← seçilen yol**

Implementation: `decodeContractArtifact` içinde `fetch(url)` offscreen'de yapılır; download cache'i (Promise map) tekrarı önler. CSP content_security_policy'de dışarı fetch serbest (offscreen document için CSP'yi güncelleme gereği olmayabilir; implementation sırasında doğrulanacak).

---

## 6. Permission Model + Popup Flow

### 6.1 Permission storage

Key: `celari_nemi_perms` (chrome.storage.local)

Value:
```json
{
  "https://bridge.human.tech": {
    "connectedAt": 1712345678901,
    "addresses": ["0xabc...", "0xdef..."],
    "selectedAddress": "0xabc...",
    "chainId": "0x1674512022",
    "revoked": false
  },
  "https://app.aztec-dex.xyz": { "...": "..." }
}
```

Origin full form (protokol dahil) — http/https ayrılır. Wildcard yok.

### 6.2 RPC → popup matrisi

| Metod | Popup? | Tekrar | Notlar |
|---|---|---|---|
| `aztec_requestAccounts` | İLK KEZ | sonraki çağrılarda popup yok | `celari_nemi_perms[origin]` var ve `!revoked` ise popup atla |
| `aztec_accounts` | Hayır | — | Bağlı değilse `[]` döner (hata değil) |
| `aztec_sendTransaction` | HER ÇAĞRI | — | 5 dk timeout |
| `aztec_call` | Hayır | — | Bağlı olma şartı (yoksa `4100 Unauthorized`) |
| `wallet_watchAssets` | HER ASSET | — | 2 dk timeout |

### 6.3 Popup 1: `nemi-connect`

**URL:** `popup.html?nemi-connect=<requestId>` (400x600 window)

**UI elemanları (v1 MVP):**
- Origin header (favicon + origin)
- "Celari Wallet'ınızı bu siteye bağlayın" başlığı
- Tek aktif hesap gösterimi (adres short form, multi-select v2'ye ertelendi — bkz. §9)
- Chain info: "Aztec Testnet (chainId: …)"
- İzin listesi: "Hesap adresini görmek / Onayınızla tx göndermek / Public state okumak"
- Butonlar: **Reddet** | **Bağlan**

**Akış:**
1. Kullanıcı "Bağlan" → background `celari_nemi_perms[origin]` yazar
2. EIP-1193 response: `[selectedAddress, ...otherAddresses]`
3. `accountsChanged` event dispatch
4. Popup kapanır

Zaman aşımı: 2 dakika (pending request silinir).

### 6.4 Popup 2: `nemi-sign`

**URL:** `popup.html?nemi-sign=<requestId>` (400x700 window)

**UI (iki görünüm):**

*Summary (default):*
- Origin header
- `calls.length` / `authWitnesses.length` / `registerContracts.length` sayıları
- `from` hesap adresi (short form)
- Chain info

*Details (toggle, lazy decode):*
- Her `FunctionCall` için: `contract: shortAddr` + `method: <name>` (PXE decode'dan) + `args: hex[]`
- Her `AuthWitness` için: "authorizes: <method> on <contract>"
- Her register edilecek contract için: address + artifact ismi

**Neden lazy decode:** Details açılana kadar PXE'den `getContractMetadata` + `getContractClassMetadata` + `getAllFunctionAbis` çağrıları yapılmaz (~500ms block). Popup açılışı hızlı kalır.

**Akış:**
1. Kullanıcı "Onayla" → background offscreen'e `NEMI_SEND_TX` (raw SerializedX payload)
2. offscreen decode + `wallet.sendTx(...)`
3. TxHash → inpage-nemi.js → dApp

Zaman aşımı: 5 dakika.

### 6.5 Popup 3: `nemi-watch-asset`

**URL:** `popup.html?nemi-watch=<requestId>` (380x500)

**UI:** Token info (symbol, name, decimals, image) + "Ekle" / "Reddet".

**Akış:** Onaylanırsa `celari_tokens` storage'ına yazılır, mevcut popup token listesine yansır.

### 6.6 Origin yönetimi

Popup.html'e **"Bağlı Siteler"** erişimi (mevcut popup yapısına bağlı: yeni sekme ya da settings modal — plan task'ında popup mimarisine göre karar verilir):
- `celari_nemi_perms`'ten origin listesi
- Her origin için "Bağlantıyı Kes" → `revoked:true` + `accountsChanged:[]` emit

### 6.7 Güvenlik kısıtları

| Risk | Mitigation |
|---|---|
| Origin spoofing | Origin **asla** content.js payload'ından okunmaz; `sender.tab.url` → `new URL(...).origin` |
| Concurrent popup spam | `_nemiPendingConnects` Map'inde origin key; ikinci request mevcut popup'ı focus eder |
| Popup bypass (rate spam) | Origin başına 10 tx/dk rate limit; aşım → `-32005 LimitExceeded` |
| Extension reload | `celari_nemi_perms` persist; reload sonrası `aztec_accounts` geri döner, `accountsChanged` emit edilir |
| Selected address ≠ Celari aktif account | Connect'te kullanıcı seçer; Celari UI'da aktif değişirse bağlı origin'lere `accountsChanged` emit |

---

## 7. Error Handling, Events, Testing

### 7.1 EIP-1193 hata kodları

| Durum | Kod | Message |
|---|---|---|
| Kullanıcı connect reddetti | 4001 | "User rejected the request" |
| Kullanıcı tx reddetti | 4001 | "User rejected the transaction" |
| Bağlı değil + read/send | 4100 | "The requested method requires authorization" |
| Bilinmeyen method | 4200 | "Method <name> not supported" |
| chainId uyumsuz | 4901 | "Wallet is on different chain" |
| Rate limit | -32005 | "Rate limit exceeded" |
| PXE internal | -32603 | passthrough |
| Malformed payload | -32602 | "Invalid params: <field>" |

Hata objesi:
```js
const err = new Error(message);
err.code = 4001;
err.data = { reason: "..." };
throw err;
```

### 7.2 Events (EIP-1193)

**`accountsChanged`** — ne zaman:
1. Celari popup'ında aktif hesap değişti ve bu origin için selectedAddress farklılaştıysa
2. "Bağlantıyı Kes" → `[]` dispatch
3. (v2) Yeni hesap origin'e eklendiyse

**Implementation:** background → ilgili tab'lere `chrome.tabs.sendMessage` → content.js relay → inpage-nemi.js handler listesini çağırır.

Provider API:
```js
provider.on(event, handler);        // listener ekler
provider.removeListener(event, handler);  // kaldırır
```

### 7.3 Testing stratejisi

**Mevcut test altyapısı yok.** Scope'u patlatmamak için üç tier:

**Tier 1 — Unit (vitest yeni setup, opsiyonel):**
- `nemi-serde.js` pure function'lar — JSON fixture → Aztec tip deep equal
- `nemi-permissions.js` chrome.storage mock ile

**Tier 2 — Manuel harness (HTML, zorunlu):**
- `extension/test-harness/nemi-test.html` — 5 buton (5 RPC), `azip6963:requestProviders` dispatch + response log
- Fixture payload'lar: test token contract için hardcoded SerializedFunctionCall / SerializedContractInstance
- Legacy + nemi-fi + wallet-sdk v4 ECDH — üçünün aynı anda çalıştığı doğrulanır

**Tier 3 — Gerçek E2E (bridge.human.tech):**
- Connect → list'de görünüyor mu
- Connect popup'ı açılıyor + hesap expose
- Deposit akışı → sendTransaction çalışıyor
- Her release öncesi smoke test

Feature-specific risk notları:
- Bridge artifact formatı bilinmiyor (url / literal) → Tier 2'de her ikisi test edilir
- `wallet_watchAssets` muhtemelen çağrılmıyor → v1'de stub kabul edilir ama implement edilir

### 7.4 Gözlemlenebilirlik

background.js logging:
```
[Nemi] azip6963 announced to <origin>
[Nemi] <origin> requested <method> (reqId=<id>)
[Nemi] <origin> connect approved, accounts=[<n>]
[Nemi] <origin> tx approved, hash=<0x...>
[Nemi] <origin> rate limit exceeded
[Nemi] serde error: <field> invalid — <msg>
```

Popup'ta opsiyonel "Activity" sekmesi (v1 sonrası) — son 50 RPC çağrısı.

### 7.5 Feature flag

`chrome.storage.local.celari_nemi_enabled` — default `true`.

- Popup Ayarlar sekmesinde toggle
- `false` → inpage-nemi.js dispatch etmez (legacy kanallar çalışır)
- İlk stability issue'ları için emergency-off

---

## 8. Out of Scope (v1)

- Multi-chain provider fallback (sadece Aztec)
- iOS (WKWebView) tarafında aynı protokol
- WalletConnect v2 (Phase 3 roadmap)
- `aztec_estimateGas` (nemi-fi'nin type'ında TODO olarak var, henüz kullanılmıyor)
- EIP-1193 `request({method: "eth_*"})` (EVM metodları — no-op döner)
- Activity/audit log UI (logging var ama UI v1 sonrası)
- `nemi-fi/wallet-sdk` upstream PR (gerekmiyor)

---

## 9. Open Questions / Implementation-Time Decisions

1. **`ContractArtifactSchema` import path 4.2.0'da değişti mi?** — plan task #1'de runtime doğrulanacak
2. **Popup UX: multi-account expose mu, tek aktif hesap mı?** — plan'da MVP: aktif hesap only; multi-select v2
3. **`aztec_call` popup'sız mı kalsın?** — evet, read-only (mevcut `executeUtility` zaten auto-register yapıyor); PII sızıntı riski kabul edilebilir (dApp contract'ı zaten on-chain görebilir)
4. **Origin yönetimi popup'ta mı sidepanel'de mi?** — popup.html'de (sekme veya settings modal — mevcut popup yapısına göre plan task'ında netleşir)
5. **Bridge artifact URL formatı (url vs literal) ilk test sonucu** — implementation sırasında Tier 2 harness'ında ölçülür
6. **Offscreen document'ten dış URL fetch CSP/network izinleri** — `content_security_policy.extension_pages` offscreen'i de kapsıyor mu, manifest güncellemesi gerekiyor mu? Implementation task'ında runtime kontrol edilir

---

## 10. Success Criteria

- [ ] bridge.human.tech "Connect Wallet" listesinde "Celari" görünüyor
- [ ] Connect → Celari popup → onay → address dApp'e dönüyor
- [ ] Deposit L1→L2 akışı bir uçtan bir uca çalışıyor (tx onay + PXE sendTx + receipt)
- [ ] `window.celari` legacy API regression yok
- [ ] `aztec-wallet-discovery` ECDH protokolü regression yok
- [ ] Extension reload sonrası `aztec_accounts` previously-connected origin'e doğru değeri döner
- [ ] Tier 2 harness 3 protokolü de paralel simule edebiliyor
- [ ] Feature flag kapalıyken hiçbir nemi kanalı announce edilmiyor

---

## 11. Referanslar

- `nemi-fi/wallet-sdk/src/injected.ts` (discovery protokolü)
- `nemi-fi/wallet-sdk/src/types.ts` (5 RPC method signature)
- `nemi-fi/wallet-sdk/src/serde.ts` (encoding/decoding reference)
- `nemi-fi/wallet-sdk/src/azguard.ts` (Azguard shim — bizim yapmayacağımız şey)
- Celari: `extension/public/src/content.js`, `background.js` (mevcut ECDH akışı)
- Celari: `extension/public/src/offscreen.js` — `handleWalletMethod` (PXE bridge)
- CLAUDE.md — `@aztec/aztec.js 4.2.0` testnet pin
