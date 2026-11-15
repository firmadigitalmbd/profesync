import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { Profile, UserRole } from "@/lib/supabase/types";

// getClaims() verifica la firma del token en el propio servidor, sin viajar a
// Supabase en cada llamada.
const getSessionUserId = cache(async (): Promise<string | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return data?.claims?.sub ?? null;
});

export const getCurrentProfile = cache(async (): Promise<Profile | null> => {
  const userId = await getSessionUserId();
  if (!userId) return null;

  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("*").eq("id", userId).single();
  return (data as Profile) ?? null;
});

export async function requireProfile(): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  return profile;
}

export async function requireRole(...roles: UserRole[]): Promise<Profile> {
  const profile = await requireProfile();
  if (!roles.includes(profile.role)) redirect("/dashboard");
  return profile;
}

/** true si el docente tiene el plan vigente (activo y no vencido). */
export function isPlanActive(profile: Profile): boolean {
  if (profile.role === "super_admin") return true;
  if (!profile.is_active) return false;
  if (!profile.plan_expires_at) return true;
  return profile.plan_expires_at >= new Date().toISOString().slice(0, 10);
}

/** Docente con plan vigente; si no, redirige al panel (donde se ve el aviso). */
export async function requireActiveTeacher(): Promise<Profile> {
  const profile = await requireRole("teacher");
  if (!isPlanActive(profile)) redirect("/dashboard");
  return profile;
}

/**
 * URL firmada (temporal) para una foto guardada en el bucket privado "media".
 * Las fotos se guardan como ruta "<teacher_id>/<archivo>" en photo_url.
 */
export async function signedMediaUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  const supabase = await createClient();
  const { data } = await supabase.storage.from("media").createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}

export async function signedMediaUrls(
  paths: (string | null | undefined)[]
): Promise<Map<string, string>> {
  const unique = [...new Set(paths.filter((p): p is string => !!p))];
  const map = new Map<string, string>();
  if (unique.length === 0) return map;
  const supabase = await createClient();
  const { data } = await supabase.storage.from("media").createSignedUrls(unique, 60 * 60);
  data?.forEach((item) => {
    if (item.path && item.signedUrl) map.set(item.path, item.signedUrl);
  });
  return map;
}
