import { google } from "googleapis";
import jwt from "jsonwebtoken";
import { upsertRefreshToken } from "./tokenStore.js";

function cookieSerialize(name, value, opts = {}) {
  const parts = [`${name}=${value}`];
  if (opts.httpOnly) parts.push("HttpOnly");
  if (opts.secure) parts.push("Secure");
  if (opts.sameSite) parts.push(`SameSite=${opts.sameSite}`);
  if (opts.path) parts.push(`Path=${opts.path}`);
  if (opts.maxAge != null) parts.push(`Max-Age=${opts.maxAge}`);
  return parts.join("; ");
}

export const handler = async (event) => {
  try {
    const code = event.queryStringParameters?.code;
    if (!code) return { statusCode: 400, body: "Missing code" };

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.refresh_token) {
      return {
        statusCode: 302,
        headers: { Location: `${process.env.APP_BASE_URL}/?auth=needs_reconnect` }
      };
    }

    oauth2Client.setCredentials(tokens);

    const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
    const me = await oauth2.userinfo.get();
    const user = me.data;

    await upsertRefreshToken({
      userId: user.id,
      refreshToken: tokens.refresh_token,
      email: user.email
    });

    const sessionJwt = jwt.sign(
      { sub: user.id, email: user.email, name: user.name },
      process.env.SESSION_JWT_SECRET,
      { expiresIn: "14d" }
    );

    const cookie = cookieSerialize("e3_session", sessionJwt, {
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 14
    });

    return {
      statusCode: 302,
      headers: {
        "Set-Cookie": cookie,
        "Location": `${process.env.APP_BASE_URL}/?auth=success`
      }
    };
  } catch (err) {
    return { statusCode: 500, body: "OAuth callback error: " + err.message };
  }
};
