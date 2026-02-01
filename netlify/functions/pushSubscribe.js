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

export const handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") return json(405, { ok:false, message:"Method not allowed" });
    const userId = getUserId(event);
    const body = event.body ? JSON.parse(event.body) : {};
    const subscription = body.subscription;
    if (!subscription || !subscription.endpoint) return json(400, { ok:false, message:"Missing subscription" });

    const sb = supabaseAdmin();
    const payload = {
      user_id: userId,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys?.p256dh || "",
      auth: subscription.keys?.auth || "",
      updated_at: new Date().toISOString()
    };

    const { error } = await sb.from("push_subscriptions").upsert(payload, { onConflict: "user_id,endpoint" });
    if (error) throw error;

    return json(200, { ok:true });
  } catch (e) {
    return json(401, { ok:false, message: e.message });
  }
};
