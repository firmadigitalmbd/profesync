// Crea el primer super_admin (UNA vez, a mano):
//   node --env-file=.env.local scripts/bootstrap-super-admin.mjs <usuario> <clave> "<Nombre>"
import { createClient } from "@supabase/supabase-js";

const [, , username, password, fullName] = process.argv;
if (!username || !password || !fullName) {
  console.error('Uso: node --env-file=.env.local scripts/bootstrap-super-admin.mjs <usuario> <clave> "<Nombre>"');
  process.exit(1);
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const authEmail = `${crypto.randomUUID()}@profesync.internal`;
const { data: created, error } = await supabase.auth.admin.createUser({
  email: authEmail, password, email_confirm: true,
});
if (error || !created.user) { console.error("Error creando usuario:", error); process.exit(1); }
const { error: pErr } = await supabase.from("profiles").insert({
  id: created.user.id, username, full_name: fullName, auth_email: authEmail, role: "super_admin",
});
if (pErr) {
  console.error("Error creando perfil:", pErr);
  await supabase.auth.admin.deleteUser(created.user.id);
  process.exit(1);
}
console.log(`Super admin "${username}" creado.`);
