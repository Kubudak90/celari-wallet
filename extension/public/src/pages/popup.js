/**
 * Celari Wallet — Popup UI
 *
 * Complete wallet interface rendered in the extension popup.
 *
 * Screens:
 * 1. Onboarding → Create wallet with passkey
 * 2. Dashboard  → Balance, tokens, actions
 * 3. Send       → Private transfer form + passkey signing
 * 4. Receive    → Address display + QR
 * 5. Activity   → Transaction history
 * 6. Settings   → Network, account, passkey management
 */

// ─── State Management ─────────────────────────────────

const store = {
  screen: "loading",       // loading | onboarding | dashboard | send | receive | activity | settings
  connected: false,
  network: "local",
  nodeUrl: "http://localhost:8080",
  nodeInfo: null,          // { nodeVersion, l1ChainId, protocolVersion }
  accounts: [],
  activeAccountIndex: 0,
  tokens: [],
  activities: [],
  sendForm: { to: "", amount: "", token: "zkUSD" },
  toast: null,
  loading: false,
};

function setState(updates) {
  Object.assign(store, updates);
  render();
}

function getActiveAccount() {
  return store.accounts[store.activeAccountIndex] || null;
}

// ─── Initialize ───────────────────────────────────────

async function init() {
  // Load state from background
  try {
    const response = await chrome.runtime.sendMessage({ type: "GET_STATE" });
    if (response?.success) {
      store.connected = response.state.connected;
      store.network = response.state.network;
      store.nodeUrl = response.state.nodeUrl;
      store.nodeInfo = response.state.nodeInfo;
      store.accounts = response.state.accounts || [];
    }
  } catch (e) {
    console.warn("Background not ready, using defaults");
  }

  // Load saved accounts from storage
  try {
    const stored = await chrome.storage.local.get("celari_accounts");
    if (stored.celari_accounts?.length) {
      store.accounts = stored.celari_accounts;
    }
  } catch (e) {}

  // Determine initial screen
  store.screen = store.accounts.length > 0 ? "dashboard" : "onboarding";

  // If has accounts, add demo tokens
  if (store.accounts.length > 0) {
    store.tokens = getDemoTokens();
    store.activities = getDemoActivities();
  }

  render();
}

// ─── Demo Data ────────────────────────────────────────

function getDemoTokens() {
  return [
    { name: "Celari USD", symbol: "zkUSD", balance: "1,250.00", value: "$1,250.00", icon: "💵", color: "#10b981" },
    { name: "Wrapped ETH", symbol: "zkETH", balance: "0.842", value: "$2,231.70", icon: "⟠", color: "#627eea" },
    { name: "Celari Token", symbol: "ZKP", balance: "5,000", value: "$150.00", icon: "🔐", color: "#C4A96A" },
  ];
}

function getDemoActivities() {
  return [
    { type: "receive", label: "Maaş alındı", from: "0x1a2b...9f3e", amount: "+1,250.00 zkUSD", time: "2 saat önce", private: true },
    { type: "send", label: "Kart harcaması", to: "0x4c5d...8a1b", amount: "-45.00 zkUSD", time: "5 saat önce", private: true },
    { type: "send", label: "Transfer", to: "0x7e8f...2c3d", amount: "-200.00 zkUSD", time: "1 gün önce", private: true },
    { type: "receive", label: "Bridge deposit", from: "L1→L2", amount: "+0.842 zkETH", time: "2 gün önce", private: false },
  ];
}

// ─── SVG Icons ────────────────────────────────────────

const icons = {
  shield: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
  send: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`,
  download: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
  copy: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>`,
  back: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>`,
  settings: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>`,
  fingerprint: `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 12C2 6.5 6.5 2 12 2a10 10 0 018 4"/><path d="M5 19.5C5.5 18 6 15 6 12c0-3.5 2.5-6 6-6 2 0 3.7 1 4.8 2.5"/><path d="M12 10c-1.1 0-2 .9-2 2 0 4-1 7.5-3 9.5"/><path d="M12 10c1.1 0 2 .9 2 2 0 3.5-.5 6.5-2 9"/><path d="M18 14c0 2.5-.5 5-1.5 7"/></svg>`,
  lock: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>`,
  eye: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`,
  eyeOff: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`,
  check: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>`,
};

// ─── Render Engine ────────────────────────────────────

function render() {
  const root = document.getElementById("root");
  switch (store.screen) {
    case "loading":
      root.innerHTML = renderLoading();
      break;
    case "onboarding":
      root.innerHTML = renderOnboarding();
      bindOnboarding();
      break;
    case "dashboard":
      root.innerHTML = renderDashboard();
      bindDashboard();
      break;
    case "send":
      root.innerHTML = renderSend();
      bindSend();
      break;
    case "receive":
      root.innerHTML = renderReceive();
      bindReceive();
      break;
    case "activity":
      root.innerHTML = renderActivity();
      bindActivity();
      break;
    case "settings":
      root.innerHTML = renderSettings();
      bindSettings();
      break;
    default:
      root.innerHTML = renderDashboard();
  }
}

// ─── Screen: Loading ──────────────────────────────────

function renderLoading() {
  return `
    <div class="onboarding">
      <div class="spinner" style="width:32px;height:32px;border-width:3px;margin-bottom:12px"></div>
      <p style="color:var(--text-muted)">Yükleniyor...</p>
    </div>`;
}

// ─── Screen: Onboarding ───────────────────────────────

function renderOnboarding() {
  return `
    <div class="onboarding">
      <div class="onboarding-icon">🔐</div>
      <h2>Celari Wallet</h2>
      <p>Aztec'in gizlilik odaklı süper cüzdanı. Seed phrase yok — sadece parmak izin.</p>

      <div class="feature-list">
        <div class="feature-item">
          <span class="icon">🛡️</span>
          <span class="text"><strong>Tam gizlilik</strong> — bakiye, miktar, adres gizli</span>
        </div>
        <div class="feature-item">
          <span class="icon">👆</span>
          <span class="text"><strong>Passkey ile giriş</strong> — Face ID / parmak izi</span>
        </div>
        <div class="feature-item">
          <span class="icon">💳</span>
          <span class="text"><strong>Kripto kart</strong> — harcamalar için fiziksel kart</span>
        </div>
        <div class="feature-item">
          <span class="icon">🔗</span>
          <span class="text"><strong>Cross-chain</strong> — ETH, L2, Aztec arası köprü</span>
        </div>
      </div>

      <button id="btn-create-passkey" class="btn btn-passkey" style="margin-bottom:10px">
        👆 Passkey ile Cüzdan Oluştur
      </button>
      <button id="btn-demo" class="btn btn-secondary" style="font-size:12px">
        Demo modda gör
      </button>
    </div>`;
}

function bindOnboarding() {
  document.getElementById("btn-create-passkey")?.addEventListener("click", handleCreatePasskey);
  document.getElementById("btn-demo")?.addEventListener("click", handleDemoMode);
}

async function handleCreatePasskey() {
  const btn = document.getElementById("btn-create-passkey");
  btn.disabled = true;
  btn.innerHTML = `<div class="spinner"></div> Passkey oluşturuluyor...`;

  try {
    // Check if WebAuthn is available
    if (!window.PublicKeyCredential) {
      throw new Error("Bu tarayıcı Passkey desteklemiyor");
    }

    // Create WebAuthn credential
    const userId = crypto.getRandomValues(new Uint8Array(32));
    const createOptions = {
      publicKey: {
        rp: { name: "Celari Wallet", id: location.hostname },
        user: {
          id: userId,
          name: "Celari User",
          displayName: "Celari User",
        },
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        pubKeyCredParams: [
          { type: "public-key", alg: -7 },   // ES256 (P256) — required for Noir secp256r1
          { type: "public-key", alg: -257 },  // RS256 — fallback for compatibility
        ],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          residentKey: "required",
          userVerification: "required",
        },
        timeout: 60000,
        attestation: "none",
      },
    };

    const credential = await navigator.credentials.create(createOptions);
    if (!credential) throw new Error("Passkey oluşturma iptal edildi");

    const response = credential.response;
    const spki = new Uint8Array(response.getPublicKey());

    // Extract P256 public key coordinates from SPKI
    let offset = -1;
    for (let i = 0; i < spki.length - 64; i++) {
      if (spki[i] === 0x04 && i + 65 <= spki.length) { offset = i; break; }
    }
    if (offset === -1) throw new Error("Public key çıkarılamadı");

    const pubKeyX = Array.from(spki.slice(offset + 1, offset + 33)).map(b => b.toString(16).padStart(2, "0")).join("");
    const pubKeyY = Array.from(spki.slice(offset + 33, offset + 65)).map(b => b.toString(16).padStart(2, "0")).join("");

    // Generate a simulated Aztec address from public key
    const addressBytes = new Uint8Array(20);
    crypto.getRandomValues(addressBytes);
    const address = "0x" + Array.from(addressBytes).map(b => b.toString(16).padStart(2, "0")).join("");

    const account = {
      address,
      credentialId: credential.id,
      publicKeyX: "0x" + pubKeyX,
      publicKeyY: "0x" + pubKeyY,
      type: "passkey",
      label: "Ana Cuzdan",
      deployed: false,
      createdAt: new Date().toISOString(),
    };

    // Save account
    store.accounts = [account];
    await chrome.storage.local.set({ celari_accounts: store.accounts });
    chrome.runtime.sendMessage({ type: "SAVE_ACCOUNT", account });

    // Save keys for CLI deploy script (.celari-keys.json format)
    await chrome.storage.local.set({
      celari_keys: {
        publicKeyX: account.publicKeyX,
        publicKeyY: account.publicKeyY,
        credentialId: account.credentialId,
      }
    });

    store.tokens = getDemoTokens();
    store.activities = getDemoActivities();
    setState({ screen: "dashboard" });
    showToast("Passkey cuzdan olusturuldu!", "success");

  } catch (e) {
    console.error("Passkey error:", e);
    btn.disabled = false;
    btn.innerHTML = `👆 Passkey ile Cüzdan Oluştur`;
    showToast(`❌ ${e.message}`, "error");
  }
}

function handleDemoMode() {
  const address = "0x" + Array.from(crypto.getRandomValues(new Uint8Array(20))).map(b => b.toString(16).padStart(2, "0")).join("");
  const account = {
    address,
    credentialId: "demo",
    publicKeyX: "0x" + "ab".repeat(32),
    publicKeyY: "0x" + "cd".repeat(32),
    type: "demo",
    label: "Demo Cüzdan",
    createdAt: new Date().toISOString(),
  };
  store.accounts = [account];
  store.tokens = getDemoTokens();
  store.activities = getDemoActivities();
  chrome.storage.local.set({ celari_accounts: store.accounts });
  setState({ screen: "dashboard" });
  showToast("Demo modda çalışıyor", "success");
}

// ─── Deploy Banner ────────────────────────────────────

const DEPLOY_SERVER = "http://localhost:3456";

function applyDeployInfo(info) {
  const account = getActiveAccount();
  if (!account) return;
  const updates = {
    deployed: true,
    address: info.address,
    publicKeyX: info.publicKeyX || account.publicKeyX,
    publicKeyY: info.publicKeyY || account.publicKeyY,
    secretKey: info.secretKey,
    salt: info.salt,
    network: info.network,
    txHash: info.txHash,
    blockNumber: info.blockNumber,
    deployedAt: info.deployedAt,
  };
  Object.assign(account, updates);
  chrome.storage.local.set({ celari_accounts: store.accounts });
  chrome.runtime.sendMessage({
    type: "UPDATE_ACCOUNT",
    index: store.activeAccountIndex,
    updates,
  });
  setState({});
  showToast("Hesap basariyla olusturuldu!", "success");
}

function renderDeployBanner() {
  const account = getActiveAccount();
  const networkName = store.network === "devnet" ? "Devnet" : "Testnet";
  return `
    <div style="margin:0 16px 12px;padding:14px;background:linear-gradient(135deg,rgba(196,169,106,0.08),rgba(196,169,106,0.15));border:1px solid rgba(196,169,106,0.25);border-radius:var(--radius-md)">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <span style="font-size:14px">${icons.shield}</span>
        <span style="font-family:JetBrains Mono,monospace;font-size:10px;font-weight:600;letter-spacing:1px;color:var(--gold)">HESAP DEPLOY</span>
      </div>
      <p style="font-size:11px;color:var(--text-secondary);margin:0 0 10px;line-height:1.5">
        ${networkName} uzerinde hesabinizi deploy edin. Islem 30-120 saniye surebilir.
      </p>
      <div id="deploy-status" style="display:none;margin-bottom:10px;padding:8px 10px;border-radius:6px;font-family:JetBrains Mono,monospace;font-size:10px;line-height:1.6"></div>
      <div style="display:flex;gap:8px">
        <button id="btn-deploy-account" style="flex:1;padding:10px;border:1px solid rgba(196,169,106,0.3);border-radius:6px;background:rgba(196,169,106,0.15);color:var(--gold);font-family:JetBrains Mono,monospace;font-size:11px;cursor:pointer;font-weight:600;letter-spacing:0.5px">
          ${icons.shield} Hesap Olustur
        </button>
        <button id="btn-import-deployed" style="padding:10px 14px;border:1px solid rgba(255,255,255,0.1);border-radius:6px;background:rgba(255,255,255,0.05);color:var(--text-secondary);font-family:JetBrains Mono,monospace;font-size:10px;cursor:pointer;font-weight:500">
          ${icons.check} JSON
        </button>
      </div>
      <input type="file" id="file-import-deploy" accept=".json" style="display:none">
    </div>`;
}

// ─── Screen: Dashboard ────────────────────────────────

function renderDashboard() {
  const account = getActiveAccount();
  const shortAddr = account ? `${account.address.slice(0, 8)}...${account.address.slice(-6)}` : "";
  const totalValue = account?.deployed ? "$0.00" : "$3,631.70";
  const isPasskey = account?.type === "passkey";
  const isDeployed = account?.deployed === true;
  const needsDeploy = isPasskey && !isDeployed && (store.network === "devnet" || store.network === "testnet");

  return `
    ${renderHeader()}

    <!-- Balance Card -->
    <div class="balance-card">
      <div class="privacy-badge">${icons.lock} Private</div>
      <div class="balance-label">Toplam Bakiye</div>
      <div class="balance-amount">${totalValue}</div>
      <div class="balance-address">
        <code>${shortAddr}</code>
        <button class="copy-btn" id="btn-copy-addr" title="Adresi kopyala">${icons.copy}</button>
        ${isPasskey
          ? `<span style="margin-left:4px;font-family:JetBrains Mono,monospace;font-size:9px;letter-spacing:1px;color:${isDeployed ? 'var(--green)' : 'var(--gold-dark)'}">${isDeployed ? 'DEPLOYED' : 'NOT DEPLOYED'}</span>`
          : '<span style="margin-left:4px;font-family:JetBrains Mono,monospace;font-size:9px;letter-spacing:1px;color:var(--gold-dark)">DEMO</span>'}
      </div>
    </div>

    ${needsDeploy ? renderDeployBanner() : ''}

    <!-- Action Buttons -->
    <div class="actions">
      <button class="action-btn send" id="btn-send">
        <div class="icon">${icons.send}</div>
        Gonder
      </button>
      <button class="action-btn receive" id="btn-receive">
        <div class="icon">${icons.download}</div>
        Al
      </button>
      <button class="action-btn bridge" id="btn-bridge">
        <div class="icon">${icons.send}</div>
        Bridge
      </button>
      <button class="action-btn card" id="btn-card">
        <div class="icon">${icons.shield}</div>
        Kart
      </button>
    </div>

    <!-- Tabs -->
    <div class="tabs">
      <div class="tab active" id="tab-tokens">Tokenler</div>
      <div class="tab" id="tab-activity">İşlemler</div>
    </div>

    <!-- Token List -->
    <div class="token-list" id="content-area">
      ${store.tokens.map(t => `
        <div class="token-item">
          <div class="token-icon" style="background:${t.color}22;color:${t.color}">${t.icon}</div>
          <div class="token-info">
            <div class="token-name">${t.name}</div>
            <div class="token-symbol">${t.symbol}</div>
          </div>
          <div class="token-balance">
            <div class="amount">${t.balance}</div>
            <div class="value">${t.value}</div>
          </div>
        </div>
      `).join("")}
    </div>`;
}

function bindDashboard() {
  document.getElementById("btn-send")?.addEventListener("click", () => setState({ screen: "send" }));
  document.getElementById("btn-receive")?.addEventListener("click", () => setState({ screen: "receive" }));
  document.getElementById("btn-bridge")?.addEventListener("click", () => showToast("Bridge -- Faz 2'de gelecek", "success"));
  document.getElementById("btn-card")?.addEventListener("click", () => showToast("Kart -- Faz 3'te gelecek", "success"));
  document.getElementById("btn-copy-addr")?.addEventListener("click", () => {
    const account = getActiveAccount();
    if (account) {
      navigator.clipboard.writeText(account.address);
      showToast("Adres kopyalandi", "success");
    }
  });
  document.getElementById("btn-settings")?.addEventListener("click", () => setState({ screen: "settings" }));

  // Deploy — one-click account creation via deploy server
  document.getElementById("btn-deploy-account")?.addEventListener("click", async () => {
    const btn = document.getElementById("btn-deploy-account");
    const statusEl = document.getElementById("deploy-status");
    if (!btn || !statusEl) return;

    btn.disabled = true;
    btn.style.opacity = "0.5";
    btn.textContent = "Hesap olusturuluyor...";
    statusEl.style.display = "block";
    statusEl.style.background = "rgba(196,169,106,0.1)";
    statusEl.style.color = "var(--gold)";
    statusEl.textContent = "Deploy sunucusuna baglaniliyor...";

    try {
      // Check server health first
      const health = await fetch(DEPLOY_SERVER + "/api/health").catch(() => null);
      if (!health || !health.ok) {
        statusEl.style.background = "rgba(239,68,68,0.1)";
        statusEl.style.color = "#ef4444";
        statusEl.textContent = "Deploy sunucusu bulunamadi. Terminalde: yarn deploy:server";
        btn.disabled = false;
        btn.style.opacity = "1";
        btn.textContent = "Tekrar Dene";
        return;
      }

      const status = await health.json();
      if (status.status !== "ready") {
        statusEl.textContent = "Sunucu hazirlaniyor, lutfen bekleyin...";
        await new Promise(r => setTimeout(r, 3000));
      }

      statusEl.textContent = "Hesap deploy ediliyor... (30-120 sn)";

      const res = await fetch(DEPLOY_SERVER + "/api/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Bilinmeyen hata" }));
        throw new Error(err.error || "HTTP " + res.status);
      }

      const info = await res.json();
      applyDeployInfo(info);
    } catch (e) {
      statusEl.style.background = "rgba(239,68,68,0.1)";
      statusEl.style.color = "#ef4444";
      statusEl.textContent = "Hata: " + e.message;
      btn.disabled = false;
      btn.style.opacity = "1";
      btn.textContent = "Tekrar Dene";
    }
  });

  // Fallback: JSON file import
  document.getElementById("btn-import-deployed")?.addEventListener("click", () => {
    document.getElementById("file-import-deploy")?.click();
  });
  document.getElementById("file-import-deploy")?.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const info = JSON.parse(reader.result);
        if (!info.address || !info.address.startsWith("0x")) {
          showToast("Gecersiz JSON: adres bulunamadi", "error");
          return;
        }
        applyDeployInfo(info);
      } catch {
        showToast("JSON okunamadi", "error");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  });

  // Tabs
  document.getElementById("tab-tokens")?.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    document.getElementById("tab-tokens").classList.add("active");
    document.getElementById("content-area").innerHTML = store.tokens.map(t => `
      <div class="token-item">
        <div class="token-icon" style="background:${t.color}22;color:${t.color}">${t.icon}</div>
        <div class="token-info">
          <div class="token-name">${t.name}</div>
          <div class="token-symbol">${t.symbol}</div>
        </div>
        <div class="token-balance">
          <div class="amount">${t.balance}</div>
          <div class="value">${t.value}</div>
        </div>
      </div>
    `).join("");
  });

  document.getElementById("tab-activity")?.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    document.getElementById("tab-activity").classList.add("active");
    document.getElementById("content-area").innerHTML = store.activities.map(a => `
      <div class="activity-item">
        <div class="activity-icon ${a.type}">${a.type === "send" ? "↗" : "↙"}</div>
        <div class="activity-info">
          <div class="activity-type">${a.label} ${a.private ? '<span style="color:var(--green);font-size:10px">🔒</span>' : ''}</div>
          <div class="activity-detail">${a.time}</div>
        </div>
        <div class="activity-amount ${a.type === "send" ? "negative" : "positive"}">${a.amount}</div>
      </div>
    `).join("");
  });
}

// ─── Screen: Send ─────────────────────────────────────

function renderSend() {
  return `
    ${renderSubHeader("Private Gönder", "dashboard")}

    <div class="send-form">
      <!-- Token Selector -->
      <div class="form-group">
        <label class="form-label">Token</label>
        <select class="form-input" id="send-token" style="cursor:pointer">
          ${store.tokens.map(t => `<option value="${t.symbol}">${t.icon} ${t.symbol} — Bakiye: ${t.balance}</option>`).join("")}
        </select>
      </div>

      <!-- Amount -->
      <div class="form-group" style="position:relative">
        <label class="form-label">Miktar</label>
        <input type="text" class="form-input amount" id="send-amount" placeholder="0.00" autocomplete="off" />
        <button class="max-btn" id="btn-max">MAX</button>
      </div>

      <!-- Recipient -->
      <div class="form-group">
        <label class="form-label">Alıcı Adresi</label>
        <input type="text" class="form-input" id="send-to" placeholder="0x..." autocomplete="off" />
      </div>

      <!-- Privacy Info -->
      <div style="background:var(--green-glow);border:1px solid rgba(16,185,129,0.25);border-radius:var(--radius-sm);padding:10px 12px;margin-bottom:16px;display:flex;align-items:center;gap:8px">
        <span style="color:var(--green)">${icons.lock}</span>
        <span style="font-size:11px;color:var(--green)">Bu transfer tamamen gizli — on-chain gözlemciler hiçbir şey göremez</span>
      </div>

      <!-- Confirm Button -->
      <button id="btn-confirm-send" class="btn btn-passkey" ${store.loading ? "disabled" : ""}>
        ${store.loading ? '<div class="spinner"></div> İmzalanıyor...' : '👆 Passkey ile İmzala ve Gönder'}
      </button>
    </div>`;
}

function bindSend() {
  document.getElementById("btn-back")?.addEventListener("click", () => setState({ screen: "dashboard" }));
  document.getElementById("btn-max")?.addEventListener("click", () => {
    document.getElementById("send-amount").value = "1,250.00";
  });

  document.getElementById("btn-confirm-send")?.addEventListener("click", handleSendConfirm);
}

async function handleSendConfirm() {
  const to = document.getElementById("send-to")?.value?.trim();
  const amount = document.getElementById("send-amount")?.value?.trim();
  const token = document.getElementById("send-token")?.value;

  if (!to || !to.startsWith("0x")) {
    showToast("❌ Geçerli bir adres girin", "error"); return;
  }
  if (!amount || parseFloat(amount.replace(",", "")) <= 0) {
    showToast("❌ Geçerli bir miktar girin", "error"); return;
  }

  const btn = document.getElementById("btn-confirm-send");
  btn.disabled = true;
  btn.innerHTML = `<div class="spinner"></div> Passkey doğrulanıyor...`;

  const account = getActiveAccount();

  try {
    if (account?.type === "passkey") {
      // Trigger real WebAuthn assertion for signing
      const challenge = crypto.getRandomValues(new Uint8Array(32));
      const assertion = await navigator.credentials.get({
        publicKey: {
          challenge,
          rpId: location.hostname,
          allowCredentials: [{
            type: "public-key",
            id: base64UrlToBytes(account.credentialId),
          }],
          userVerification: "required",
          timeout: 60000,
        },
      });

      if (!assertion) throw new Error("Passkey doğrulama iptal edildi");
    }

    // Simulate transaction processing
    btn.innerHTML = `<div class="spinner"></div> ZK Proof üretiliyor...`;
    await sleep(1500);

    btn.innerHTML = `<div class="spinner"></div> İşlem gönderiliyor...`;
    await sleep(1000);

    // Add to activities
    store.activities.unshift({
      type: "send",
      label: "Transfer",
      to: to.slice(0, 8) + "...",
      amount: `-${amount} ${token}`,
      time: "Şimdi",
      private: true,
    });

    setState({ screen: "dashboard" });
    showToast("✅ Private transfer başarılı!", "success");

  } catch (e) {
    btn.disabled = false;
    btn.innerHTML = `👆 Passkey ile İmzala ve Gönder`;
    showToast(`❌ ${e.message}`, "error");
  }
}

// ─── Screen: Receive ──────────────────────────────────

function renderReceive() {
  const account = getActiveAccount();
  const address = account?.address || "0x...";

  return `
    ${renderSubHeader("Adresim", "dashboard")}

    <div style="padding:20px 16px;text-align:center">
      <!-- QR Code Placeholder (SVG-based) -->
      <div style="width:200px;height:200px;margin:0 auto 16px;background:white;border-radius:var(--radius-md);display:flex;align-items:center;justify-content:center;position:relative">
        ${renderSimpleQR(address)}
        <div style="position:absolute;background:var(--text-primary);color:var(--bg-primary);width:36px;height:36px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-family:Cormorant Garamond,serif;font-size:20px;font-weight:400;letter-spacing:1px">C</div>
      </div>

      <div style="font-family:JetBrains Mono,monospace;font-size:9px;letter-spacing:3px;color:var(--text-muted);margin-bottom:8px">AZTEC AĞINDA ADRESİM</div>

      <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-sm);padding:12px;word-break:break-all;font-family:JetBrains Mono,monospace;font-size:11px;color:var(--gold-dark);margin-bottom:12px;text-align:left">
        ${address}
      </div>

      <button id="btn-copy-full" class="btn btn-primary" style="margin-bottom:10px">
        ${icons.copy} Adresi Kopyala
      </button>

      <div style="background:var(--green-glow);border:1px solid rgba(16,185,129,0.25);border-radius:var(--radius-sm);padding:10px;margin-top:8px">
        <div style="font-size:11px;color:var(--green);display:flex;align-items:center;gap:6px;justify-content:center">
          ${icons.lock} Gelen transferler otomatik olarak private — sadece sen görürsün
        </div>
      </div>
    </div>`;
}

function bindReceive() {
  document.getElementById("btn-back")?.addEventListener("click", () => setState({ screen: "dashboard" }));
  document.getElementById("btn-copy-full")?.addEventListener("click", () => {
    const account = getActiveAccount();
    if (account) {
      navigator.clipboard.writeText(account.address);
      const btn = document.getElementById("btn-copy-full");
      btn.innerHTML = `${icons.check} Kopyalandı!`;
      setTimeout(() => { btn.innerHTML = `${icons.copy} Adresi Kopyala`; }, 2000);
    }
  });
}

// ─── Screen: Settings ─────────────────────────────────

function renderSettings() {
  const account = getActiveAccount();
  const isPasskey = account?.type === "passkey";

  return `
    ${renderSubHeader("Ayarlar", "dashboard")}

    <div style="padding:12px 16px">
      <!-- Account Section -->
      <div style="font-family:JetBrains Mono,monospace;font-size:9px;color:var(--text-muted);text-transform:uppercase;letter-spacing:3px;margin-bottom:8px;margin-top:4px">Hesap</div>
      <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-md);margin-bottom:16px;overflow:hidden">
        <div style="padding:12px;display:flex;align-items:center;gap:10px;border-bottom:1px solid var(--border)">
          <span style="font-size:24px">${isPasskey ? "👆" : "🧪"}</span>
          <div style="flex:1">
            <div style="font-weight:500;font-size:13px">${account?.label || "Hesap"}</div>
            <div style="font-size:11px;color:var(--text-muted)">${isPasskey ? "Passkey (P256)" : "Demo modu"}</div>
          </div>
          <span style="font-size:10px;padding:3px 8px;border-radius:100px;font-family:JetBrains Mono,monospace;letter-spacing:1px;background:${isPasskey ? 'var(--green-glow)' : 'rgba(196,169,106,0.12)'};color:${isPasskey ? 'var(--green)' : 'var(--gold-dark)'};border:1px solid ${isPasskey ? 'rgba(16,185,129,0.2)' : 'rgba(196,169,106,0.3)'}">${isPasskey ? "AKTIF" : "DEMO"}</span>
        </div>
        <div style="padding:12px;font-family:monospace;font-size:11px;color:var(--text-muted);word-break:break-all">
          ${account?.address || ""}
        </div>
      </div>

      <!-- Network Section -->
      <div style="font-family:JetBrains Mono,monospace;font-size:9px;color:var(--text-muted);text-transform:uppercase;letter-spacing:3px;margin-bottom:8px">Ag</div>
      <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-md);margin-bottom:16px;overflow:hidden">
        <div class="settings-row" id="btn-network-local" style="padding:12px;display:flex;align-items:center;gap:10px;border-bottom:1px solid var(--border);cursor:pointer">
          <div style="width:8px;height:8px;border-radius:50%;background:${store.network === 'local' && store.connected ? 'var(--green)' : 'var(--border)'}"></div>
          <div style="flex:1">
            <div style="font-weight:500;font-size:12px">Local Sandbox</div>
            <div style="font-size:10px;color:var(--text-muted)">localhost:8080</div>
          </div>
          ${store.network === "local" ? `<span style="color:var(--accent)">${icons.check}</span>` : ""}
        </div>
        <div class="settings-row" id="btn-network-devnet" style="padding:12px;display:flex;align-items:center;gap:10px;border-bottom:1px solid var(--border);cursor:pointer">
          <div style="width:8px;height:8px;border-radius:50%;background:${store.network === 'devnet' && store.connected ? 'var(--gold)' : 'var(--border)'}"></div>
          <div style="flex:1">
            <div style="font-weight:500;font-size:12px">Aztec Devnet</div>
            <div style="font-size:10px;color:var(--text-muted)">devnet-6.aztec-labs.com</div>
          </div>
          ${store.network === "devnet" ? `<span style="color:var(--accent)">${icons.check}</span>` : ""}
        </div>
        <div class="settings-row" id="btn-network-testnet" style="padding:12px;display:flex;align-items:center;gap:10px;cursor:pointer">
          <div style="width:8px;height:8px;border-radius:50%;background:${store.network === 'testnet' && store.connected ? 'var(--green)' : 'var(--border)'}"></div>
          <div style="flex:1">
            <div style="font-weight:500;font-size:12px">Aztec Testnet</div>
            <div style="font-size:10px;color:var(--text-muted)">rpc.testnet.aztec-labs.com</div>
          </div>
          ${store.network === "testnet" ? `<span style="color:var(--accent)">${icons.check}</span>` : ""}
        </div>
      </div>
      ${store.connected && store.nodeInfo ? `
      <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-md);margin-bottom:16px;padding:10px 12px;font-family:JetBrains Mono,monospace;font-size:10px;color:var(--text-muted)">
        <div style="display:flex;justify-content:space-between;margin-bottom:4px"><span>Version</span><span style="color:var(--text-secondary)">${store.nodeInfo?.nodeVersion || '-'}</span></div>
        <div style="display:flex;justify-content:space-between"><span>Chain ID</span><span style="color:var(--text-secondary)">${store.nodeInfo?.l1ChainId || '-'}</span></div>
      </div>` : ''}

      <!-- Security Section -->
      <div style="font-family:JetBrains Mono,monospace;font-size:9px;color:var(--text-muted);text-transform:uppercase;letter-spacing:3px;margin-bottom:8px">Güvenlik</div>
      <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-md);margin-bottom:16px;overflow:hidden">
        <div style="padding:12px;display:flex;align-items:center;gap:10px;border-bottom:1px solid var(--border)">
          <span style="font-size:16px">🔐</span>
          <div style="flex:1">
            <div style="font-weight:500;font-size:12px">Passkey Yönetimi</div>
            <div style="font-size:10px;color:var(--text-muted)">Face ID / Parmak izi ayarları</div>
          </div>
        </div>
        <div style="padding:12px;display:flex;align-items:center;gap:10px">
          <span style="font-size:16px">${icons.eye}</span>
          <div style="flex:1">
            <div style="font-weight:500;font-size:12px">Public Key Göster</div>
            <div style="font-size:10px;color:var(--text-muted);word-break:break-all">${account?.publicKeyX?.slice(0, 20) || ""}...</div>
          </div>
        </div>
      </div>

      <!-- Logout -->
      <div style="font-family:JetBrains Mono,monospace;font-size:9px;color:var(--text-muted);text-transform:uppercase;letter-spacing:3px;margin-bottom:8px">Islemler</div>
      <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-md);margin-bottom:16px;overflow:hidden">
        <div id="btn-logout" style="padding:12px;display:flex;align-items:center;gap:10px;cursor:pointer">
          <span style="font-size:16px;color:var(--red,#ef4444)">${icons.back}</span>
          <div style="flex:1">
            <div style="font-weight:500;font-size:12px;color:var(--red,#ef4444)">Cikis Yap</div>
            <div style="font-size:10px;color:var(--text-muted)">Cuzdani sifirla ve onboarding'e don</div>
          </div>
        </div>
      </div>

      <!-- About -->
      <div style="text-align:center;padding:12px 0;color:var(--text-faint);font-family:JetBrains Mono,monospace;font-size:9px;letter-spacing:1px">
        CELARI v0.3.0 · AZTEC SDK v3 · FAZ 1<br/>
        <span style="font-family:Cormorant Garamond,serif;font-size:12px;font-style:italic;letter-spacing:0;color:var(--text-muted)">celare -- to hide, to conceal</span>
      </div>
    </div>`;
}

function bindSettings() {
  document.getElementById("btn-back")?.addEventListener("click", () => setState({ screen: "dashboard" }));

  const switchNetwork = (network) => {
    chrome.runtime.sendMessage({ type: "SET_NETWORK", network }, (resp) => {
      if (resp?.success) {
        setState({
          network: resp.state.network,
          nodeUrl: resp.state.nodeUrl,
          connected: resp.state.connected,
          nodeInfo: resp.state.nodeInfo,
        });
        const name = network === "local" ? "Local Sandbox" : network === "devnet" ? "Devnet" : "Testnet";
        showToast(resp.state.connected ? `${name} baglandi` : `${name} baglaniyor...`, resp.state.connected ? "success" : "error");
      }
    });
  };

  document.getElementById("btn-network-local")?.addEventListener("click", () => switchNetwork("local"));
  document.getElementById("btn-network-devnet")?.addEventListener("click", () => switchNetwork("devnet"));
  document.getElementById("btn-network-testnet")?.addEventListener("click", () => switchNetwork("testnet"));

  // Logout
  document.getElementById("btn-logout")?.addEventListener("click", async () => {
    if (!confirm("Cuzdani sifirlamak istediginizden emin misiniz? Tum veriler silinecek.")) return;

    // Clear all stored data
    await chrome.storage.local.remove(["celari_accounts", "celari_keys", "celari_deploy_info"]);

    // Reset state
    store.accounts = [];
    store.tokens = [];
    store.activities = [];
    store.activeAccountIndex = 0;

    setState({ screen: "onboarding" });
    showToast("Cuzdan sifirlandi", "success");
  });
}

// ─── Shared Components ────────────────────────────────

function renderHeader() {
  return `
    <div class="header">
      <div class="header-logo">
        ${icons.shield}
        <span>Celari</span>
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <div class="header-network" id="btn-network-toggle">
          <div class="network-dot ${store.connected ? '' : 'disconnected'}"></div>
          ${store.network === "devnet" ? "Devnet" : store.network === "testnet" ? "Testnet" : "Sandbox"}
        </div>
        <button id="btn-settings" style="background:none;border:none;color:var(--text-muted);cursor:pointer;padding:4px;display:flex">${icons.settings}</button>
      </div>
    </div>`;
}

function renderSubHeader(title, backScreen) {
  return `
    <div class="header">
      <div style="display:flex;align-items:center;gap:8px">
        <button id="btn-back" class="back-btn">${icons.back}</button>
        <span style="font-family:Cormorant Garamond,serif;font-weight:400;font-size:16px;letter-spacing:2px;text-transform:uppercase">${title}</span>
      </div>
      <div class="header-logo">
        ${icons.shield}
      </div>
    </div>`;
}

function renderSimpleQR(data) {
  // Simple visual QR placeholder using SVG grid pattern
  const size = 200;
  const cells = 15;
  const cellSize = size / cells;
  let rects = "";

  // Use hash of data for deterministic pattern
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    hash = ((hash << 5) - hash + data.charCodeAt(i)) | 0;
  }

  for (let y = 0; y < cells; y++) {
    for (let x = 0; x < cells; x++) {
      // QR-like finder patterns in corners
      const isCornerOuter = (x < 3 && y < 3) || (x >= cells - 3 && y < 3) || (x < 3 && y >= cells - 3);
      const isCornerInner = (x === 1 && y === 1) || (x === cells - 2 && y === 1) || (x === 1 && y === cells - 2);
      const isCornerBorder = isCornerOuter && !isCornerInner;

      // Use seeded random for data cells
      const seed = (hash * (y * cells + x + 1)) >>> 0;
      const isData = !isCornerOuter && ((seed % 3) < 1);

      if (isCornerBorder || isCornerInner || isData) {
        rects += `<rect x="${x * cellSize}" y="${y * cellSize}" width="${cellSize - 1}" height="${cellSize - 1}" fill="#1A1710" rx="1"/>`;
      }
    }
  }

  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${rects}</svg>`;
}

// ─── Toast Notifications ──────────────────────────────

function showToast(message, type = "success") {
  // Remove existing toast
  const existing = document.querySelector(".toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => toast.remove(), 3000);
}

// ─── Helpers ──────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function base64UrlToBytes(base64url) {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// ─── Boot ─────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", init);
