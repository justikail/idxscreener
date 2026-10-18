/** Disclaimer strategi — versi ringkas (atas halaman) dan lengkap (bawah halaman). */
export function DisclaimerBanner() {
  return (
    <div role="note" className="flex gap-3 rounded-md border-2 border-kunyit-400 bg-kunyit-50 px-4 py-3 text-[0.9375rem] text-kunyit-950">
      <span aria-hidden className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-kunyit-400 text-sm font-bold text-ink-950">
        !
      </span>
      <p>
        <strong>Bukan ajakan membeli atau menjual.</strong> Daftar ini hasil penyaringan otomatis dengan aturan tertulis di bawah, dari data harian yang bisa
        terlambat atau keliru. Keputusan dan risikonya sepenuhnya milik Anda.
      </p>
    </div>
  );
}

export function DisclaimerFull() {
  return (
    <section aria-labelledby="disclaimer" className="rounded-md border border-ink-300 bg-card p-4 text-sm leading-relaxed text-ink-700">
      <h2 id="disclaimer" className="mb-2 text-base font-semibold text-ink-900">
        Penting dibaca
      </h2>
      <ul className="ml-4 list-disc space-y-1">
        <li>Halaman ini adalah alat bantu riset, bukan rekomendasi, saran, atau ajakan untuk membeli maupun menjual efek apa pun.</li>
        <li>Daftar saham dihasilkan otomatis dari aturan yang tertulis di halaman ini terhadap data harga penutupan harian dan laporan keuangan dari Pihak Ketiga. Data bisa terlambat, tidak lengkap, atau keliru.</li>
        <li>Lolos aturan tidak berarti harga akan naik. Kinerja masa lalu tidak menjamin hasil di masa depan. Investasi saham mengandung risiko, termasuk kehilangan modal.</li>
        <li>Pertimbangkan tujuan, jangka waktu, dan profil risiko Anda sendiri, dan bila perlu berkonsultasilah dengan penasihat investasi yang memiliki izin.</li>
        <li>Biaya transaksi, pajak, dan selisih harga saat order (slippage) tidak diperhitungkan.</li>
      </ul>
    </section>
  );
}
