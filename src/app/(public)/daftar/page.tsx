"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { registerUser } from "@/features/auth/actions";
import { AuthShell, inputClass, labelClass, primaryButton } from "@/features/auth/auth-shell";
import { PasswordField } from "@/features/auth/auth-ui";

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <AuthShell title="Daftar" subtitle="Gratis. Cukup nama, email, dan kata sandi.">
      <form
        className="flex flex-col gap-4"
        action={async (formData) => {
          setPending(true);
          setError(null);
          const result = await registerUser(formData);
          setPending(false);
          if (!result.ok) {
            setError(result.error ?? "Pendaftaran gagal.");
            return;
          }
          router.push("/masuk?terdaftar=1");
        }}
      >
        <div>
          <label htmlFor="name" className={labelClass}>
            Nama panggilan
          </label>
          <input id="name" name="name" required autoComplete="nickname" maxLength={128} className={inputClass} />
        </div>
        <div>
          <label htmlFor="email" className={labelClass}>
            Email
          </label>
          <input id="email" name="email" type="email" required autoComplete="email" className={inputClass} />
        </div>
        <PasswordField label="Kata sandi" name="password" minLength={8} autoComplete="new-password" hint="Minimal 8 karakter." />
        {error && (
          <p role="alert" className="rounded-md border border-down-300 bg-down-50 px-4 py-3 text-[0.9375rem] text-down-800">
            {error}
          </p>
        )}
        <button type="submit" disabled={pending} className={primaryButton}>
          {pending ? "Memproses…" : "Buat akun"}
        </button>
      </form>
      <p className="mt-5 text-center text-[0.9375rem] text-ink-700">
        Sudah punya akun?{" "}
        <Link href="/masuk" className="font-semibold underline underline-offset-4 hover:text-ink-900">
          Masuk
        </Link>
      </p>
    </AuthShell>
  );
}
