const fs = require("fs");
const path = require("path");
const express = require("express");
const webpush = require("web-push");

const ROOT = __dirname;
const VAPID_PATH = path.join(ROOT, "vapid.json");
const SUBS_PATH = path.join(ROOT, "subscriptions.json");
const PORT = Number(process.env.PORT) || 3000;
const INTERVAL_MS = 2 * 60 * 1000;

const PHRASES = [
  "Drink some water.",
  "Stand up and stretch.",
  "Look away from the screen for 20 seconds.",
  "Take a slow breath in… and out.",
  "Check your posture.",
  "Send that message you've been putting off.",
  "A short walk beats another scroll.",
  "What's one thing you can finish in 5 minutes?",
  "Put your phone down for a minute.",
  "You don't have to do everything today.",
  "Open a window. Fresh air helps.",
  "Name three things you're glad exist.",
];

function loadOrCreateVapid() {
  if (!fs.existsSync(VAPID_PATH)) {
    const keys = webpush.generateVAPIDKeys();
    const payload = {
      publicKey: keys.publicKey,
      privateKey: keys.privateKey,
      subject: "mailto:dev@example.com",
    };
    fs.writeFileSync(VAPID_PATH, JSON.stringify(payload, null, 2) + "\n");
    console.log("Generated VAPID keys → vapid.json");
  }
  return JSON.parse(fs.readFileSync(VAPID_PATH, "utf8"));
}

function readSubscriptions() {
  if (!fs.existsSync(SUBS_PATH)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(SUBS_PATH, "utf8"));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function writeSubscriptions(subs) {
  fs.writeFileSync(SUBS_PATH, JSON.stringify(subs, null, 2) + "\n");
}

function randomPhrase() {
  return PHRASES[Math.floor(Math.random() * PHRASES.length)];
}

async function broadcastRandom() {
  const body = randomPhrase();
  const payload = JSON.stringify({ title: "WhatsNext", body, url: "/" });
  const subs = readSubscriptions();
  if (subs.length === 0) {
    console.log(`[push] skip — no subscribers (${body})`);
    return { sent: 0, failed: 0, body };
  }

  const keep = [];
  let sent = 0;
  let failed = 0;

  for (const sub of subs) {
    try {
      await webpush.sendNotification(sub, payload);
      sent += 1;
      keep.push(sub);
    } catch (err) {
      failed += 1;
      const statusCode = err.statusCode || err.status;
      console.warn(`[push] fail ${statusCode || ""} ${err.message}`);
      if (statusCode !== 404 && statusCode !== 410) keep.push(sub);
    }
  }

  writeSubscriptions(keep);
  console.log(`[push] "${body}" → sent ${sent}, failed ${failed}`);
  return { sent, failed, body };
}

const vapid = loadOrCreateVapid();
webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);

const app = express();
app.use(express.json({ limit: "32kb" }));

app.get("/", (_req, res) => res.sendFile(path.join(ROOT, "index.html")));
for (const file of ["styles.css", "app.js", "sw.js", "manifest.webmanifest"]) {
  app.get(`/${file}`, (_req, res) => res.sendFile(path.join(ROOT, file)));
}
app.use("/icons", express.static(path.join(ROOT, "icons")));

app.get("/api/vapid-public-key", (_req, res) => {
  res.json({ publicKey: vapid.publicKey });
});

app.post("/api/subscribe", (req, res) => {
  const sub = req.body;
  if (!sub || !sub.endpoint || !sub.keys) {
    return res.status(400).json({ error: "Invalid PushSubscription" });
  }

  const subs = readSubscriptions();
  const idx = subs.findIndex((s) => s.endpoint === sub.endpoint);
  if (idx >= 0) subs[idx] = sub;
  else subs.push(sub);
  writeSubscriptions(subs);

  // Immediate phrase so you don't wait the full 2 minutes after enabling
  broadcastRandom().catch((err) => console.warn("[push] immediate send failed", err.message));

  res.json({ ok: true, count: subs.length });
});

app.listen(PORT, () => {
  console.log(`WhatsNext → http://localhost:${PORT}`);
  console.log(`Auto-push every ${INTERVAL_MS / 1000}s with a random phrase`);
  console.log("iPhone: HTTPS tunnel + Add to Home Screen (iOS 16.4+)");
  setInterval(() => {
    broadcastRandom().catch((err) => console.warn("[push] interval failed", err.message));
  }, INTERVAL_MS);
});
