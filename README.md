# E³ Calendar Manager (Netlify Drag & Drop Starter)

## What this is
A Netlify-ready static + functions scaffold:
- `/public/index.html` (PWA-like UI, black & gold)
- Google OAuth "web app" flow (server-side) with refresh token storage in Supabase
- Cookie-based session (HttpOnly) + silent token refresh via Google API client
- No Service Worker

## Deploy (Drag & Drop)
1. Zip this folder and drag-drop into Netlify
2. Set environment variables (Site settings → Environment):
   - GOOGLE_CLIENT_ID
   - GOOGLE_CLIENT_SECRET
   - GOOGLE_REDIRECT_URI = https://YOUR-SITE.netlify.app/.netlify/functions/oauthCallback
   - SESSION_JWT_SECRET (long random)
   - SUPABASE_URL
   - SUPABASE_SERVICE_ROLE_KEY
   - APP_BASE_URL = https://YOUR-SITE.netlify.app
3. In Supabase, create table:

```sql
create table if not exists google_oauth_tokens (
  user_id text primary key,
  refresh_token text not null,
  email text,
  updated_at timestamptz default now()
);
```

## Endpoints (frontend calls)
- GET  /api/me
- GET  /api/calendars
- GET  /api/events?timeMin=...&timeMax=...&calendars=cal1,cal2
- GET  /api/authStart  (redirect to Google)
- GET  /api/oauthCallback (Google redirect)
- POST /api/eventsCreate  (placeholder)
- POST /api/eventsUpdate  (placeholder)
- POST /api/eventsDelete  (placeholder)

Create/Update/Delete are implemented via Netlify Functions.


## Push Notifications (App Alerts)

### Supabase tables
Run in Supabase **SQL Editor**:

```sql
create table if not exists push_subscriptions (
  user_id text not null,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  updated_at timestamptz default now(),
  primary key (user_id, endpoint)
);

create table if not exists push_sent (
  user_id text not null,
  event_id text not null,
  remind_kind text not null, -- 'h24' or 'h1'
  sent_at timestamptz default now(),
  primary key (user_id, event_id, remind_kind)
);
```

### Netlify environment variables (add these)
- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT` (optional, e.g. `mailto:admin@e3-leadership.com`)

### Generate VAPID keys
From your computer (requires Node):
```bash
npx web-push generate-vapid-keys
```
Copy the outputs into Netlify env vars.

### Enable reminders in the app
Click **🔔 Reminders** once, grant permission, and you'll get a test push.

### Scheduled reminders
`pushCron` runs every 5 minutes and sends reminders **24h** and **1h** before upcoming events on your **primary** calendar.

Note: Netlify Scheduled Functions require supported plans/feature availability.
