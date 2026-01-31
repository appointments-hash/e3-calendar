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
  return oauth2Client;
}

export const handler = async (event) => {
  try {
    const oauth2Client = await getAuthedClient(event);
    const calendar = google.calendar({ version: "v3", auth: oauth2Client });

    const { data } = await calendar.calendarList.list({});
    const calendars = (data.items || []).map((c) => ({
      id: c.id,
      summary: c.summary,
      primary: !!c.primary,
      accessRole: c.accessRole,
      backgroundColor: c.backgroundColor,
      foregroundColor: c.foregroundColor
    }));

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(calendars)
    };
  } catch (err) {
    return { statusCode: 401, body: "Unauthorized: " + err.message };
  }
};
