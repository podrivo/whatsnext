# WhatsNext

Private daily coach: paste todos, get one “what’s next” recommendation (free Groq / Llama), emailed each morning via Resend. Hosted on Netlify; data in Supabase.

## Setup

1. Copy env and fill values:

```bash
cp .env.example .env.local
```

See [.env.example](.env.example) for every variable.

2. **Supabase** — [supabase.com](https://supabase.com) → new project → Settings → API → copy **Project URL** and a **Secret key** (privileged; not a publishable key) into `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`. In the SQL editor, run [`supabase/schema.sql`](supabase/schema.sql).

3. **Groq (free LLM)** — [console.groq.com/keys](https://console.groq.com/keys) → create API key → `GROQ_API_KEY`. Free tier; default model is `qwen/qwen3.8-27b`.

4. **Resend** — [resend.com/api-keys](https://resend.com/api-keys) → `RESEND_API_KEY`. Dev: keep `RESEND_FROM=WhatsNext <onboarding@resend.dev>` and set `WHATSNEXT_TO_EMAIL` to the email you used for Resend signup. Later: verify a domain at [resend.com/domains](https://resend.com/domains).

5. **App secrets**

```bash
openssl rand -hex 32   # AUTH_SECRET
openssl rand -hex 32   # CRON_SECRET
```

Set `APP_PASSWORD` to a strong password. Set `WEATHER_LAT` / `WEATHER_LON` and `TZ` (default `America/Sao_Paulo`).

6. Run locally:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) → log in → add todos.

## Netlify

1. Connect the repo; build uses `netlify.toml` + `@netlify/plugin-nextjs`.
2. Add the same env vars in Netlify (Site settings → Environment variables). Also set `APP_URL` to your site URL (used by the morning cron and email links).
3. Scheduled function `daily-cron` runs `0 11 * * *` UTC and `POST`s `/api/daily` with `Authorization: Bearer $CRON_SECRET`.

Manual smoke test:

```bash
curl -X POST "$APP_URL/api/daily" -H "Authorization: Bearer $CRON_SECRET"
```

## How it works

- **Todos** — add or paste lines; large tasks may be split into subtasks by Groq/Llama.
- **Home** — today’s cached plan; **Done** advances without a new model call; **Refresh plan** forces a new model recommend.
- **Email** — once per day via `/api/daily` (idempotency key `whatsnext-daily/YYYY-MM-DD`).

## Notes

- Site is password-gated; not for public use.
- `ios/` is an unrelated earlier prototype and is unused by this app.
