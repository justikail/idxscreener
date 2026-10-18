import { redirect } from "next/navigation";

import { auth } from "@/server/auth/config";

/** Alur client: Login → aplikasi (Kondisi Market sebagai halaman awal). */
export default async function Home() {
  const session = await auth();
  redirect(session?.user ? "/pasar" : "/masuk");
}
