import { redirect } from "next/navigation";

// Penjelasan perhitungan kini menjadi bagian halaman Tentang Kami agar hanya
// ada satu versi rumus yang ditampilkan ke pengguna.
export default function MethodologyPage() {
  redirect("/tentang#perhitungan");
}
