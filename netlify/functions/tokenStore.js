import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function upsertRefreshToken({ userId, refreshToken, email }) {
  const { error } = await supabase
    .from("google_oauth_tokens")
    .upsert({
      user_id: userId,
      refresh_token: refreshToken,
      email: email || null,
      updated_at: new Date().toISOString()
    });

  if (error) throw new Error("Supabase upsert failed: " + error.message);
}

export async function getRefreshToken(userId) {
  const { data, error } = await supabase
    .from("google_oauth_tokens")
    .select("refresh_token,email")
    .eq("user_id", userId)
    .single();

  if (error) throw new Error("Supabase get failed: " + error.message);
  return data;
}
