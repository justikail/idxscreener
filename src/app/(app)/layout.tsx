import { redirect } from "next/navigation";

import { AppShell } from "@/components/shell/AppShell";
import { STRATEGIES } from "@/domain/strategies";
import { SignOutButton } from "@/features/auth/sign-out-button";
import { auth } from "@/server/auth/config";

/** Semua menu utama di balik login (alur client: Login → sidebar 3 menu). */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/masuk");
  return (
    <AppShell
      user={{ name: session.user.name ?? "Pengguna", isAdmin: session.user.role === "admin" }}
      strategies={STRATEGIES.map((s) => ({ slug: s.slug, name: s.name }))}
      signOut={<SignOutButton />}
    >
      {children}
    </AppShell>
  );
}
