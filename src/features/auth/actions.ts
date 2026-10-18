"use server";

import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { z } from "zod";

import { db } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { signIn } from "@/server/auth/config";

const registerSchema = z.object({
  name: z.string().trim().min(1, "Nama wajib diisi").max(128),
  email: z.string().trim().toLowerCase().email("Email tidak valid").max(320),
  password: z.string().min(8, "Kata sandi minimal 8 karakter").max(200),
});

export interface RegisterResult {
  ok: boolean;
  error?: string;
}

/** Registrasi pengguna baru. Validasi di server (bukan hanya di form klien). */
export async function registerUser(formData: FormData): Promise<RegisterResult> {
  const parsed = registerSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Input tidak valid." };
  }

  const { name, email, password } = parsed.data;

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing) {
    return { ok: false, error: "Email sudah terdaftar." };
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await db.insert(users).values({ name, email, passwordHash, role: "user" });

  return { ok: true };
}

export async function loginWithCredentials(formData: FormData) {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      redirect("/masuk?error=1");
    }
    throw error;
  }
}
