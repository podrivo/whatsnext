# WhatsNext — PWA Web Push PoC

Prove that a Home Screen PWA can request notification permission, subscribe to Web Push (VAPID), persist the subscription, and deliver a system notification on an **iPhone lock screen / Notification Center**.

**iOS expectation:** Web Push requires **iOS 16.4+**, Safari, and the site opened from the **Home Screen icon** (not a Safari tab).

## Stack

- Static PWA: `index.html`, `styles.css`, `app.js`, `sw.js`, `manifest.webmanifest`
- Node + Express + [`web-push`](https://github.com/web-push-libs/web-push)
- Subscriptions in `subscriptions.json` (local PoC, no DB)
- VAPID keys in `vapid.json` (generated on first run; private key stays server-side)

## Install + run

```bash
npm install
npm start
```

Open **http://localhost:3000** (desktop Chrome smoke test).

On first start the server creates `vapid.json` if missing. To generate/print keys without starting the server:

```bash
npm run generate-vapid
```

The VAPID **public** key is also exposed at `GET /api/vapid-public-key` and printed in the server console. The front end fetches it when you tap **Enable notifications**. Keep `vapid.json` out of git (see `.gitignore`).

## Desktop Chrome smoke test

1. Open http://localhost:3000
2. Click **Enable notifications** → allow
3. Optionally edit title/body
4. Click **Send test push**
5. You should see a system notification (works with the tab focused or backgrounded)

## iPhone (primary target)

Push on iOS only works for an **installed** PWA over **HTTPS**. `localhost` on your Mac is not reachable as a secure origin from the phone.

### 1. Expose the server over HTTPS

With the server running on port 3000, use a tunnel, for example:

```bash
# ngrok
ngrok http 3000

# or Cloudflare Tunnel
cloudflared tunnel --url http://localhost:3000
```

Use the `https://…` URL the tunnel prints.

### 2. Add to Home Screen

1. On the iPhone, open the **HTTPS** URL in **Safari** (not Chrome/Firefox)
2. Tap **Share** → **Add to Home Screen** → Add
3. Open the app from the **Home Screen icon** (standalone). You should see the install hint disappear.

### 3. Enable + send

1. Tap **Enable notifications** → Allow (must be a user gesture)
2. Background the PWA (Home / lock the phone)
3. From the phone or from desktop Chrome hitting the same server, tap **Send test push**
4. Within a few seconds a system notification should appear on the lock screen / Notification Center even though the PWA is not in the foreground
5. Tap the notification → the PWA focuses/opens

## API (tiny)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/vapid-public-key` | Public VAPID key for `PushManager.subscribe` |
| `POST` | `/api/subscribe` | Save PushSubscription JSON |
| `GET` | `/api/subscriptions` | List saved subscriptions |
| `POST` | `/api/unsubscribe` | Remove by `endpoint` |
| `POST` | `/api/send` | Send `{ title?, body? }` to all saved subscriptions |

## Success criteria

From an iPhone Home Screen install, after enabling notifications, **Send test push** delivers a visible system notification within a few seconds while the app is not in the foreground.

## Out of scope

Auth, multi-user accounts, topics, rich media, analytics, native APNs certificate setup (this PoC uses standard Web Push / VAPID only).
