
import jwt from "jsonwebtoken";
import { google } from "googleapis";
import { getRefreshToken } from "./tokenStore.js";

function parseCookies(cookieHeader = "") {
  return cookieHeader.split(";").reduce((acc, part) => {
    const [k, ...v] = part.trim().split("=");
    if (!k) return acc;
    acc[k] = decodeURIComponent(v.join("="));
    return acc;
  }, {});
}

function jsonResponse(statusCode, bodyObj) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(bodyObj)
  };
}

function parseBody(event) {
  if (!event.body) return {};
  const raw = event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf-8") : event.body;
  try { return JSON.parse(raw); } catch { return {}; }
}

async function getAuthedClient(event) {
  const cookies = parseCookies(event.headers.cookie || "");
  const session = cookies.e3_session;
  if (!session) throw new Error("No session");
  const payload = jwt.verify(session, process.env.SESSION_JWT_SECRET);

  const { refresh_token } = await getRefreshToken(payload.sub);

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  oauth2Client.setCredentials({ refresh_token });

  const calendar = google.calendar({ version: "v3", auth: oauth2Client });
  return { calendar, user: payload };
}

// E³ metadata encoding (two-way safe)
function buildE3Private({ clientName, clientEmail, clientPhone, serviceType, statusTag }) {
  return {
    e3_client_name: clientName || "",
    e3_client_email: clientEmail || "",
    e3_client_phone: clientPhone || "",
    e3_service_type: serviceType || "",
    e3_status: statusTag || ""
  };
}

function parseE3FromEvent(gevent) {
  const priv = gevent.extendedProperties?.private || {};
  const out = {
    clientName: priv.e3_client_name || "",
    clientEmail: priv.e3_client_email || "",
    clientPhone: priv.e3_client_phone || "",
    serviceType: priv.e3_service_type || "",
    statusTag: priv.e3_status || ""
  };

  // Optional fallback: parse from description block if present
  const desc = gevent.description || "";
  const m = desc.match(/^\[E3META\]([\s\S]*?)^\[\/E3META\]/m);
  if (m && m[1]) {
    const lines = m[1].split("\n").map(s => s.trim()).filter(Boolean);
    for (const line of lines) {
      const [k, ...rest] = line.split(":");
      const v = rest.join(":").trim();
      if (!k) continue;
      const key = k.toLowerCase();
      if (key === "client") out.clientName = out.clientName || v;
      if (key === "email") out.clientEmail = out.clientEmail || v;
      if (key === "phone") out.clientPhone = out.clientPhone || v;
      if (key === "service") out.serviceType = out.serviceType || v;
      if (key === "status") out.statusTag = out.statusTag || v;
    }
  }
  return out;
}

function buildDescription(notes, meta) {
  const cleanNotes = (notes || "").trim();
  const block =
`[E3META]
Client: ${meta.clientName || ""}
Email: ${meta.clientEmail || ""}
Phone: ${meta.clientPhone || ""}
Service: ${meta.serviceType || ""}
Status: ${meta.statusTag || ""}
[/E3META]`;
  return cleanNotes ? `${block}\n\n${cleanNotes}` : block;
}

function buildSummary(meta) {
  const name = (meta.clientName || "").trim();
  const svc = (meta.serviceType || "").trim();
  if (name && svc) return `${name} — ${svc}`;
  if (name) return name;
  return "Appointment";
}


export const handler = async (event) => {
  try {
    const { calendar } = await getAuthedClient(event);

    const qs = event.queryStringParameters || {};
    const timeMin = qs.timeMin;
    const timeMax = qs.timeMax;
    const calIds = (qs.calendars || "").split(",").filter(Boolean);

    if (!timeMin || !timeMax || calIds.length === 0) {
      return jsonResponse(400, { ok:false, message:"Missing timeMin/timeMax/calendars" });
    }

    // Fetch calendar colors once
    const calList = await calendar.calendarList.list({});
    const colorMap = new Map((calList.data.items || []).map(c => [c.id, c.backgroundColor || null]));

    const results = await Promise.all(
      calIds.map(async (calId) => {
        const { data } = await calendar.events.list({
          calendarId: calId,
          timeMin,
          timeMax,
          singleEvents: true,
          orderBy: "startTime",
          maxResults: 2500
        });
        return (data.items || []).map((e) => ({ calId, e }));
      })
    );

    const flat = results.flat();

    const normalized = flat.map(({
      calId, e
    }) => {
      const startISO = e.start?.dateTime || e.start?.date;
      const endISO = e.end?.dateTime || e.end?.date;
      const meta = parseE3FromEvent(e);

      return {
        id: e.id,
        calendarId: calId,
        calendarColor: colorMap.get(calId) || null,
        summary: e.summary || "",
        location: e.location || "",
        description: e.description || "",
        startISO,
        endISO,
        statusTag: (meta.statusTag || "").toLowerCase() || "pending",
        serviceType: meta.serviceType || "meeting",
        clientName: meta.clientName || "",
        clientEmail: meta.clientEmail || "",
        clientPhone: meta.clientPhone || ""
      };
    });

    return jsonResponse(200, normalized);
  } catch (err) {
    return jsonResponse(401, { ok:false, message:"Unauthorized: " + err.message });
  }
};
