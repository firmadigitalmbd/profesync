import Link from "next/link";
import { Bell } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { ConfirmButton } from "@/components/confirm-button";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { syncNotifications } from "@/lib/notifications";
import { markAllNotificationsRead, markNotificationRead } from "@/lib/actions/notificaciones";
import type { AppNotification } from "@/lib/supabase/types";

export default async function NotificacionesPage() {
  const profile = await requireRole("teacher");
  await syncNotifications(profile);

  const supabase = await createClient();
  const { data } = await supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(100);
  const notifications = (data ?? []) as AppNotification[];
  const unread = notifications.filter((n) => !n.read).length;

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-brand-ink">Notificaciones</h1>
          <p className="text-sm text-brand-muted">
            Alertas de inasistencias, seguimientos pendientes, fin de periodo y vencimiento del plan.
          </p>
        </div>
        {unread > 0 && (
          <ConfirmButton action={markAllNotificationsRead} variant="outline" size="sm">
            Marcar todas como leídas
          </ConfirmButton>
        )}
      </div>

      {notifications.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-sm text-brand-muted">
            <Bell className="h-6 w-6" />
            Todo en orden: no hay alertas por ahora.
          </CardContent>
        </Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {notifications.map((n) => (
            <li
              key={n.id}
              className={`flex items-start justify-between gap-3 rounded-[var(--radius-brand-md)] border p-3 ${
                n.read ? "border-brand-border bg-white/60" : "border-brand bg-white shadow-sm"
              }`}
            >
              <div className="min-w-0">
                <p className={`text-sm ${n.read ? "text-brand-muted" : "font-semibold text-brand-ink"}`}>{n.title}</p>
                {n.body && <p className="mt-0.5 text-sm text-brand-muted">{n.body}</p>}
                <div className="mt-1 flex items-center gap-3 text-xs text-brand-muted">
                  <span>{new Date(n.created_at).toLocaleDateString("es-CO", { day: "numeric", month: "short" })}</span>
                  {n.link && (
                    <Link href={n.link} className="font-medium text-brand-dark underline">
                      Ver
                    </Link>
                  )}
                </div>
              </div>
              {!n.read && (
                <ConfirmButton action={markNotificationRead.bind(null, n.id)} variant="ghost" size="sm">
                  Leída
                </ConfirmButton>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
