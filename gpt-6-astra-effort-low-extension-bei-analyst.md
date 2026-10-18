# Audit sumber data BEI untuk screener saham Indonesia

**Pemeriksaan: 19 September 2026 · Asia/Jakarta.** Ekspor dari laporan sebelumnya; tidak ada pemeriksaan ulang pada ekspor ini.

Browser pengguna, baca-saja, sampel kecil, tanpa login/pembelian/perubahan layanan.

Format berkas mengikuti tautan/nama berkas; seluruh isi berkas belum divalidasi. Kelayakan otomatisasi bukan izin penggunaan ulang. Angka JSON dinormalisasi tanpa pemisah ribuan.

## A. Kesimpulan masalah tanggal

Histori harian UI terverifikasi; penyebab endpoint dan request API benar belum terpecahkan.

[Ringkasan Saham](https://www.idx.co.id/id/data-pasar/ringkasan-perdagangan/ringkasan-saham) ditemukan melalui beranda → Saham Teraktif → Lihat Semua.

### Terverifikasi

- Pemilih tanggal menerima 27 dan 28 Agustus 2026.
- Tanggal Perdagangan Terakhir, harga, volume, nilai, frekuensi berubah sesuai pilihan.
- Halaman memakai satu pemilih tanggal; kemampuan histori per hari terbukti.

### Belum terverifikasi

- Apakah UI memanggil endpoint GetStockSummary yang diberikan pengguna.
- Nama parameter tanggal, metode HTTP, query/body, Content-Type, dan pagination API.
- Penyebab request startDate/endDate Agustus menghasilkan 18 September.
- Dukungan rentang tanggal.
- Cache sebagai penyebab.

**Hipotesis, bukan temuan:** Parameter tidak dikenali mungkin diabaikan dan endpoint kembali ke snapshot terakhir; belum terbukti.

URL dari pengguna, belum diverifikasi:

https://idx.co.id/primary/TradingSummary/GetStockSummary?startDate=2026-08-01&endDate=2026-08-30&draw=1&start=0&length=1000

**Pengujian situs:** BEI mengumumkan periode 18 September 2026 pukul 18.00 sampai 19 September 2026 pukul 20.00 WIB. Kode DUMMY terlihat pada Aksi Korporasi. Ringkasan Saham tidak disebut eksplisit pada daftar halaman pengujian; ini tidak membuktikan penyebab masalah endpoint. [Beranda BEI](https://www.idx.co.id/id)

## B. Bukti pengujian

Data tabel yang dirender halaman, bukan inspeksi langsung respons JSON.

Keadaan awal: pemilih tanggal 2026-09-19, total 963 baris. AADI: penutupan 11.975, volume 15.293.600. AALI: penutupan 8.600, volume 2.999.800. Tanggal payload belum diperiksa.

| Tanggal pilihan | Tanggal kolom perdagangan | Saham | Tertinggi | Terendah | Penutupan | Volume | Nilai | Frekuensi |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-08-27 | 27 Agt 2026 | AADI | 10.175 | 9.900 | 10.125 | 4.773.900 | 48.176.157.500 | 3.229 |
| 2026-08-28 | 28 Agt 2026 | AADI | 10.250 | 10.050 | 10.225 | 5.259.500 | 53.442.792.500 | 3.208 |
| 2026-08-27 | 27 Agt 2026 | AALI | 8.000 | 7.700 | 8.000 | 781.600 | 6.145.330.000 | 777 |
| 2026-08-28 | 28 Agt 2026 | AALI | 8.000 | 7.900 | 7.975 | 546.500 | 4.348.745.000 | 533 |

### Pagination

- Kedua tanggal: 1–10 dari 963.
- Pilihan ukuran: 10, 20, 30, 40, 50, All.
- Ukuran 20 berhasil menampilkan 1–20 dari 963, termasuk ADHI sampai AGRS.
- Percobaan tombol navigasi belum mengonfirmasi perpindahan halaman.
- Pagination server/browser dan kelengkapan length=1000 belum diketahui.

**Request minimal terverifikasi: belum tersedia.** Extension tidak menyediakan pengamatan Network. JavaScript inline publik tidak memuat detail pemanggilan yang diperlukan.

## C. Inventaris sumber resmi

Diamati = tabel/kontrol/tautan terlihat. Dokumentasi = layanan dijelaskan, feed belum diuji. Tautan saja = ditemukan di menu, isi belum diperiksa. Kelayakan otomatisasi tidak berarti izin penggunaan ulang.

| Dataset | URL halaman resmi | Endpoint/unduhan ditemukan | Field penting | Cakupan historis | Frekuensi/delay | Format | Login/langganan | Kelayakan otomatisasi | Bukti dan keterbatasan |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Ringkasan Saham | https://www.idx.co.id/id/data-pasar/ringkasan-perdagangan/ringkasan-saham | Tombol Unduh; URL API/unduh belum diketahui | Kode<br>OHLC<br>Sebelumnya<br>Tanggal Perdagangan Terakhir<br>Volume<br>Nilai<br>Frekuensi<br>Remarks | 27–28 Agustus 2026 terbukti; batas awal belum diketahui | Per tanggal; jam publikasi/delay belum diketahui | HTML<br>Format unduh belum diketahui | Tabel tanpa login | Layak bersyarat setelah request dan izin jelas | Diamati 963 baris; sumber tertulis Data Feed Reporting. OHLC mencakup pilihan kolom Open Price; nilai Open Price belum diuji. |
| Foreign flow | https://www.idx.co.id/id/data-pasar/ringkasan-perdagangan/ringkasan-saham | Pilihan kolom Foreign Buy dan Foreign Sell | Foreign Buy<br>Foreign Sell | Ketersediaan historis tiap field belum diketahui | Belum diketahui | Kolom tabel | Halaman tanpa login | Potensial | Nama kolom terverifikasi; nilai sampel, satuan, dan cakupan pasar belum diuji. |
| Bid/offer snapshot | https://www.idx.co.id/id/data-pasar/ringkasan-perdagangan/ringkasan-saham | Pilihan kolom Bid, Offer, Bid Volume, Offer Volume | Bid<br>Offer<br>Bid Volume<br>Offer Volume | Belum diketahui | Waktu snapshot belum diketahui | Kolom tabel | Halaman tanpa login | Terbatas pada snapshot tersedia | Tidak membuktikan order book bertingkat atau real-time. |
| Jumlah saham dan nonreguler | https://www.idx.co.id/id/data-pasar/ringkasan-perdagangan/ringkasan-saham | Pilihan kolom | Listed Shares<br>Tradeble Shares<br>Weight For Index<br>Non Regular Volume<br>Non Regular Value<br>Non Regular Frequency | Belum diketahui | Belum diketahui | Kolom tabel | Halaman tanpa login | Potensial setelah definisi field diperiksa | Tradeble Shares belum terbukti sama dengan free float. |
| Daftar Saham | https://www.idx.co.id/id/data-pasar/data-saham/daftar-saham/ | Tombol Unduh; URL belum diketahui | Kode<br>Nama Perusahaan<br>Tanggal Pencatatan<br>Saham<br>Papan Pencatatan | Snapshot terlihat; histori belum diketahui | Belum diketahui | HTML<br>Format unduh belum diketahui | Tanpa login | Layak bersyarat | Diamati total 962 baris; halaman termasuk pengujian situs. |
| Profil emiten dan sektor | https://www.idx.co.id/id/perusahaan-tercatat/profil-perusahaan-tercatat/BBCA | Tabel dan tab profil; API belum diketahui | Papan<br>Sektor<br>Subsektor<br>Industri<br>Subindustri<br>Usaha<br>Pemegang Saham<br>Anak Perusahaan | Tab Historikal terlihat; isi belum diuji | Belum diketahui | HTML | Tanpa login | Layak bersyarat | Sampel BBCA terbaca; halaman termasuk pengujian. |
| Keanggotaan indeks | https://www.idx.co.id/id/data-pasar/data-saham/indeks-saham/ | https://www.idx.co.id/StaticData/NewsAndAnnouncement/ANNOUNCEMENTSTOCK/Exchange/No.%20Peng-00148_BEI.POP_07-2026-ID.zip | Jenis indeks<br>Periode berlaku<br>Evaluasi | Beberapa periode LQ45 2026 terlihat | Per evaluasi; seluruh jadwal belum diketahui | HTML<br>ZIP | Daftar tanpa login | Potensial melalui dokumen | Isi ZIP dan kelengkapan konstituen belum diperiksa. |
| Ringkasan Broker | https://www.idx.co.id/id/data-pasar/ringkasan-perdagangan/ringkasan-broker/ | Tombol Unduh; URL belum diketahui | Kode Perusahaan<br>Nama Perusahaan<br>Volume<br>Nilai<br>Frekuensi | Pemilih tanggal terlihat; histori belum diuji | Tanggal awal 18 September 2026; delay belum diketahui | HTML | Tanpa login | Layak untuk agregat broker | Total 88 broker; pemisahan beli/jual per saham belum ditemukan. |
| Laporan keuangan dan tahunan | https://www.idx.co.id/id/perusahaan-tercatat/laporan-keuangan-dan-tahunan/ | https://www.idx.co.id/Portals/0/StaticData/ListedCompanies/Corporate_Actions/New_Info_JSX/Jenis_Informasi/01_Laporan_Keuangan/02_Soft_Copy_Laporan_Keuangan//Laporan%20Keuangan%20Tahun%202026/TW1/AADI/FinancialStatement-2026-I-AADI.pdf<br>https://www.idx.co.id/Portals/0/StaticData/ListedCompanies/Corporate_Actions/New_Info_JSX/Jenis_Informasi/01_Laporan_Keuangan/02_Soft_Copy_Laporan_Keuangan//Laporan%20Keuangan%20Tahun%202026/TW1/AADI/FinancialStatement-2026-I-AADI.xlsx<br>https://www.idx.co.id/Portals/0/StaticData/ListedCompanies/Corporate_Actions/New_Info_JSX/Jenis_Informasi/01_Laporan_Keuangan/02_Soft_Copy_Laporan_Keuangan//Laporan%20Keuangan%20Tahun%202026/TW1/AADI/instance.zip<br>https://www.idx.co.id/Portals/0/StaticData/ListedCompanies/Corporate_Actions/New_Info_JSX/Jenis_Informasi/01_Laporan_Keuangan/02_Soft_Copy_Laporan_Keuangan//Laporan%20Keuangan%20Tahun%202026/TW1/AADI/inlineXBRL.zip | Emiten<br>Tahun<br>Periode<br>Waktu publikasi<br>Lampiran | Filter 2022–2026 terlihat; sampel TW1 2026 | Triwulanan/tahunan menurut filter; delay belum diketahui | PDF<br>XLSX<br>ZIP XBRL | Daftar tanpa login | Potensial tinggi melalui data terstruktur | Tautan ditemukan; isi berkas belum diuji; halaman termasuk pengujian. |
| Revisi laporan | https://www.idx.co.id/id/perusahaan-tercatat/laporan-keuangan-dan-tahunan/ | ADMF_FS 31 Mar 2026 Revisi.pdf; URL tidak dicatat | Versi<br>Periode<br>Publikasi | Sampel TW1 2026 | Saat revisi; SLA belum diketahui | PDF<br>Lampiran | Daftar tanpa login | Perlu penyimpanan versi | Nama Revisi teramati; relasi penggantian dokumen belum terstruktur. |
| Dokumentasi XBRL | https://www.idx.co.id/id/perusahaan-tercatat/xbrl/ | Tautan menu; isi belum diperiksa | Taksonomi/schema belum diketahui | Belum diketahui | Belum diketahui | Belum diketahui | Belum diketahui | Perlu pemeriksaan lanjutan | Paket instance dan inline XBRL ditemukan di halaman laporan; dokumentasi belum dibaca. |
| Keterbukaan informasi | https://www.idx.co.id/id/perusahaan-tercatat/keterbukaan-informasi/ | PDF di StaticData/NewsAndAnnouncement/ANNOUNCEMENTSTOCK/From_EREP/; direktori ini bukan endpoint API terverifikasi | Waktu publikasi<br>Judul<br>Kode<br>Lampiran | Total terlihat 25.681; rentang awal belum diketahui | Per publikasi; delay belum diketahui | HTML<br>PDF | Daftar tanpa login | Potensial; perlu deduplikasi dan klasifikasi | Contoh dividen, perubahan pengurus, perubahan laporan; terlihat kode pengujian. |
| Aksi korporasi | https://www.idx.co.id/id/perusahaan-tercatat/aksi-korporasi/ | Tabel; API belum diketahui | Tanggal<br>Kode Emiten<br>Tipe Aksi Korporasi<br>Jumlah Aksi Korporasi<br>Jumlah Total | Total 1.815 baris; rentang belum diketahui | Per peristiwa; delay belum diketahui | HTML | Tanpa login | Potensial | DUMMY dan rangkaian aksi uji terlihat; jangan dipakai sebagai data produksi. |
| Dividen, kalender, public expose | https://www.idx.co.id/id/perusahaan-tercatat/kalender-perusahaan-tercatat/<br>https://www.idx.co.id/id/investor/public-expose-live/ | Tautan resmi; tab Dividen/Sejarah Dividen di profil; judul PDF dividen di keterbukaan | Field jadwal rinci belum diketahui | Belum diketahui | Belum diketahui | Belum diketahui untuk kalender/public expose | Belum diketahui | Belum cukup diverifikasi | Keberadaan sumber terverifikasi; cum/ex/payment dan materi belum diperiksa. |
| UMA | https://www.idx.co.id/id/berita/unusual-market-activity-uma/ | https://www.idx.co.id/Portals/0/StaticData/NewsAndAnnouncement/UMA/2026/SEP/20260917-UMA_ASPI.pdf | Tanggal<br>Emiten/judul<br>Berkas | Total 1.179 baris; tanggal awal belum diketahui | Per pengumuman; delay belum diketahui | HTML<br>PDF | Daftar tanpa login | Potensial | Sampel 17 September 2026 terlihat. |
| Suspensi dan pembukaan kembali | https://www.idx.co.id/id/berita/suspensi/ | PDF pengumuman dan lampiran; URL sampel tidak disertakan dalam ringkasan ini | Tanggal<br>Emiten<br>Jenis pengumuman | Total 1.874 baris; rentang belum diketahui | Per pengumuman; delay belum diketahui | HTML<br>PDF | Daftar tanpa login | Potensial; tanggal efektif harus dibaca dari dokumen | Unsuspend GRPH/LIFE terlihat; halaman juga memuat data pengujian. |
| Notasi khusus | https://www.idx.co.id/id/perusahaan-tercatat/notasi-khusus/ | Tombol Unduh; URL belum diketahui | Kode<br>Nama<br>Notasi<br>Alasan<br>Periode laporan terkait | Snapshot 17 September 2026 pukul 15.00 WIB | Jadwal pembaruan belum diketahui | HTML<br>Format unduh belum diketahui | Tanpa login | Layak bersyarat | Total 182 baris; histori perubahan belum ditemukan. |
| Papan pemantauan khusus | https://www.idx.co.id/id/perusahaan-tercatat/daftar-efek-pemantauan-khusus/ | Tombol Unduh; URL belum diketahui | Kode<br>Nama<br>Tanggal masuk<br>Kriteria | Tanggal masuk sejak 2021 terlihat; histori keluar belum diketahui | Belum diketahui | HTML<br>Format unduh belum diketahui | Tanpa login | Layak bersyarat | Total 160 baris; halaman termasuk pengujian. |
| Kepemilikan saham | https://www.idx.co.id/id/perusahaan-tercatat/data-kepemilikan-saham/ | https://www.idx.co.id/Media/3apgffaj/peng-2026-09-17-00076-lima-persen.xlsx | Judul kategori<br>Tanggal<br>Kolom XLSX belum dibaca | 97 entri pada tampilan 2026 | Beberapa hari bursa berturut-turut terlihat; SLA belum diketahui | XLSX | Daftar tanpa login | Potensial tinggi setelah schema diperiksa | BEI menyebut sumber KSEI; kategori >1% dan klasifikasi investor disebut, belum diuji. |
| Free float | https://www.idx.co.id/id/perusahaan-tercatat/free-float-perusahaan-tercatat/ | https://www.idx.co.id/Media/mgyfsyyg/pengumuman-free-float-31-juli-2026.xlsx<br>https://www.idx.co.id/Media/lw3jogdl/pengumuman-free-float-30-juni-2026-1.xlsx<br>https://www.idx.co.id/Media/1afp1nur/02-pengumuman-free-float-maret-2026_rev.xlsx | Free float/jumlah pemegang saham menurut judul<br>Schema belum diketahui | Tiga entri 2026 terlihat | Berdasarkan laporan registrasi bulanan; publikasi belum terbukti lengkap bulanan | XLSX | Daftar tanpa login | Potensial tinggi | Berkas Maret bernama _rev; perlu versioning. |
| Indeks syariah | https://www.idx.co.id/id/idx-syariah/indeks-saham-syariah/ | Tautan daftar konstituen indeks | ISSI<br>JII<br>JII70<br>Indeks syariah lain<br>Acuan DES OJK | Belum diketahui | Dokumentasi menyebut review Mei/November untuk beberapa indeks | HTML<br>Berkas daftar belum diuji | Dokumentasi tanpa login | Potensial melalui daftar bertanggal efektif | Seluruh indeks syariah tidak boleh disamakan dengan cakupan DES. |
| ESG Sustainalytics | https://sustainability.idx.co.id/sustainalytics | Tabel<br>Profil per emiten<br>Tombol Download; format belum diketahui | Kode<br>Nama<br>ESG Score | Snapshot; histori belum diketahui | Belum diketahui | HTML | Tabel tanpa login | Bersyarat, termasuk hak data pihak ketiga | Total 121 perusahaan; cakupan bergantung riset Sustainalytics. |
| Market data EOD | https://www.idx.co.id/id/produk/layanan-data-bei/ | https://www.idx.co.id/media/8422/idx-equity-eod.zip<br>https://www.idx.co.id/media/9651/idx-equity-eod-basic.zip<br>https://www.idx.co.id/media/9655/idx-equity-eod-professional.zip | Paket EOD<br>Indeks<br>Bobot<br>Rekapitulasi | Retensi/backfill belum diketahui | EOD menurut dokumentasi | ZIP sampel<br>Schema feed belum diketahui | Berlangganan/lisensi | Jalur resmi system-to-system | Dokumentasi terbaca; feed dan isi ZIP belum diuji. |
| Real-time, depth, trade feed | https://www.idx.co.id/id/produk/layanan-data-bei/ | https://www.idx.co.id/media/10124/itch-total-view-message.zip<br>https://www.idx.co.id/media/10125/itch-basic-message.zip<br>https://www.idx.co.id/media/10123/itch-lastsale-message.zip | Order<br>5 Level Market Depth<br>Summary<br>Stock Price<br>ITCH | Belum diketahui | Real-time/delayed menurut paket; angka delay belum diketahui | ZIP sampel<br>Protokol rinci belum diperiksa | Lisensi/langganan; langsung atau redistributor | Relevan untuk intraday | Bukan bukti feed gratis; kelengkapan event perlu verifikasi schema. |
| Data Reference | https://www.idx.co.id/id/produk/layanan-data-bei/ | https://www.idx.co.id/media/3kynnbhi/20250206_idx-data-reference-sample_e0x3.txt | Laporan keuangan<br>Aksi korporasi<br>Keterbukaan menurut dokumentasi | Belum diketahui | Belum diketahui | Tautan TXT<br>Schema belum diketahui | Enterprise subscription | Relevan untuk backend otomatis | Pembukaan sampel diblokir browser; tidak dicoba dilewati. |
| Statistik/publikasi | https://www.idx.co.id/id/data-pasar/laporan-statistik/statistik/<br>https://www.idx.co.id/id/data-pasar/laporan-statistik/digital-statistic/ | Tautan menu; isi belum diperiksa | Perdagangan<br>Rasio keuangan<br>Indeks<br>Pencatatan menurut dokumentasi layanan | Belum diketahui | Publikasi rutin; jadwal belum diketahui | Belum diketahui | Belum diketahui | Belum dinilai penuh | Keberadaan sumber terverifikasi. |

### Biaya dan penggunaan

- [Catalogue & Pricelist Non-AB 2026](https://www.idx.co.id/media/rzfl4wzy/20260513_idx-data-services-catalogue-pricelist-non-ab-2026.pdf)
- [Data License Agreement 2026](https://www.idx.co.id/media/xu0bddem/idx-data-license-agreement-2026.docx)
- [General Terms of Use](https://www.idx.co.id/media/vaupc3md/20240215_final-general-term-of-use-version-0-3-2024-efektif-1-january-2024-2.pdf)

Nominal biaya dan klausul rinci belum berhasil dibaca. Tidak ada estimasi harga dalam laporan ini.

- Display dan Non-Display dibedakan.
- Non-Display tidak otomatis mencakup redistribusi.
- Koneksi langsung memerlukan leased line melalui NSP, bandwidth minimum 8,5 Mbps menurut halaman.
- Jalur redistributor tersedia.

Hak penayangan ulang proyek belum dipastikan. [Sumber dokumentasi layanan](https://www.idx.co.id/id/produk/layanan-data-bei/)

## D. Pemetaan fitur

Didukung berarti bahan data ditemukan; backend pengambilan otomatis dan hak penggunaan belum terverifikasi.

| No. | Fitur | Status | Implikasi |
| --- | --- | --- | --- |
| 1 | Watchlist dan simpan filter | didukung | Fitur aplikasi sendiri; daftar kode saham menjadi referensi. |
| 2 | Pencarian/profil saham | didukung | Master saham, klasifikasi, papan, dan profil tersedia. |
| 3 | Dashboard dan heatmap | didukung harian | Harga/perubahan/likuiditas tersedia; intraday memerlukan feed sesuai kebutuhan. |
| 4 | Grafik dan indikator | sebagian | Histori harian terbukti; kedalaman histori, penyesuaian corporate action, dan kelengkapan OHLC perlu diuji. |
| 5 | Screener teknikal | sebagian | Bahan harian tersedia; MA/RSI/breakout memerlukan seri historis lengkap. |
| 6 | Screener fundamental | sebagian | PDF/XLSX/XBRL ditemukan; normalisasi akun, unit, konsolidasi, dan revisi belum dibangun. |
| 7 | Preset strategi dengan alasan lolos | didukung aturan sederhana | Bisa memakai harga, nilai, volume, frekuensi; preset kompleks mengikuti kesiapan histori/fundamental. |
| 8 | Alert | sebagian | Alert setelah publikasi memungkinkan; ketepatan waktu dan alert intraday bergantung feed. |
| 9 | Kalender peristiwa | sebagian | Sumber ditemukan; tanggal efektif dan jadwal dividen rinci belum diuji. |
| 10 | Skor kualitas, valuasi, momentum, likuiditas | sebagian | Likuiditas paling dekat siap; komponen lain memerlukan seri dan fundamental bersih. |
| 11 | Berita/sentimen | sebagian | Keterbukaan dan berita BEI tersedia; liputan media luas memerlukan sumber tambahan. |
| 12 | Broker, foreign flow, kepemilikan | sebagian | Agregat broker, kolom asing, dan XLSX kepemilikan ditemukan; broker per saham belum ditemukan. |
| 13 | Skenario entry dan risiko | sebagian | Analisis harga harian memungkinkan; spread/slippage dan likuiditas intraday belum cukup. |
| 14 | Backtest dan simulasi | sebagian | Perlu histori adjusted, emiten delisting, status historis, biaya transaksi, dan data sesuai waktu publikasi. |
| 15 | Estimasi rata-rata beli broker | data belum ditemukan | Memerlukan nilai beli dibagi volume beli per broker, per saham, per periode; agregat broker tidak cukup dan tidak menunjukkan harga modal nasabah. |
| 16 | Running trade | layanan khusus berlisensi | ITCH Last Sale kandidat terdokumentasi; schema tick belum diuji. |
| 17 | Order flow | layanan khusus berlisensi | Order/Total View kandidat; 5-level snapshot belum tentu cukup untuk seluruh event order. |
| 18 | Model prediksi | sebagian | Akurasi belum terbukti; perlu audit dataset, out-of-sample, dan biaya eksekusi. |

## E. Rekomendasi fitur dan pengoptimalan

| Usulan | Logika dan input | Pembaruan disarankan | Kesulitan dan keterbatasan |
| --- | --- | --- | --- |
| Status kualitas data | Simpan tanggal diminta, tanggal data, waktu publikasi, waktu diambil, jumlah baris, status validasi. | Setiap pengambilan | Sedang; menangani tanggal salah dan data pengujian. |
| Alasan lolos yang dapat ditelusuri | Tampilkan nilai aktual, ambang aturan, periode, sumber. | Setelah batch tervalidasi | Rendah–sedang; lebih mudah diaudit daripada skor tunggal. |
| Alert revisi laporan | Bandingkan versi/berkas untuk emiten dan periode sama. | Saat dokumen baru terdeteksi | Sedang–tinggi; revisi bisa mengganti URL atau memakai URL sama. |
| Pusat perubahan status emiten | Gabungkan UMA, suspensi/unsuspend, notasi, pemantauan khusus beserta alasan/tanggal efektif. | Setelah pengumuman tervalidasi | Sedang; tanggal publikasi dapat berbeda dari tanggal berlaku. |
| Likuiditas yang lebih informatif | Nilai transaksi, frekuensi, proporsi hari tanpa transaksi, median beberapa hari. | Setelah data harian lengkap | Sedang; jangan mengganti data kosong menjadi nol otomatis. |
| Riwayat free float dan kepemilikan | Bandingkan XLSX antarperiode dan tampilkan perubahan beserta sumber. | Setiap publikasi baru | Sedang; kategori dan perubahan struktur saham harus konsisten. |
| Konstituen indeks menurut tanggal | Simpan periode efektif masuk/keluar indeks. | Setiap evaluasi resmi | Sedang; menghindari penggunaan konstituen saat ini untuk masa lalu. |
| Umur fundamental dan cakupan ESG | Tampilkan periode laporan, publikasi, revisi, ketersediaan rating. | Saat laporan/rating berubah | Rendah–sedang; rating tidak tersedia tetap kosong, bukan nol. |

### Arsitektur otomatis

1. Pengambil data terjadwal di server dari layanan resmi atau sumber yang penggunaannya telah dipastikan.
2. Simpan data mentah dan versi, URL sumber, waktu publikasi.
3. Validasi tanggal, schema, jumlah baris, duplikasi, kelengkapan sebelum data diterbitkan.
4. Hitung indikator dan screening setelah batch valid.
5. Antrean notifikasi dengan deduplikasi agar pengambilan ulang tidak mengirim alert berulang.

**Prioritas MVP:** Pencarian/profil, Watchlist, Screener harian, Likuiditas, Perubahan status emiten.

Running trade/order flow setelah paket feed, schema, dan hak Display/Non-Display jelas.

## F. Hambatan dan langkah berikutnya

### Hambatan

- Extension tidak menyediakan inspeksi Network.
- Sampel Data Reference TXT diblokir browser.
- Katalog PDF ditemukan dan sempat diperoleh; isi harga belum berhasil diekstrak.
- Kendali browser gagal karena kebijakan header extension tidak dapat dimuat, termasuk setelah dicoba ulang.
- Syarat Penggunaan, kalender/public expose, dokumentasi XBRL, statistik belum selesai diperiksa.
- Sebagian situs menampilkan data pengujian.

### Langkah berikutnya

1. Lengkapi satu request DevTools saat memilih 2026-08-28: metode, URL/query atau body, Content-Type, cuplikan tanggal data, total baris. Hapus Cookie, Authorization, token, API key, header sesi.
2. Uji tanggal kedua dengan struktur request sama; cocokkan tanggal serta AADI/AALI. Uji rentang hanya berdasarkan dukungan yang ditemukan.
3. Ulangi pemeriksaan halaman terdampak setelah pengujian BEI berakhir; rekonsiliasi 963 Ringkasan Saham versus 962 Daftar Saham.
4. Periksa satu XLSX/XBRL dan satu paket EOD untuk membuktikan schema, satuan, pemrosesan otomatis.
5. Cocokkan lisensi dengan penyimpanan histori, indikator, penayangan, data turunan, redistribusi, model prediksi.

Fondasi screener harian tersedia. Kontrak API tanggal, kelengkapan histori, dan hak penggunaan komersial belum selesai diverifikasi.
