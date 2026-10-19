// Gestione utenti dall'app (solo admin): crea un utente con profilo, reimposta la password, disattiva o riattiva.
// POST { action: "create", email, full_name, role, phone?, password?, enabled_bands? }
// POST { action: "reset_password", user_id }  -> password temporanea nuova
// POST { action: "deactivate" | "activate", user_id }
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const env = (k: string) => Deno.env.get(k) ?? "";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-device-id" };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
function tempPassword() {
  const a = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let s = "";
  crypto.getRandomValues(new Uint8Array(12)).forEach((b) => { s += a[b % a.length]; });
  return s + "!";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const auth = req.headers.get("Authorization") ?? "";
  const admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { db: { schema: "etidealcrm" } });
  const asUser = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), { db: { schema: "etidealcrm" }, global: { headers: { Authorization: auth } } });
  const { data: { user } } = await asUser.auth.getUser();
  if (!user) return json({ error: "non autenticato" }, 401);
  const { data: me } = await admin.from("profile").select("role,dealership_id,is_active").eq("id", user.id).maybeSingle();
  if (!me || !me.is_active || me.role !== "admin") return json({ error: "solo l'amministratore può gestire gli utenti" }, 403);

  const body = await req.json().catch(() => ({}));
  try {
    if (body.action === "create") {
      const email = String(body.email ?? "").trim().toLowerCase();
      if (!email || !body.full_name || !body.role) return json({ error: "email, full_name e role sono obbligatori" }, 400);
      const password = body.password || tempPassword();
      const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: body.full_name } });
      if (error) throw error;
      const { error: pErr } = await admin.from("profile").insert({
        id: created.user.id, dealership_id: me.dealership_id, full_name: body.full_name, role: body.role, phone: body.phone ?? null,
        is_active: true, is_available: true, enabled_bands: body.enabled_bands ?? ["A", "B"],
      });
      if (pErr) throw pErr;
      return json({ ok: true, user_id: created.user.id, temporary_password: body.password ? null : password });
    }
    if (body.action === "reset_password") {
      const password = tempPassword();
      const { error } = await admin.auth.admin.updateUserById(body.user_id, { password });
      if (error) throw error;
      return json({ ok: true, temporary_password: password });
    }
    if (body.action === "deactivate" || body.action === "activate") {
      const active = body.action === "activate";
      const { error } = await admin.from("profile").update({ is_active: active }).eq("id", body.user_id);
      if (error) throw error;
      return json({ ok: true });
    }
    return json({ error: "action sconosciuta" }, 400);
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 400);
  }
});
