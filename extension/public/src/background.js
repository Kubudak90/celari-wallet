/**
 * Celari Wallet -- Background Service Worker
 *
 * Runs in the extension's background context.
 * Manages:
 * - PXE connection state
 * - Account registry
 * - Transaction queue
 * - dApp communication (via content script)
 */

// --- Network Presets -------------------------------------------------

const NETWORKS = {
  "local": {
    name: "Local Sandbox",
    url: "http://localhost:8080",
  },
  "devnet": {
    name: "Aztec Devnet",
    url: "https://devnet-6.aztec-labs.com/",
  },
  "testnet": {
    name: "Aztec Testnet",
    url: "https://rpc.testnet.aztec-labs.com/",
  },
};

// --- Offscreen Document (PXE WASM Engine) ----------------------------

let offscreenReady = false;

async function ensureOffscreen() {
  if (offscreenReady) return;
  try {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT"],
    });
    if (contexts.length === 0) {
      await chrome.offscreen.createDocument({
        url: "offscreen.html",
        reasons: ["WORKERS"],
        justification: "Aztec PXE WASM proving engine for zero-knowledge proofs",
      });
    }
    offscreenReady = true;
    console.log("Offscreen document ready");
  } catch (e) {
    console.error("Offscreen creation failed:", e.message);
  }
}

/**
 * Send a message to the offscreen PXE document and await response.
 */
async function sendToPXE(msg) {
  await ensureOffscreen();
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(msg, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (response?.error) {
        reject(new Error(response.error));
      } else {
        resolve(response);
      }
    });
  });
}

// --- Pending dApp sign requests (awaiting user confirmation) ---------

const pendingSignRequests = new Map();

// --- State -----------------------------------------------------------

let state = {
  connected: false,
  nodeUrl: "https://rpc.testnet.aztec-labs.com/",
  network: "testnet",
  nodeInfo: null, // { nodeVersion, l1ChainId, protocolVersion, ... }
  accounts: [],
  activeAccountIndex: 0,
};

// --- Message Handler -------------------------------------------------

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Only accept messages from our own extension
  if (sender.id !== chrome.runtime.id) {
    sendResponse({ success: false, error: "Unauthorized sender" });
    return;
  }

  switch (message.type) {
    case "GET_STATE":
      sendResponse({ success: true, state });
      break;

    case "GET_NETWORKS": {
      chrome.storage.local.get("celari_custom_networks", (result) => {
        const customNetworks = result.celari_custom_networks || [];
        sendResponse({ success: true, networks: NETWORKS, customNetworks });
      });
      return true;
    }

    case "SET_NETWORK": {
      const preset = NETWORKS[message.network];
      if (preset) {
        state.nodeUrl = preset.url;
        state.network = message.network;
      } else if (message.nodeUrl) {
        state.nodeUrl = message.nodeUrl;
        state.network = message.networkId || "custom";
      }
      state.connected = false;
      state.nodeInfo = null;

      // Save config
      chrome.storage.local.set({
        celari_config: { nodeUrl: state.nodeUrl, network: state.network },
      });

      checkConnection().then(() => sendResponse({ success: true, state }));
      return true; // async response
    }

    case "SAVE_CUSTOM_NETWORK": {
      chrome.storage.local.get("celari_custom_networks", (result) => {
        const networks = result.celari_custom_networks || [];
        // Prevent duplicate URLs
        const exists = networks.find(n => n.url === message.networkData.url);
        if (exists) {
          sendResponse({ success: false, error: "Network URL already exists" });
          return;
        }
        networks.push(message.networkData);
        chrome.storage.local.set({ celari_custom_networks: networks });
        sendResponse({ success: true, networks });
      });
      return true;
    }

    case "DELETE_CUSTOM_NETWORK": {
      chrome.storage.local.get("celari_custom_networks", (result) => {
        const networks = (result.celari_custom_networks || []).filter(n => n.id !== message.networkId);
        chrome.storage.local.set({ celari_custom_networks: networks });
        // If the deleted network was active, switch to testnet
        if (state.network === message.networkId) {
          state.nodeUrl = NETWORKS.testnet.url;
          state.network = "testnet";
          state.connected = false;
          state.nodeInfo = null;
          chrome.storage.local.set({
            celari_config: { nodeUrl: state.nodeUrl, network: state.network },
          });
          checkConnection();
        }
        sendResponse({ success: true, networks, state });
      });
      return true;
    }

    case "CONNECT":
      checkConnection().then((connected) => {
        sendResponse({ success: true, connected, nodeInfo: state.nodeInfo });
      });
      return true;

    case "SAVE_ACCOUNT":
      state.accounts.push(message.account);
      chrome.storage.local.set({ celari_accounts: state.accounts });
      sendResponse({ success: true });
      break;

    case "GET_ACCOUNTS":
      sendResponse({ success: true, accounts: state.accounts });
      break;

    case "SET_ACTIVE_ACCOUNT":
      state.activeAccountIndex = message.index;
      sendResponse({ success: true });
      break;

    case "UPDATE_ACCOUNT": {
      // Update account fields (e.g. deployed address, deployment status)
      const idx = message.index ?? state.activeAccountIndex;
      if (state.accounts[idx]) {
        Object.assign(state.accounts[idx], message.updates);
        chrome.storage.local.set({ celari_accounts: state.accounts });
        sendResponse({ success: true, account: state.accounts[idx] });
      } else {
        sendResponse({ success: false, error: "Account not found" });
      }
      break;
    }

    case "GET_DEPLOY_INFO": {
      // Check if a .celari-passkey-account.json was saved by CLI deploy
      chrome.storage.local.get("celari_deploy_info", (result) => {
        sendResponse({ success: true, deployInfo: result.celari_deploy_info || null });
      });
      return true;
    }

    case "SAVE_DEPLOY_INFO":
      chrome.storage.local.set({ celari_deploy_info: message.deployInfo });
      sendResponse({ success: true });
      break;

    case "VERIFY_ACCOUNT": {
      const addr = message.address;
      if (!addr) {
        sendResponse({ success: false, error: "No address" });
        break;
      }
      verifyAccount(addr).then((result) => {
        sendResponse({ success: true, ...result });
      }).catch((e) => {
        sendResponse({ success: false, error: e.message });
      });
      return true;
    }

    case "GET_BLOCK_NUMBER": {
      getBlockNumber().then((blockNumber) => {
        sendResponse({ success: true, blockNumber });
      }).catch((e) => {
        sendResponse({ success: false, error: e.message });
      });
      return true;
    }

    // dApp requests (forwarded from content script)
    case "DAPP_CONNECT":
      chrome.action.openPopup();
      sendResponse({ success: true, pending: true });
      break;

    case "DAPP_SIGN": {
      // Store the pending sign request and open a confirmation popup
      const signRequestId = `sign_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      pendingSignRequests.set(signRequestId, {
        payload: message.payload,
        origin: sender.origin || sender.tab?.url || "unknown",
        tabId: sender.tab?.id,
        sendResponse,
      });

      // Open confirmation popup
      chrome.windows.create({
        url: `popup.html?confirm=${signRequestId}`,
        type: "popup",
        width: 380,
        height: 560,
        focused: true,
      });

      return true; // async response — will be sent when user approves/rejects
    }

    case "GET_SIGN_REQUEST": {
      // Popup asks for the pending request details to display confirmation UI
      const reqId = message.requestId;
      const pending = pendingSignRequests.get(reqId);
      if (pending) {
        sendResponse({
          success: true,
          request: {
            id: reqId,
            origin: pending.origin,
            payload: pending.payload,
          },
        });
      } else {
        sendResponse({ success: false, error: "No pending request" });
      }
      break;
    }

    case "SIGN_APPROVE": {
      const pending = pendingSignRequests.get(message.requestId);
      if (pending) {
        pendingSignRequests.delete(message.requestId);
        // Forward the approved sign request back to the content script
        if (pending.tabId) {
          chrome.tabs.sendMessage(pending.tabId, {
            target: "content",
            type: "SIGN_APPROVED",
            payload: pending.payload,
          });
        }
        pending.sendResponse({ success: true, approved: true });
      } else {
        sendResponse({ success: false, error: "Request not found or expired" });
      }
      break;
    }

    case "SIGN_REJECT": {
      const pending = pendingSignRequests.get(message.requestId);
      if (pending) {
        pendingSignRequests.delete(message.requestId);
        pending.sendResponse({ success: false, error: "User rejected the transaction" });
      } else {
        sendResponse({ success: false, error: "Request not found or expired" });
      }
      break;
    }

    // Wallet-SDK protocol: forward wallet method calls to offscreen PXE
    case "WALLET_METHOD_CALL": {
      sendToPXE({
        type: "PXE_WALLET_METHOD",
        rawMessage: message.rawMessage,
      })
        .then((result) => sendResponse(result))
        .catch((e) => sendResponse({ error: e.message }));
      return true; // async response
    }

    default:
      // Forward PXE_* messages to offscreen document
      if (message.type?.startsWith("PXE_")) {
        sendToPXE(message)
          .then((result) => sendResponse({ success: true, ...result }))
          .catch((e) => sendResponse({ success: false, error: e.message }));
        return true; // async response
      }
      sendResponse({ success: false, error: "Unknown message type" });
  }
});

// --- Connection Check ------------------------------------------------

async function checkConnection() {
  try {
    const url = state.nodeUrl.replace(/\/$/, "");

    // Try JSON-RPC first (devnet/testnet)
    const rpcResponse = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "node_getNodeInfo",
        params: [],
        id: 1,
      }),
      signal: AbortSignal.timeout(12000),
    });

    if (rpcResponse.ok) {
      const rpcData = await rpcResponse.json();
      if (rpcData.result) {
        state.connected = true;
        state.nodeInfo = {
          nodeVersion: rpcData.result.nodeVersion || "unknown",
          l1ChainId: rpcData.result.l1ChainId,
          protocolVersion: rpcData.result.protocolVersion || rpcData.result.rollupVersion,
        };
        return true;
      }
    }

    // Fallback: REST API (sandbox)
    const restResponse = await fetch(`${url}/api/node-info`, {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });
    if (restResponse.ok) {
      const info = await restResponse.json();
      state.connected = true;
      state.nodeInfo = {
        nodeVersion: info.nodeVersion || info.sandboxVersion || "unknown",
        l1ChainId: info.l1ChainId,
        protocolVersion: info.protocolVersion,
      };
      return true;
    }
  } catch (e) {
    state.connected = false;
    state.nodeInfo = null;
  }
  return false;
}

// --- Account Verification --------------------------------------------

async function verifyAccount(address) {
  const url = state.nodeUrl.replace(/\/$/, "");
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "node_getContract",
        params: [address],
        id: 1,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.result) {
        return { verified: true, contractData: data.result };
      }
    }
  } catch {}

  // Fallback: check if block number is > deploy block (account was mined)
  try {
    const blockNum = await getBlockNumber();
    return { verified: blockNum > 0, blockNumber: blockNum, note: "Node responded but contract query unavailable" };
  } catch {}

  return { verified: false };
}

async function getBlockNumber() {
  const url = state.nodeUrl.replace(/\/$/, "");
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "node_getBlockNumber",
      params: [],
      id: 1,
    }),
    signal: AbortSignal.timeout(10000),
  });
  const data = await res.json();
  return data.result ?? null;
}

// --- Initialization --------------------------------------------------

chrome.runtime.onInstalled.addListener(async () => {
  console.log("Celari Wallet installed");

  // Load saved accounts
  const stored = await chrome.storage.local.get("celari_accounts");
  if (stored.celari_accounts) {
    state.accounts = stored.celari_accounts;
  }

  // Load saved network config
  const config = await chrome.storage.local.get("celari_config");
  if (config.celari_config) {
    state.nodeUrl = config.celari_config.nodeUrl || state.nodeUrl;
    state.network = config.celari_config.network || state.network;
  }

  // Check connection
  await checkConnection();

  // Start offscreen PXE engine
  await ensureOffscreen();
  if (state.connected) {
    sendToPXE({ type: "PXE_INIT", nodeUrl: state.nodeUrl })
      .then(async (res) => {
        console.log("PXE initialized:", res);
        // Register all deployed accounts with PXE
        for (const account of state.accounts) {
          if (account.deployed && account.secretKey && account.salt) {
            try {
              const regRes = await sendToPXE({
                type: "PXE_REGISTER_ACCOUNT",
                data: {
                  publicKeyX: account.publicKeyX,
                  publicKeyY: account.publicKeyY,
                  secretKey: account.secretKey,
                  salt: account.salt,
                  privateKeyPkcs8: account.privateKeyPkcs8 || "",
                },
              });
              console.log(`PXE account registered: ${account.address?.slice(0, 16)}...`, regRes);
            } catch (e) {
              console.warn(`PXE account registration failed for ${account.address?.slice(0, 16)}:`, e.message);
            }
          }
        }
      })
      .catch((e) => console.warn("PXE init deferred:", e.message));
  }
});

// Replace setInterval with chrome.alarms for MV3 reliability
chrome.alarms.create("keepAlive", { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "keepAlive") {
    checkConnection();
  }
});
