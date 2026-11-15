"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function markNotificationRead(id: string): Promise<{ error?: string }> {
  await requireRole("teacher");
  const supabase = await createClient();
  const { error } = await supabase.from("notifications").update({ read: true }).eq("id", id);
  if (error) return { error: "No se pudo actualizar" };
  revalidatePath("/dashboard", "layout");
  return {};
}

export async function markAllNotificationsRead(): Promise<{ error?: string }> {
  await requireRole("teacher");
  const supabase = await createClient();
  const { error } = await supabase.from("notifications").update({ read: true }).eq("read", false);
  if (error) return { error: "No se pudo actualizar" };
  revalidatePath("/dashboard", "layout");
  return {};
}
