# Celari Wallet - Eksikler ve Düzeltme Planı

## FAZE A: Kritik Düzeltmeler (Güvenlik + Doğruluk)

### A1. Extension dosya duplikasyonu çöz
**Sorun:** `extension/src/` ve `extension/public/src/` arasında farklılıklar var. `public/src/` daha güncel ama `src/` eski kalmış. Manifest `public/src/` dosyalarını kullanıyor, yani `extension/src/` şu anda dead code.

**Çözüm:**
- `extension/src/` klasörünü tamamen sil (dead code, manifest zaten `public/src/` kullanıyor)
- Geliştirme kaynak dosyası olarak `extension/public/src/` tek kaynak olacak
- İleride build pipeline eklendiğinde (Faz C3) bu yeniden yapılandırılacak

**Dosyalar:**
- Silinecek: `extension/src/background.js`, `extension/src/content.js`, `extension/src/inpage.js`, `extension/src/pages/popup.js`

---

### A2. Nargo.toml ve package.json versiyon senkronizasyonu
**Sorun:** Noir contract `v3.0.3` tag'ı kullanıyor, JS bağımlılıkları `3.0.2`. Breaking change riski.

**Çözüm:**
- `contracts/celari_passkey_account/Nargo.toml` → tag'ı `v3.0.2`'ye indir (JS ile eşitle)
- Veya `package.json` bağımlılıklarını `3.0.3`'e yükselt
- **Tercih:** Nargo.toml'u `v3.0.2`'ye düşür (daha az riskli — JS paketleri test edilmiş)

**Dosyalar:**
- `contracts/celari_passkey_account/Nargo.toml` satır 8

---

### A3. Deploy server CORS güvenlik düzeltmesi
**Sorun:** `Access-Control-Allow-Origin: *` herhangi bir web sitesinden hesap deploy edilmesine olanak tanıyor.

**Çözüm:**
- Allowed origins listesi ekle: `chrome-extension://`, `http://localhost:*`, konfigüre edilebilir CORS_ORIGIN env
- Preflight handler'da da aynı kontrol

**Dosyalar:**
- `scripts/deploy-server.ts` → `cors()` fonksiyonu (satır 141-145)

---

### A4. Secret key dosya yazımı güvenliği
**Sorun:** `secretKey` ve `privateKeyPkcs8` düz metin JSON'a yazılıyor. `.gitignore`'da olmasına rağmen yanlışlıkla commit riski var.

**Çözüm:**
- Dosya oluştururken `0600` permission set et (sadece owner okuyabilir)
- Deploy sonrası console'a "WARNING: .celari-keys.json contains private keys" uyarısı ekle
- `.gitignore`'a yorum ekle: "# CRITICAL: Bu dosyalar private key içerir"

**Dosyalar:**
- `scripts/deploy_passkey_account.ts` satır 80 ve 177
- `.gitignore` satır 8-14

---

### A5. Content script postMessage origin güvenliği
**Sorun:** `window.postMessage({...}, "*")` tüm origin'lere mesaj gönderiyor.

**Çözüm:**
- `"*"` yerine `window.location.origin` kullan

**Dosyalar:**
- `extension/public/src/content.js` satır 33 ve 50

---

## FAZE B: Orta Seviye Düzeltmeler (Doğruluk + Tutarlılık)

### B1. Noir test dosyasında tip düzeltmesi
**Sorun:** `test.nr` Field olarak geçiyor ama constructor `[u8; 32]` bekliyor. Aztec TXE test framework'ü burada implicit conversion yapıyor olabilir ama semantik olarak hatalı.

**Çözüm:**
- Test'te constructor'ı `interface()` üzerinden çağırıyorsa TXE framework dönüşümü handle ediyor olabilir
- Yine de yorum ekle: "Note: Field to [u8;32] conversion handled by deploy_self framework"
- Veya byte array olarak düzelt (daha doğru)

**Dosyalar:**
- `contracts/celari_passkey_account/src/test.nr` satır 21-22, 38-39

---

### B2. Auth witness layout tutarsızlığı
**Sorun:** Test 128 Field pack ediyor (sig 64 + authData 32 + clientData 32) ama contract sadece 64 Field okuyor.

**Çözüm:**
- Test 8'i (Auth Witness Layout) düzelt: 64 Field'a düşür (contract'la eşleştir)
- Veya comment ekle: "Extended layout — contract only reads first 64, rest for future use"

**Dosyalar:**
- `src/test/e2e/passkey_account.test.ts` Test 8 (satır 270-302)

---

### B3. README hataları düzelt
**Sorun:** Node.js 18+ yazıyor ama 22+ lazım, repo URL doğrulanmamış, test sayısı yanlış.

**Çözüm:**
- Node.js versiyonunu `22+` olarak güncelle
- Repo URL'ini gerçek repo URL ile değiştir veya placeholder yap
- Test sayısını güncel rakamla değiştir
- `yarn compile && yarn codegen` yerine `yarn build` (script zaten bunu yapıyor)

**Dosyalar:**
- `README.md` satır 55, 61-66, 113-115

---

### B4. Hardcoded token adresi düzelt
**Sorun:** `mint-token.ts` dosyasında hardcoded token adresi var.

**Çözüm:**
- `.celari-token.json`'dan oku, yoksa env variable'dan al, yoksa hata ver

**Dosyalar:**
- `scripts/mint-token.ts` satır 21

---

### B5. Gereksiz icon dosyaları temizle
**Sorun:** `extension/public/icons/` altında duplicate icon dosyaları (tiresiz olanlar kullanılmıyor).

**Çözüm:**
- `icon16.png`, `icon48.png`, `icon128.png` dosyalarını sil (manifest tire'li olanları kullanıyor)

**Dosyalar:**
- Silinecek: `extension/public/icons/icon16.png`, `icon48.png`, `icon128.png`

---

### B6. Manifest.json versiyon uyumsuzluğu
**Sorun:** `manifest.json` v0.3.0, `package.json` v0.2.0, `inpage.js` v0.2.0.

**Çözüm:**
- Tümünü `0.3.0`'a eşitle (en güncel olan manifest'teki versiyon)

**Dosyalar:**
- `package.json` satır 3
- `extension/public/src/inpage.js` satır 59

---

## FAZE C: İyileştirmeler (Kalite + Profesyonellik)

### C1. Background service worker'da chrome.alarms kullan
**Sorun:** `setInterval` MV3 service worker'da güvenilir değil. Chrome 30 saniye sonra worker'ı uyutabilir.

**Çözüm:**
- `setInterval` yerine `chrome.alarms.create("keepAlive", { periodInMinutes: 0.5 })`
- `chrome.alarms.onAlarm.addListener` ile `checkConnection()` çağır
- `manifest.json`'a `"alarms"` permission ekle

**Dosyalar:**
- `extension/public/src/background.js` satır 217
- `extension/public/manifest.json` permissions

---

### C2. tsconfig.json types düzeltmesi
**Sorun:** `"types": ["jest", "node"]` ama `@types/jest` yüklü değil, `@jest/globals` kullanılıyor.

**Çözüm:**
- `"types": ["node"]` olarak düzelt (jest types `@jest/globals` import ile geliyor)

**Dosyalar:**
- `tsconfig.json` satır 15

---

### C3. Kullanılmayan export temizliği
**Sorun:** `getPasskeyAccountDeployArgs` fonksiyonu hiçbir yerde kullanılmıyor.

**Çözüm:**
- Şimdilik kalsın (SDK'nın bir parçası, dış kullanıcılar kullanabilir)
- Ama `@internal` veya `@beta` JSDoc tag'ı ekle

**Dosyalar:**
- `src/utils/passkey_account.ts` satır 76

---

### C4. Eski deploy-token.ts ve deploy-token-v2.ts birleştir
**Sorun:** İki farklı token deploy scripti var, kafa karıştırıcı.

**Çözüm:**
- `deploy-token.ts`'i sil (eski versiyon)
- `deploy-token-v2.ts`'i `deploy-token.ts` olarak yeniden adlandır
- `package.json` scriptini güncelle

**Dosyalar:**
- Silinecek: `scripts/deploy-token.ts`
- Rename: `scripts/deploy-token-v2.ts` → `scripts/deploy-token.ts`
- `package.json` satır 13

---

### C5. Jest testTimeout düşür
**Sorun:** Global timeout 10 dakika, her test'te zaten 5 dakika var.

**Çözüm:**
- Global timeout'u `300_000` (5 dakika) yap

**Dosyalar:**
- `jest.config.ts` satır 16

---

### C6. .gitignore'a güvenlik yorumları ekle
**Çözüm:**
- Hassas dosya bölümüne açıklayıcı uyarılar ekle

**Dosyalar:**
- `.gitignore`

---

## FAZE D: Gelecek İyileştirmeler (İsteğe bağlı)

### D1. ESLint + Prettier kurulumu
- `eslint.config.js` ve `.prettierrc` ekle
- `package.json`'a `lint` ve `format` scriptleri ekle

### D2. Unit testler (passkey.ts fonksiyonları)
- `bytesToHex`, `hexToBytes`, `normalizeP256Signature`, `padTo32Bytes` için unit test yaz
- E2E testlerden bağımsız çalışabilir testler

### D3. Extension build pipeline
- Vite veya esbuild ile `extension/src/` → `extension/public/src/` derleme
- Hot reload desteği

### D4. CI/CD pipeline
- GitHub Actions: lint + test + build
- Contract compilation check

### D5. Gerçek bakiye sorgulama
- PXE üzerinden gerçek token bakiyesi sorgula
- Demo data'yı kaldır, gerçek data ile değiştir

---

## Uygulama Sırası

```
A1 → A2 → A3 → A4 → A5 (Güvenlik, hemen yapılmalı)
  ↓
B1 → B2 → B3 → B4 → B5 → B6 (Doğruluk, aynı gün)
  ↓
C1 → C2 → C3 → C4 → C5 → C6 (Kalite, bu hafta)
  ↓
D1 → D2 → D3 → D4 → D5 (Gelecek fazlar)
```

Toplam: A (5) + B (6) + C (6) = **17 düzeltme** hemen uygulanabilir.
