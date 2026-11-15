# WhatsNext (iOS) — local notifications

Tiny SwiftUI app: enable notifications → **Start** → a random phrase every **2 minutes** on the Lock Screen. **No server. Works in Airplane Mode.**

## Prerequisites (free)

1. Install **Xcode** from the Mac App Store (this machine currently only has Command Line Tools).
2. Open Xcode once → sign in with your free **Apple ID** (Xcode → Settings → Accounts).
3. iPhone + cable (or wireless debugging after the first pair).

## Run on your iPhone

```bash
open ios/WhatsNext.xcodeproj
```

1. Select the **WhatsNext** target → **Signing & Capabilities**
2. **Team** = your personal Apple ID (Automatic signing)
3. Plug in the iPhone → choose it as the run destination
4. iPhone: **Settings → Privacy & Security → Developer Mode** → On (if asked)
5. Press **Run** (▶)
6. If the app won’t open: **Settings → General → VPN & Device Management** → Trust your certificate

Free Apple ID builds expire after ~7 days — Run again from Xcode to refresh. No paid Developer Program needed for this.

## Test

1. Tap **Enable notifications** → Allow  
2. Tap **Start**  
3. Lock the phone (or Airplane Mode)  
4. Within ~2 minutes you should get a system notification  
5. Tap **Stop** to clear the queue  

iOS only allows **64** pending local notifications (~2 hours at a 2‑minute interval). Tap **Restart schedule** to refill.

## Files

| File | Role |
|------|------|
| `WhatsNextApp.swift` | App entry |
| `ContentView.swift` | UI |
| `PhraseScheduler.swift` | Permission + schedule/cancel local notifications |
