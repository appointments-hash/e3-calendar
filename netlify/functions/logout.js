export const handler = async () => {
  return {
    statusCode: 200,
    headers: {
      "Set-Cookie": "e3_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ ok: true })
  };
};
