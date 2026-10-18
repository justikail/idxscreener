import { signOut } from "@/server/auth/config";

export function SignOutButton() {
  return (
    <form
      action={async () => {
        "use server";
        await signOut({ redirectTo: "/" });
      }}
    >
      <button type="submit" className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-300 underline underline-offset-4 hover:text-paper">
        Keluar
      </button>
    </form>
  );
}
