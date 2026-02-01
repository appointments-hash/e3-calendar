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
