import type { Metadata } from "next";
import Link from "next/link";

import { Term } from "@/components/Term";
import { formatTradingDate } from "@/lib/format";
import { getDashboardRows } from "@/server/db/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tentang Kami — Screener Saham ID",
  description: "Siapa kami, dari mana data berasal, dan bagaimana setiap angka di situs ini dihitung.",
};

const TOC = [
  ["apa-ini", "Apa ini"],
  ["prinsip", "Prinsip kami"],
  ["alur-data", "Perjalanan data"],
  ["perhitungan", "Cara kami menghitung"],
  ["screener", "Logika screener"],
  ["status", "Status data"],
  ["pihak-ketiga", "Pihak Ketiga"],
  ["batasan", "Batasan"],
] as const;

export default async function AboutPage() {
  const rows = await getDashboardRows();
  const covered = rows.filter((r) => r.close !== null);
  const sampleHref = covered[0] ? `/saham/${covered[0].code}` : "/";
  const lastDate = covered.map((r) => r.tradingDate).filter(Boolean).sort().at(-1) ?? null;

  return (
    <div className="flex flex-col gap-16">
      {/* Pembuka */}
      <section className="animate-rise">
        <p className="kicker">Tentang kami</p>
        <h1 className="mt-4 max-w-4xl font-display text-5xl font-semibold leading-[0.95] tracking-tight text-ink-900 sm:text-6xl lg:text-7xl">
          Membaca pasar, <em className="font-normal text-kunyit-600">tanpa menebak</em>.
        </h1>
        <div className="mt-8 grid gap-8 lg:grid-cols-[1.4fr_1fr]">
          <p className="text-xl leading-relaxed text-ink-700">
            Screener Saham ID adalah alat bantu riset untuk saham Bursa Efek Indonesia. Kami mengambil data pasar harian,
            memeriksanya, lalu menyajikannya dalam bentuk yang bisa dibaca orang yang baru belajar saham — lengkap
            dengan alasan di balik setiap angka.
          </p>
          <dl className="grid grid-cols-2 gap-px self-start overflow-hidden rounded-sm border border-ink-900 bg-ink-900">
            <div className="bg-paper p-4">
              <dt className="kicker">Saham dalam cakupan</dt>
              <dd className="num mt-1 text-3xl font-semibold">{covered.length}</dd>
            </div>
            <div className="bg-paper p-4">
              <dt className="kicker">Data terakhir</dt>
              <dd className="num mt-1 text-lg font-semibold leading-tight">{lastDate ? formatTradingDate(lastDate, { weekday: false }) : "—"}</dd>
            </div>
            <div className="col-span-2 bg-ink-900 p-4 text-sm leading-relaxed text-ink-200">
              Harga penutupan harian, <Term k="realtime" className="decoration-ink-500">bukan realtime</Term>. Bukan rekomendasi jual atau beli.
            </div>
          </dl>
        </div>
      </section>

      <div className="grid gap-12 lg:grid-cols-[13rem_minmax(0,1fr)]">
        {/* Daftar isi */}
        <nav aria-label="Daftar isi" className="hidden lg:block">
          <ol className="sticky top-6 space-y-2 border-l border-ink-300 pl-4">
            {TOC.map(([id, label], i) => (
              <li key={id}>
                <a href={`#${id}`} className="group flex gap-3 text-sm text-ink-600 hover:text-ink-900">
                  <span className="num text-xs text-ink-400 group-hover:text-kunyit-600">{String(i + 1).padStart(2, "0")}</span>
                  {label}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="flex min-w-0 flex-col gap-16">
          <Section id="apa-ini" no="01" title="Apa yang bisa Anda lakukan di sini">
            <div className="grid gap-px overflow-hidden rounded-sm border border-ink-200 bg-ink-200 sm:grid-cols-2">
              {[
                ["Dashboard", "/", "Ringkasan sesi terakhir: berapa saham naik dan turun, peta pasar, serta penguat dan pelemah terbesar."],
                ["Detail saham", sampleHref, "Grafik harga, indikator teknikal, rasio keuangan, pengumuman, dan catatan pribadi Anda."],
                ["Screener", "/screener", "Saring saham dengan aturan yang tertulis jelas, dan lihat kondisi mana yang terpenuhi atau gagal."],
                ["Watchlist", "/watchlist", "Simpan saham yang ingin Anda pantau. Saham di watchlist ditandai ★ di seluruh situs."],
              ].map(([title, href, body]) => (
                <Link key={title} href={href!} className="group bg-paper p-5 transition-colors hover:bg-card">
                  <span className="flex items-baseline justify-between">
                    <span className="font-display text-xl font-semibold">{title}</span>
                    <span aria-hidden className="text-ink-400 transition-transform group-hover:translate-x-1 group-hover:text-kunyit-600">→</span>
                  </span>
                  <span className="mt-2 block text-sm leading-relaxed text-ink-600">{body}</span>
                </Link>
              ))}
            </div>
          </Section>

          <Section id="prinsip" no="02" title="Prinsip kami">
            <ol className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
              {[
                ["Jujur soal waktu.", "Setiap harga adalah harga penutupan sesi tertentu, dan tanggalnya selalu ditampilkan. Kami tidak menyebut data kami realtime."],
                ["Kosong tetap kosong.", "Data yang belum ada tidak pernah diisi nol atau angka perkiraan. Saham dengan data kosong tidak dianggap lolos filter."],
                ["Aturan terbuka.", "Tidak ada skor misterius. Screener menampilkan setiap syarat, ambang batasnya, dan nilai aktual tiap saham."],
                ["Bantu riset, bukan memberi sinyal.", "Hasil screening adalah titik awal riset Anda sendiri — bukan rekomendasi, dan bukan peluang keuntungan."],
              ].map(([head, body], i) => (
                <li key={head} className="border-t-2 border-ink-900 pt-4">
                  <span className="num text-sm text-kunyit-600">{String(i + 1).padStart(2, "0")}</span>
                  <p className="mt-1 font-display text-2xl font-semibold leading-tight">{head}</p>
                  <p className="mt-2 leading-relaxed text-ink-700">{body}</p>
                </li>
              ))}
            </ol>
          </Section>

          <Section id="alur-data" no="03" title="Perjalanan data, dari bursa ke layar Anda">
            <p className="max-w-2xl leading-relaxed text-ink-700">
              Situs ini tidak mengambil data saat Anda membuka halaman. Data diproses lebih dulu oleh sistem kami, lalu
              halaman membaca hasil yang sudah tersimpan.
            </p>
            <ol className="mt-8 grid gap-px overflow-hidden rounded-sm border border-ink-900 bg-ink-900 md:grid-cols-5">
              {[
                ["Ambil", "Harga harian dari sesi yang sudah ditutup diambil dari penyedia data Pihak Ketiga."],
                ["Periksa", "Setiap baris dicek: tertinggi ≥ terendah, pembukaan dan penutupan di dalam rentang, tidak negatif, tanggal valid, tidak ganda."],
                ["Karantina", "Baris yang janggal disisihkan dan dicatat — tidak diperbaiki diam-diam, tidak ditampilkan."],
                ["Simpan", "Satu baris per saham per sesi. Mengulang proses tidak membuat data ganda."],
                ["Hitung", "Indikator dan rasio dihitung dari data tersimpan, lalu ditampilkan bersama tanggalnya."],
              ].map(([title, body], i) => (
                <li key={title} className="relative bg-paper p-5">
                  <span className="num text-xs text-ink-400">{String(i + 1).padStart(2, "0")}</span>
                  <p className="mt-1 font-display text-xl font-semibold">{title}</p>
                  <p className="mt-2 text-sm leading-relaxed text-ink-600">{body}</p>
                </li>
              ))}
            </ol>
          </Section>

          <Section id="perhitungan" no="04" title="Cara kami menghitung">
            <p className="max-w-2xl leading-relaxed text-ink-700">
              Semua rumus di bawah adalah yang benar-benar dipakai sistem. Arahkan kursor atau ketuk istilah bergaris
              titik-titik untuk penjelasan singkat.
            </p>

            <h3 className="kicker mt-10 border-b border-ink-300 pb-2">Harga & pasar</h3>
            <Formulas
              items={[
                ["Perubahan harian", "(penutupan hari ini − penutupan sesi sebelumnya) ÷ penutupan sesi sebelumnya × 100%"],
                [<Term key="b" k="breadth">Breadth</Term>, "jumlah saham menguat, tetap, dan melemah dibanding sesi sebelumnya — hanya saham yang diperdagangkan pada sesi terakhir"],
                [<Term key="m" k="median" />, "nilai tengah perubahan harian saham yang diperdagangkan pada sesi terakhir"],
                [<Term key="n" k="nilai_transaksi" />, "jumlah rupiah yang diperdagangkan dalam sesi terakhir, dijumlahkan seluruh saham"],
                [<Term key="p" k="peta_pasar" />, "60 saham dengan nilai transaksi terbesar; luas kotak sebanding nilai transaksi, warna dari perubahan harian"],
                ["Judul dashboard", "“menguat” bila saham naik ≥ 1,5 × saham turun; “melemah” bila sebaliknya; selain itu “campuran”"],
              ]}
            />

            <h3 className="kicker mt-10 border-b border-ink-300 pb-2">Teknikal — dari harga penutupan</h3>
            <Formulas
              items={[
                [<Term key="s" k="sma" />, "rata-rata harga penutupan n sesi terakhir (SMA20, SMA50)"],
                ["EMA", "rata-rata eksponensial: awal = SMA n sesi pertama, lalu bobot 2 ÷ (n + 1) untuk harga terbaru"],
                [<Term key="r" k="rsi14" />, "100 − 100 ÷ (1 + rata-rata kenaikan ÷ rata-rata penurunan), 14 sesi, perataan Wilder"],
                [<Term key="c" k="macd" />, "EMA12 − EMA26; garis sinyal = EMA9 dari MACD; histogram = MACD − sinyal"],
                [<Term key="v" k="volume_relatif" />, "volume sesi ÷ rata-rata volume 20 sesi sebelumnya (sesi itu sendiri tidak ikut dirata-rata)"],
                [<Term key="y" k="rentang_52" />, "harga terendah dan tertinggi dalam 250 sesi terakhir"],
              ]}
            />
            <p className="mt-4 text-sm leading-relaxed text-ink-600">
              Indikator butuh riwayat minimum (misalnya RSI 14 butuh ≥ 15 sesi). Bila riwayat belum cukup, kami menulis
              “Riwayat belum cukup”, bukan angka.
            </p>

            <h3 className="kicker mt-10 border-b border-ink-300 pb-2">Fundamental — dari laporan keuangan</h3>
            <Formulas
              items={[
                [<Term key="t" k="ttm" />, "jumlah 4 kuartal MANDIRI berurutan tanpa celah; angka YTD tidak dijumlahkan, dan kuartal yang basisnya belum terbukti tidak dipakai"],
                [<Term key="pe" k="per" />, "(harga × saham tercatat terbaru) ÷ laba bersih entitas induk TTM"],
                [<Term key="pb" k="pbv" />, "(harga × saham tercatat terbaru) ÷ ekuitas milik entitas induk pada neraca terakhir"],
                [<Term key="re" k="roe" />, "laba bersih entitas induk TTM ÷ rata-rata ekuitas entitas induk (neraca terakhir dan 4 kuartal sebelumnya)"],
                [<Term key="ra" k="roa" />, "laba bersih TTM ÷ rata-rata total aset (neraca terakhir dan 4 kuartal sebelumnya)"],
                [<Term key="np" k="npm" />, "laba bersih TTM ÷ pendapatan TTM (hanya bila pos pendapatan terpetakan untuk format laporan emiten)"],
                [<Term key="de" k="der" />, "total liabilitas ÷ total ekuitas, akhir periode"],
                [<Term key="kp" k="kapitalisasi_pasar" />, "harga penutupan terakhir × saham tercatat (tanggal daftar saham disebut)"],
                [<Term key="an" k="asing_net" />, "Σ (beli asing − jual asing) 5 sesi ÷ Σ volume 5 sesi, dalam lembar"],
                [<Term key="sm" k="seasonality" />, "penutupan akhir bulan ÷ penutupan akhir bulan sebelumnya − 1; hanya bulan lengkap"],
              ]}
            />
            <p className="mt-4 text-sm leading-relaxed text-ink-600">
              Laba ≤ 0 membuat PER <Term k="tidak_bermakna">tidak bermakna</Term>; ekuitas ≤ 0 membuat PBV tidak bermakna.
              PER negatif bukan berarti murah, jadi kami tidak menampilkannya sebagai angka. DER bank tidak dibandingkan
              dengan perusahaan nonbank karena simpanan nasabah tercatat sebagai liabilitas.
            </p>
          </Section>

          <Section id="screener" no="05" title="Logika screener">
            <div className="grid gap-8 md:grid-cols-[1fr_1fr]">
              <div className="space-y-4 leading-relaxed text-ink-700">
                <p>
                  Setiap <Term k="preset" /> adalah sekumpulan syarat yang semuanya harus terpenuhi. Sebuah saham lolos
                  hanya bila <strong>setiap</strong> syarat bernilai benar.
                </p>
                <p>
                  Bila data untuk satu syarat belum tersedia, syarat itu ditandai <strong>?</strong> dan saham dihitung
                  tidak lolos. Kami tidak pernah menganggap data kosong sebagai memenuhi syarat.
                </p>
                <p>
                  Di bagian “Tidak lolos”, saham yang memenuhi syarat paling banyak ditampilkan lebih dulu — berguna untuk
                  melihat saham yang hampir lolos.
                </p>
              </div>
              <figure className="rounded-sm border border-ink-200 bg-card p-5">
                <figcaption className="kicker">Contoh membaca hasil</figcaption>
                <ul className="mt-4 flex flex-wrap gap-2">
                  <li className="num inline-flex items-center gap-2 rounded-sm border border-up-600 bg-up-50 px-2 py-1 text-xs text-up-800">
                    <b aria-hidden>✓</b> RSI 14 <span className="opacity-60">≥ 55</span>
                    <span className="border-l border-ink-900/15 pl-2 font-semibold">61,2</span>
                  </li>
                  <li className="num inline-flex items-center gap-2 rounded-sm border border-down-400 bg-down-50 px-2 py-1 text-xs text-down-800">
                    <b aria-hidden>✕</b> Vol. relatif <span className="opacity-60">≥ 1,20x</span>
                    <span className="border-l border-ink-900/15 pl-2 font-semibold">0,84x</span>
                  </li>
                  <li className="num inline-flex items-center gap-2 rounded-sm border border-dashed border-ink-400 bg-paper px-2 py-1 text-xs text-ink-600">
                    <b aria-hidden>?</b> PER <span className="opacity-60">≤ 15,00x</span>
                    <span className="border-l border-ink-900/15 pl-2 font-semibold">kosong</span>
                  </li>
                </ul>
                <p className="mt-4 text-sm leading-relaxed text-ink-600">
                  ✓ terpenuhi · ✕ tidak terpenuhi · ? data belum tersedia. Angka paling kanan adalah nilai aktual saham itu.
                </p>
              </figure>
            </div>
          </Section>

          <Section id="status" no="06" title="Arti status data">
            <dl className="divide-y divide-ink-200 border-y border-ink-200">
              {[
                ["Tersedia", "Angka dihitung dari data lengkap."],
                ["Data belum tersedia", "Data yang dibutuhkan belum masuk. Bukan nol."],
                ["Tidak bermakna", "Angka bisa dihitung tetapi menyesatkan (mis. PER saat rugi), jadi sengaja tidak ditampilkan."],
                ["Tertinggal", "Data terakhir saham ini lebih tua dari tanggal data terbaru saham lain — mungkin tidak diperdagangkan atau disuspensi."],
                ["Data demo", "Data buatan untuk uji coba. Selalu diberi label jelas dan tidak pernah dicampur diam-diam dengan data pasar."],
              ].map(([term, body]) => (
                <div key={term} className="grid gap-1 py-3 sm:grid-cols-[12rem_1fr] sm:gap-6">
                  <dt className="font-semibold">{term}</dt>
                  <dd className="text-ink-700">{body}</dd>
                </div>
              ))}
            </dl>
          </Section>

          <Section id="pihak-ketiga" no="07" title="Pihak Ketiga">
            <p className="max-w-2xl leading-relaxed text-ink-700">
              Kami bergantung pada layanan Pihak Ketiga untuk sebagian pekerjaan. Kami tidak berafiliasi dengan mereka,
              dan mereka tidak bertanggung jawab atas cara kami mengolah atau menampilkan data.
            </p>
            <ul className="mt-6 grid gap-px overflow-hidden rounded-sm border border-ink-200 bg-ink-200 sm:grid-cols-2">
              <li className="bg-paper p-5">
                <p className="kicker">Pihak Ketiga · Data pasar</p>
                <p className="mt-2 font-display text-xl font-semibold">Penyedia data pasar</p>
                <p className="mt-2 text-sm leading-relaxed text-ink-600">
                  Harga harian (pembukaan, tertinggi, terendah, penutupan, volume, nilai) dan, bila tersedia, laporan
                  keuangan. Data diperiksa ulang oleh sistem kami sebelum ditampilkan.
                </p>
              </li>
              <li className="bg-paper p-5">
                <p className="kicker">Pihak Ketiga · Grafik</p>
                <p className="mt-2 font-display text-xl font-semibold">TradingView Lightweight Charts™</p>
                <p className="mt-2 text-sm leading-relaxed text-ink-600">
                  Pustaka sumber terbuka untuk menggambar grafik harga. Data grafik berasal dari database kami sendiri,
                  bukan dari TradingView.{" "}
                  <a href="https://www.tradingview.com/" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-ink-900">
                    tradingview.com ↗
                  </a>
                </p>
              </li>
            </ul>
          </Section>

          <Section id="batasan" no="08" title="Batasan yang perlu Anda tahu">
            <ul className="space-y-3 leading-relaxed text-ink-700">
              {[
                `Cakupan saat ini ${covered.length} saham dengan data harga, dari daftar saham penyedia. Saham yang baru tercatat atau belum pernah diperdagangkan bisa belum memiliki data.`,
                "Kami belum memastikan apakah harga historis sudah disesuaikan dengan aksi korporasi seperti stock split atau right issue. Grafik bisa menunjukkan lompatan harga pada tanggal tersebut.",
                "Rasio keuangan hanya muncul bila laporan keuangan sudah tersedia; sebagian saham mungkin belum memilikinya.",
                "Kesalahan data dari Pihak Ketiga tetap mungkin terjadi walau sudah diperiksa. Selalu cocokkan dengan keterbukaan informasi resmi sebelum mengambil keputusan.",
                "Situs ini tidak memberi rekomendasi dan tidak menjamin keuntungan. Keputusan investasi sepenuhnya tanggung jawab Anda.",
              ].map((text) => (
                <li key={text} className="flex gap-3">
                  <span aria-hidden className="mt-2.5 h-1.5 w-1.5 shrink-0 bg-kunyit-500" />
                  <span>{text}</span>
                </li>
              ))}
            </ul>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ id, no, title, children }: { id: string; no: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-judul`} className="scroll-mt-6">
      <div className="mb-6 flex items-baseline gap-4 border-b border-ink-900 pb-3">
        <span className="num text-sm text-kunyit-600">{no}</span>
        <h2 id={`${id}-judul`} className="section-title">
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

function Formulas({ items }: { items: Array<[React.ReactNode, string]> }) {
  return (
    <dl className="divide-y divide-ink-200">
      {items.map(([term, formula], i) => (
        <div key={i} className="grid gap-1 py-3 sm:grid-cols-[12rem_1fr] sm:gap-6">
          <dt className="font-semibold">{term}</dt>
          <dd className="num text-sm leading-relaxed text-ink-700">{formula}</dd>
        </div>
      ))}
    </dl>
  );
}
