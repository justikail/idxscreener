import { redirect } from "next/navigation";

/** Pencarian dipindah ke menu Detail Saham (/saham?q=). */
export default async function SearchRedirect({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  redirect(q ? `/saham?q=${encodeURIComponent(q)}` : "/saham");
}
