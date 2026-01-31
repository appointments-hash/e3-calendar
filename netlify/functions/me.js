import jwt from "jsonwebtoken";

function parseCookies(cookieHeader = "") {
  return cookieHeader.split(";").reduce((acc, part) => {
    const [k, ...v] = part.trim().split("=");
    if (!k) return acc;
    acc[k] = decodeURIComponent(v.join("="));
    return acc;
  }, {});
}

export const handler = async (event) => {
  try {
    const cookies = parseCookies(event.headers.cookie || "");
    const token = cookies.e3_session;
    if (!token) return { statusCode: 401, body: JSON.stringify({ ok: false }) };

    const payload = jwt.verify(token, process.env.SESSION_JWT_SECRET);
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true, user: payload })
    };
  } catch {
    return { statusCode: 401, body: JSON.stringify({ ok: false }) };
  }
};
