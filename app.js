const statusEl = document.getElementById("status");
const installHint = document.getElementById("install-hint");
const btnEnable = document.getElementById("btn-enable");
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
    setStatus("Push not supported here", "denied");
    btnEnable.disabled = true;
    return;
  }

  if (Notification.permission === "denied") {
    setStatus("Notifications denied — reset in Settings", "denied");
    return;
  }

  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();

  if (sub) {
    setStatus("On — random phrase every 2 min", "ok");
    return;
  }

  setStatus(
    Notification.permission === "granted" ? "Permission ok — tap Enable" : "Not enabled yet",
    "warn"
  );
}

async function enableNotifications() {
  if (!("PushManager" in window)) {
    log("On iPhone: install to Home Screen first (iOS 16.4+).");
    setStatus("Push unavailable — install PWA", "denied");
    return;
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    setStatus("Notifications denied", "denied");
    return;
  }

  const { publicKey } = await (await fetch("/api/vapid-public-key")).json();
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

  setStatus("On — random phrase every 2 min", "ok");
  log("Subscribed. First phrase should arrive now; then every 2 minutes.");
}

async function init() {
  if (isIos() && !isStandalone()) installHint.hidden = false;

  if (!("serviceWorker" in navigator)) {
    setStatus("Service workers unsupported", "denied");
    btnEnable.disabled = true;
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
}

init();
