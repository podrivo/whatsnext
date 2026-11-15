# WhatsNext — auto Web Push PoC

Enable notifications once. The server sends a **random phrase every 2 minutes** to all saved subscriptions (iOS Home Screen PWA 16.4+ and desktop Chrome).

## Run

```bash
npm install
npm start
```

Open **http://localhost:3000** → **Enable notifications**. You should get a phrase immediately, then another every 2 minutes (app can be backgrounded).

VAPID keys are created on first run in `vapid.json` (private key stays server-side). Optional: `npm run generate-vapid`.

## iPhone

Needs **HTTPS** + **Add to Home Screen** (not a Safari tab):

```bash
ngrok http 3000
# or: cloudflared tunnel --url http://localhost:3000
```

1. Open the `https://…` URL in **Safari**
2. Share → **Add to Home Screen** → open from the icon
3. Tap **Enable notifications**
4. Lock the phone — a random phrase should arrive about every 2 minutes

## Notes

- Subscriptions: `subscriptions.json`
- Server logs each push: `[push] "…" → sent N, failed M`
