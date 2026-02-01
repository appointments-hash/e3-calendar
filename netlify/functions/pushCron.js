import jwt from "jsonwebtoken";
import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

function parseCookies(cookieHeader = "") {
  return cookieHeader.split(";").reduce((acc, part) => {
    const [k, ...v] = part.trim().split("=");
    if (!k) return acc;
    acc[k] = decodeURIComponent(v.join("="));
    return acc;
  }, {});
}

function json(statusCode, body) {
  return { statusCode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

function getUserId(event){
  const cookies = parseCookies(event.headers.cookie || "");
  const session = cookies.e3_session;
  if (!session) throw new Error("No session");
  const payload = jwt.verify(session, process.env.SESSION_JWT_SECRET);
  return payload.sub;
}

function supabaseAdmin(){
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function setupWebPush(){
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    throw new Error("Missing VAPID keys");
  }
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:admin@e3-leadership.com",
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

import { google } from "googleapis";
import { getRefreshToken } from "./tokenStore.js";

// Netlify Scheduled Function: runs every 5 minutes
export const config = { schedule: "*/5 * * * *" };

async function calendarClientForUser(userId){
  const { refresh_token } = await getRefreshToken(userId);
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  oauth2Client.setCredentials({ refresh_token });
  return google.calendar({ version: "v3", auth: oauth2Client });
}

async function sendToUser(sb, userId, payload){
  setupWebPush();
  const { data, error } = await sb.from("push_subscriptions").select("*").eq("user_id", userId);
  if (error) throw error;
  if (!data || data.length === 0) return 0;

  const results = await Promise.allSettled(
    data.map((row) => webpush.sendNotification({
      endpoint: row.endpoint,
      keys: { p256dh: row.p256dh, auth: row.auth }
    }, JSON.stringify(payload)))
  );
  return results.length;
}

async function alreadySent(sb, userId, eventId, kind){
  const { data, error } = await sb.from("push_sent")
    .select("user_id")
    .eq("user_id", userId)
    .eq("event_id", eventId)
    .eq("remind_kind", kind)
    .limit(1);
  if (error) throw error;
  return (data && data.length > 0);
}

async function markSent(sb, userId, eventId, kind){
  const { error } = await sb.from("push_sent").upsert(
    { user_id: userId, event_id: eventId, remind_kind: kind, sent_at: new Date().toISOString() },
    { onConflict: "user_id,event_id,remind_kind" }
  );
  if (error) throw error;
}

async function fetchWindowEvents(calendar, timeMin, timeMax){
  const resp = await calendar.events.list({
    calendarId: "primary",
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 250
  });
  return resp.data.items || [];
}

export const handler = async () => {
  try {
    const sb = supabaseAdmin();
    const { data: users, error: uerr } = await sb.from("google_oauth_tokens").select("user_id");
    if (uerr) throw uerr;
    if (!users || users.length === 0) return json(200, { ok:true, users:0 });

    const now = new Date();
    const windowMs = 5 * 60 * 1000;

    const targets = [
      { kind: "h24", offsetMs: 24*60*60*1000, label: "24 hours" },
      { kind: "h1",  offsetMs: 60*60*1000,    label: "1 hour" }
    ];

    let sentTotal = 0;

    for (const row of users){
      const userId = row.user_id;

      let calendar;
      try { calendar = await calendarClientForUser(userId); } catch { continue; }

      for (const t of targets){
        const startMin = new Date(now.getTime() + t.offsetMs);
        const startMax = new Date(now.getTime() + t.offsetMs + windowMs);

        const events = await fetchWindowEvents(calendar, startMin.toISOString(), startMax.toISOString());

        for (const ev of events){
          if (!ev.id) continue;
          const isAllDay = !!(ev.start && ev.start.date && !ev.start.dateTime);
          if (isAllDay) continue;

          if (await alreadySent(sb, userId, ev.id, t.kind)) continue;

          const title = ev.summary ? `E³ Reminder: ${ev.summary}` : "E³ Calendar Reminder";
          const payload = {
            title,
            body: `Your appointment is in ${t.label}.`,
            url: "/"
          };

          const sent = await sendToUser(sb, userId, payload);
          if (sent > 0){
            await markSent(sb, userId, ev.id, t.kind);
            sentTotal += sent;
          }
        }
      }
    }

    return json(200, { ok:true, sentTotal });
  } catch (e) {
    return json(500, { ok:false, message: e.message });
  }
};
