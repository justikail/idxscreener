import Link from "next/link";

import { loginWithCredentials } from "@/features/auth/actions";
import { AuthShell, inputClass, labelClass, primaryButton } from "@/features/auth/auth-shell";
import { PasswordField } from "@/features/auth/auth-ui";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ terdaftar?: string; error?: string }> }) {
  const { terdaftar, error } = await searchParams;

  return (
    <AuthShell title="Masuk" subtitle="Selamat datang kembali.">
      {terdaftar && (
        <p role="status" className="mb-4 rounded-md border border-up-300 bg-up-50 px-4 py-3 text-[0.9375rem] text-up-800">
          ✓ Akun berhasil dibuat. Silakan masuk.
        </p>
      )}
      {error && (
        <p role="alert" className="mb-4 rounded-md border border-down-300 bg-down-50 px-4 py-3 text-[0.9375rem] text-down-800">
          Email atau kata sandi salah. Periksa huruf besar/kecil, lalu coba lagi.
        </p>
      )}
      <form action={loginWithCredentials} className="flex flex-col gap-4">
        <div>
          <label htmlFor="email" className={labelClass}>
            Email
          </label>
          <input id="email" name="email" type="email" required autoComplete="email" className={inputClass} />
        </div>
        <PasswordField label="Kata sandi" name="password" autoComplete="current-password" />
        <button type="submit" className={primaryButton}>
          Masuk
        </button>
      </form>
      <p className="mt-5 text-center text-[0.9375rem] text-ink-700">
        Belum punya akun?{" "}
        <Link href="/daftar" className="font-semibold underline underline-offset-4 hover:text-ink-900">
          Daftar gratis
        </Link>
      </p>
    </AuthShell>
  );
}
