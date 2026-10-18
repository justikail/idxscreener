import "server-only";

import { eq } from "drizzle-orm";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";

import { db } from "@/server/db/client";
import { users } from "@/server/db/schema";

// Auth.js v5 (Credentials + JWT). Lihat docs/adr/0002-autentikasi-m2.md untuk
// alasan pemilihan. Tidak ada kriptografi/session protocol buatan sendiri —
// signing/encryption cookie sesi sepenuhnya ditangani library ini.
export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/masuk" },
  // Wajib untuk self-hosted (bukan Vercel): tanpa ini Auth.js menolak semua
  // request dengan "UntrustedHost" karena tidak bisa memverifikasi header Host
  // terhadap deployment platform yang dikenalnya. Aman untuk deployment
  // self-hosted di belakang reverse proxy yang MENGONTROL header Host (mis.
  // nginx dengan server_name eksplisit) — bila di-expose langsung ke internet
  // tanpa proxy tepercaya, pertimbangkan memvalidasi Host di layer sebelumnya.
  trustHost: true,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Kata sandi", type: "password" },
      },
      authorize: async (credentials) => {
        const email = typeof credentials?.email === "string" ? credentials.email.toLowerCase().trim() : null;
        const password = typeof credentials?.password === "string" ? credentials.password : null;
        if (!email || !password) return null;

        const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
        if (!user) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        return { id: user.id, email: user.email, name: user.name, role: user.role };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.role = (user as { role?: string }).role ?? "user";
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = (token.role as string) ?? "user";
      }
      return session;
    },
  },
});
