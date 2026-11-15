const fs = require("fs");
const path = require("path");
const express = require("express");
const webpush = require("web-push");

const ROOT = __dirname;
const VAPID_PATH = path.join(ROOT, "vapid.json");
const SUBS_PATH = path.join(ROOT, "subscriptions.json");
const PORT = Number(process.env.PORT) || 3000;

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

function sameEndpoint(a, b) {
  return a && b && a.endpoint === b.endpoint;
}

const vapid = loadOrCreateVapid();
webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);

const app = express();
app.use(express.json({ limit: "32kb" }));

// Serve only the PWA assets (do not static-serve the project root — that leaks vapid.json)
app.get("/", (_req, res) => res.sendFile(path.join(ROOT, "index.html")));
for (const file of ["styles.css", "app.js", "sw.js", "manifest.webmanifest"]) {
  app.get(`/${file}`, (_req, res) => res.sendFile(path.join(ROOT, file)));
}
app.use("/icons", express.static(path.join(ROOT, "icons")));

app.get("/api/vapid-public-key", (_req, res) => {
  res.json({ publicKey: vapid.publicKey });
});

app.get("/api/subscriptions", (_req, res) => {
  res.json({ count: readSubscriptions().length, subscriptions: readSubscriptions() });
});

app.post("/api/subscribe", (req, res) => {
  const sub = req.body;
  if (!sub || !sub.endpoint || !sub.keys) {
    return res.status(400).json({ error: "Invalid PushSubscription" });
  }

  const subs = readSubscriptions();
  const idx = subs.findIndex((s) => sameEndpoint(s, sub));
  if (idx >= 0) {
    subs[idx] = sub;
  } else {
    subs.push(sub);
  }
  writeSubscriptions(subs);
  res.json({ ok: true, count: subs.length });
});

app.post("/api/unsubscribe", (req, res) => {
  const { endpoint } = req.body || {};
  if (!endpoint) return res.status(400).json({ error: "endpoint required" });

  const next = readSubscriptions().filter((s) => s.endpoint !== endpoint);
  writeSubscriptions(next);
  res.json({ ok: true, count: next.length });
});

app.post("/api/send", async (req, res) => {
  const title = (req.body && req.body.title) || "WhatsNext";
  const body = (req.body && req.body.body) || "Test push from the PoC server";
  const payload = JSON.stringify({
    title,
    body,
    url: "/",
  });

  const subs = readSubscriptions();
  if (subs.length === 0) {
    return res.status(400).json({ error: "No subscriptions saved yet" });
  }

  const results = [];
  const keep = [];

  for (const sub of subs) {
    try {
      await webpush.sendNotification(sub, payload);
      results.push({ endpoint: sub.endpoint, ok: true });
      keep.push(sub);
    } catch (err) {
      const statusCode = err.statusCode || err.status;
      results.push({
        endpoint: sub.endpoint,
        ok: false,
        statusCode,
        message: err.message,
      });
      // Drop gone / invalid subscriptions
      if (statusCode !== 404 && statusCode !== 410) {
        keep.push(sub);
      }
    }
  }

  writeSubscriptions(keep);
  res.json({
    sent: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  });
});

app.listen(PORT, () => {
  console.log(`PWA Push PoC → http://localhost:${PORT}`);
  console.log(`VAPID public key: ${vapid.publicKey}`);
  console.log("iPhone: use HTTPS (ngrok/cloudflare tunnel) and Add to Home Screen.");
});
