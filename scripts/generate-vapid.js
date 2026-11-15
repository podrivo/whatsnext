const fs = require("fs");
const path = require("path");
const webpush = require("web-push");

const keysPath = path.join(__dirname, "..", "vapid.json");

if (fs.existsSync(keysPath)) {
  const existing = JSON.parse(fs.readFileSync(keysPath, "utf8"));
  console.log("VAPID keys already exist at vapid.json");
  console.log("Public key:", existing.publicKey);
  process.exit(0);
}

const keys = webpush.generateVAPIDKeys();
const payload = {
  publicKey: keys.publicKey,
  privateKey: keys.privateKey,
  subject: "mailto:dev@example.com",
};

fs.writeFileSync(keysPath, JSON.stringify(payload, null, 2) + "\n");
console.log("Generated VAPID keys → vapid.json");
console.log("Public key:", keys.publicKey);
console.log("Keep privateKey server-side only. Do not commit vapid.json.");
