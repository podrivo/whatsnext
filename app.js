const statusEl = document.getElementById("status");
const installHint = document.getElementById("install-hint");
const btnEnable = document.getElementById("btn-enable");
const btnSend = document.getElementById("btn-send");
const titleInput = document.getElementById("title");
const bodyInput = document.getElementById("body");
const logEl = document.getElementById("log");

function log(msg) {
  const line = `[${new Date().toLocaleTimeString()}] ${msg}`;
  logEl.textContent = `${line}\n${logEl.textContent}`.trim();
  console.log(msg);
}

function setStatus(text, kind) {
  statusEl.textContent = text;
  statusEl.dataset.kind = kind || "";
}

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function refreshStatus() {
  if (!("Notification" in window) || !("serviceWorker" in navigator)) {
    setStatus("Push not supported in this browser", "denied");
    btnEnable.disabled = true;
    return null;
  }

  if (Notification.permission === "denied") {
    setStatus("Notifications denied — reset in Settings", "denied");
    return null;
  }

  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();

  if (sub) {
    setStatus("Subscribed", "ok");
    return sub;
  }

  if (Notification.permission === "granted") {
    setStatus("Permission granted — not subscribed yet", "warn");
  } else {
    setStatus("Not subscribed", "warn");
  }
  return null;
}

async function enableNotifications() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    log("PushManager unavailable. On iPhone: install to Home Screen first (iOS 16.4+).");
    setStatus("Push unavailable — install PWA", "denied");
    return;
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    setStatus("Notifications denied", "denied");
    log(`Permission: ${permission}`);
    return;
  }

  const keyRes = await fetch("/api/vapid-public-key");
  const { publicKey } = await keyRes.json();

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }

  const saveRes = await fetch("/api/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sub.toJSON()),
  });
  const saved = await saveRes.json();
  if (!saveRes.ok) throw new Error(saved.error || "Failed to save subscription");

  setStatus("Subscribed", "ok");
  log(`Subscription saved (server has ${saved.count})`);
}

async function sendTestPush() {
  const res = await fetch("/api/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: titleInput.value.trim() || "WhatsNext",
      body: bodyInput.value.trim() || "Test push from the PoC server",
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    log(`Send failed: ${data.error || res.status}`);
    return;
  }
  log(`Sent ${data.sent}, failed ${data.failed}`);
}

async function init() {
  if (isIos() && !isStandalone()) {
    installHint.hidden = false;
  }

  if (!("serviceWorker" in navigator)) {
    setStatus("Service workers unsupported", "denied");
    btnEnable.disabled = true;
    btnSend.disabled = true;
    return;
  }

  try {
    await navigator.serviceWorker.register("/sw.js");
    log("Service worker registered");
  } catch (err) {
    log(`SW register failed: ${err.message}`);
    setStatus("SW registration failed", "denied");
    return;
  }

  await refreshStatus();

  btnEnable.addEventListener("click", async () => {
    btnEnable.disabled = true;
    try {
      await enableNotifications();
    } catch (err) {
      log(`Enable failed: ${err.message}`);
      setStatus("Subscribe failed", "denied");
    } finally {
      btnEnable.disabled = false;
      await refreshStatus();
    }
  });

  btnSend.addEventListener("click", async () => {
    btnSend.disabled = true;
    try {
      await sendTestPush();
    } catch (err) {
      log(`Send error: ${err.message}`);
    } finally {
      btnSend.disabled = false;
    }
  });
}

init();
