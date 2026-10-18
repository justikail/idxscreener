const BENEFITS = [
  { icon: "▦", title: "Kondisi Market", text: "Ringkasan pasar hari ini, heatmap yang bisa difilter, dan aliran dana asing." },
  { icon: "◎", title: "Detail Saham", text: "Grafik, teknikal, fundamental, dan bandarmologi — dipisah per halaman agar mudah dibaca." },
  { icon: "★", title: "Rekomendasi", text: "Strategi BPJS, BSJP, Bandarmologi, Growth, dan Value dengan aturan yang tertulis jelas." },
];

/** Kerangka halaman masuk/daftar: manfaat akun di kiri, formulir di kanan. */
export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto grid max-w-5xl gap-10 py-4 lg:grid-cols-[1fr_minmax(0,26rem)] lg:items-start">
      <section className="animate-rise order-2 lg:order-1">
        <p className="kicker">Akun gratis</p>
        <h2 className="mt-3 font-display text-4xl font-semibold leading-tight tracking-tight">
          Riset saham Indonesia, <em className="font-normal text-kunyit-600">sederhana.</em>
        </h2>
        <ul className="mt-6 flex flex-col gap-4">
          {BENEFITS.map((b) => (
            <li key={b.title} className="flex gap-4">
              <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-ink-900 text-lg text-kunyit-400">
                {b.icon}
              </span>
              <span>
                <span className="block text-[1.0625rem] font-semibold">{b.title}</span>
                <span className="block text-[0.9375rem] leading-relaxed text-ink-700">{b.text}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-6 text-sm text-ink-500">Alat bantu riset, bukan rekomendasi jual/beli. Data harian, bukan realtime.</p>
      </section>
      <section className="order-1 rounded-lg border border-ink-900 bg-card p-6 shadow-[6px_6px_0_0_#17140f] sm:p-8 lg:order-2">
        <h1 className="font-display text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-[0.9375rem] text-ink-600">{subtitle}</p>
        <div className="mt-6">{children}</div>
      </section>
    </div>
  );
}

export const inputClass =
  "mt-1.5 w-full rounded-md border border-ink-400 bg-paper px-3.5 py-3 text-[1.0625rem] focus:border-ink-900";
export const labelClass = "block text-[0.9375rem] font-medium text-ink-800";
export const primaryButton =
  "w-full rounded-full bg-ink-900 px-5 py-3 text-[1.0625rem] font-semibold text-paper transition-colors hover:bg-ink-700 disabled:opacity-50";
