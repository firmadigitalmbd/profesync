import Image from "next/image";
import Link from "next/link";

import { requireRole } from "@/lib/auth";
import { BrandFooter } from "@/components/brand-footer";
import { LogoutButton } from "@/components/superadmin/logout-button";

export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireRole("super_admin");

  return (
    <div className="flex min-h-screen flex-col">
      <div className="app-aurora" aria-hidden="true">
        <div className="app-aurora-grid" />
      </div>
      <header className="flex items-center justify-between bg-brand-ink px-4 py-4 text-white md:px-8">
        <Link href="/superadmin" className="flex items-center gap-3">
          <Image src="/brand/logo-icon.svg" alt="ProfeSync" width={32} height={32} className="rounded-lg" />
          <div>
            <p className="text-sm font-semibold">ProfeSync — Super Administrador</p>
            <p className="text-xs text-white/60">{profile.full_name}</p>
          </div>
        </Link>
        <LogoutButton />
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 md:px-8">{children}</main>
      <BrandFooter />
    </div>
  );
}
