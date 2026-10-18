import { expect, test, type Page } from "@playwright/test";

// Alur utama terhadap data DEMO deterministik (server DATA_MODE=demo, lihat
// playwright.config.ts): dashboard -> cari -> detail + grafik -> screener
// (ganti preset, baca alasan per kondisi) -> pengumuman, desktop dan ponsel.

const banner = (page: Page) => page.getByRole("status").getByText("DATA DEMO").first();
const section = (page: Page, heading: RegExp) => page.locator("section").filter({ has: page.getByRole("heading", { name: heading }) });
// Baris hasil: <tr> di desktop, kartu <li> di ponsel — ambil yang terlihat.
const resultRow = (page: Page, heading: RegExp, code: string) =>
  section(page, heading)
    .locator("tr, li")
    .filter({ has: page.getByRole("link", { name: code, exact: true }) })
    .filter({ visible: true });

test.describe("label DATA DEMO tampil di semua halaman utama", () => {
  for (const path of ["/", "/screener", "/pengumuman", "/tentang", "/cari?q=DEMA", "/saham/DEMA"]) {
    test(`label demo terlihat di ${path}`, async ({ page }) => {
      await page.goto(path);
      await expect(banner(page)).toBeVisible();
    });
  }
});

test("dashboard: judul dari data, breadth, peta pasar, dan pernyataan cakupan", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^Pasar (ditutup|bergerak)/);
  await expect(page.getByRole("img", { name: /naik, \d+ tetap, \d+ turun/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Peta Pasar" })).toBeVisible();
  await expect(page.getByText(/saham yang diperdagangkan pada sesi terakhir/)).toBeVisible();
  await expect(page.getByRole("link", { name: /DEMA/ }).first()).toBeVisible();
});

test("dashboard desktop: tabel lengkap dengan satuan volume", async ({ page, isMobile }) => {
  test.skip(isMobile, "Di ponsel tabel diganti daftar ringkas");
  await page.goto("/");
  await expect(page.getByRole("columnheader", { name: "Volume (lembar)" })).toBeVisible();
});

test("pencarian menuju detail saham dan grafik candlestick termuat", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Cari kode atau nama saham").fill("DEMA");
  await page.getByRole("button", { name: "Cari" }).click();
  await expect(page).toHaveURL(/\/cari\?q=DEMA/);
  await page.getByRole("link", { name: /DEMA/ }).first().click();
  await expect(page).toHaveURL(/\/saham\/DEMA/);
  await expect(page.getByRole("heading", { level: 1, name: /DEMA/ })).toBeVisible();

  const chart = page.getByRole("img", { name: /Grafik harga DEMA/ });
  await expect(chart).toBeVisible();
  await expect(chart.locator("canvas").first()).toBeVisible(); // Lightweight Charts benar-benar merender
  await page.getByRole("button", { name: "1B" }).click();
  await expect(page.getByRole("button", { name: "1B" })).toHaveAttribute("aria-pressed", "true");
});

test("pencarian dengan hasil kosong menampilkan empty state, bukan error", async ({ page }) => {
  await page.goto("/cari?q=KODEYANGTIDAKADASAMASEKALI999");
  await expect(page.getByText(/Tidak ditemukan saham/)).toBeVisible();
});

test("kode saham tidak dikenal menghasilkan halaman 404 yang dirancang", async ({ page }) => {
  const response = await page.goto("/saham/TIDAKADA");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: /tidak ada/ })).toBeVisible();
});

test.describe("screener: ganti preset dan baca alasan per kondisi", () => {
  test("kandidat lolos deterministik VPAS: dua kondisi terpenuhi beserta nilai aktual", async ({ page }) => {
    await page.goto("/screener?preset=value_wajar");
    const row = resultRow(page, /^Lolos/, "VPAS");
    await expect(row).toBeVisible();
    await expect(row.locator("li[title*='nilai aktual']")).toHaveCount(2);
    await expect(row.locator("li[title$='— terpenuhi']")).toHaveCount(2);
  });

  test("kandidat gagal deterministik VFAI: kedua kondisi tidak terpenuhi", async ({ page }) => {
    await page.goto("/screener?preset=value_wajar");
    const row = resultRow(page, /^Tidak lolos/, "VFAI");
    await expect(row.locator("li[title$='tidak terpenuhi']")).toHaveCount(2);
  });

  test("ganti ke preset momentum mengubah hasil", async ({ page }) => {
    await page.goto("/screener?preset=value_wajar");
    await page.getByRole("link", { name: /Momentum Teknikal Menguat/ }).click();
    await expect(page).toHaveURL(/preset=momentum_naik/);
    await expect(resultRow(page, /^Lolos/, "MPAS")).toBeVisible();
  });

  test("toggle 'hanya data tersedia' mengubah query string dan tetap merender", async ({ page }) => {
    await page.goto("/screener?preset=value_wajar");
    await page.getByRole("link", { name: /Hanya tampilkan data tersedia/ }).click();
    await expect(page).toHaveURL(/hanya_tersedia=1/);
    await expect(page.getByRole("heading", { level: 1, name: "Screener" })).toBeVisible();
  });

  test("label sumber data ditampilkan di kepala screener", async ({ page }) => {
    await page.goto("/screener");
    await expect(page.locator("main").getByText("DATA DEMO").first()).toBeVisible();
  });
});

test("detail saham ekuitas negatif (BAJA): PBV tidak bermakna, bukan angka", async ({ page }) => {
  await page.goto("/saham/BAJA");
  const pbvValue = page.locator("dt", { hasText: "PBV" }).locator("xpath=following-sibling::dd[1]");
  await expect(pbvValue).toHaveText("Tidak bermakna (not meaningful)");
});

test("tentang kami: rumus, Pihak Ketiga, dan /metodologi dialihkan ke bagian perhitungan", async ({ page }) => {
  await page.goto("/metodologi");
  await expect(page).toHaveURL(/\/tentang#perhitungan$/);
  await expect(page.getByRole("heading", { name: "Cara kami menghitung" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Pihak Ketiga" })).toBeVisible();
});

test("istilah punya tooltip: hover di desktop, ketuk di ponsel, Esc menutup", async ({ page, isMobile }) => {
  await page.goto("/saham/DEMA");
  const term = page.getByRole("button", { name: "TTM", exact: true });
  if (isMobile) await term.tap();
  else await term.hover();
  const tip = page.getByRole("tooltip");
  await expect(tip).toContainText("Trailing Twelve Months");
  // Popover dijepit ke viewport.
  const box = (await tip.boundingBox())!;
  const vw = page.viewportSize()!.width;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(vw);
  if (isMobile) {
    await term.tap();
  } else {
    await term.click();
    await page.keyboard.press("Escape");
  }
  await expect(tip).toBeHidden();
});

test("tombol watchlist menunjukkan status dan bisa dibatalkan", async ({ page, isMobile }) => {
  // Satu project saja: dua project paralel memakai akun dan saham yang sama.
  test.skip(isMobile, "Dijalankan di project desktop");
  await page.goto("/masuk");
  await page.fill("input[name=email]", "usera@demo.local");
  await page.fill("input[name=password]", "usera12345");
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await expect(page).not.toHaveURL(/\/masuk/);

  await page.goto("/saham/DEMA");
  const toggle = page.getByRole("button", { name: /watchlist/i });
  if ((await toggle.getAttribute("aria-pressed")) === "true") {
    await toggle.click(); // bersihkan sisa run sebelumnya
    await expect(page.getByText("Dihapus dari watchlist.")).toBeVisible();
  }
  await expect(toggle).toContainText("Tambah ke watchlist");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Tersimpan di watchlist.")).toBeVisible();

  // Status bertahan setelah muat ulang dan tampil di halaman watchlist.
  await page.reload();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await page.goto("/watchlist");
  await expect(page.getByRole("link", { name: /DEMA/ })).toBeVisible();

  await page.goto("/saham/DEMA");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  // Status tombol berubah seketika; tunggu konfirmasi server sebelum memuat ulang.
  await expect(page.getByText("Dihapus dari watchlist.")).toBeVisible();
  await page.reload();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
});

test("panel admin: status pembaruan harian tampil untuk admin, ditolak untuk user biasa", async ({ page, isMobile }) => {
  test.skip(isMobile, "Dijalankan di project desktop");
  const login = async (email: string, password: string) => {
    await page.goto("/masuk");
    await page.fill("input[name=email]", email);
    await page.fill("input[name=password]", password);
    await page.getByRole("button", { name: "Masuk", exact: true }).click();
    await expect(page).not.toHaveURL(/\/masuk/);
  };
  await login("admin@demo.local", "admin12345");
  await page.goto("/admin/jobs");
  await expect(page.getByRole("heading", { name: "Pembaruan harian otomatis" })).toBeVisible();
  await expect(page.getByText(/^(Berjalan|Tidak berjalan)$/)).toBeVisible();
  // Tombol sengaja tidak ditekan: worker yang hidup akan memakai kuota penyedia sungguhan.
  await expect(page.getByRole("button", { name: "Jalankan pembaruan sekarang" })).toBeVisible();

  await page.context().clearCookies();
  await login("usera@demo.local", "usera12345");
  await page.goto("/admin/jobs");
  await expect(page).not.toHaveURL(/\/admin/);
});

test("halaman pengumuman dapat diakses dan menampilkan daftar", async ({ page }) => {
  await page.goto("/pengumuman");
  await expect(page.getByRole("heading", { name: /Pengumuman/ })).toBeVisible();
  await expect(page.locator("main li")).not.toHaveCount(0);
});

test.describe("tampilan mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  for (const path of ["/", "/screener", "/saham/DEMA", "/tentang"]) {
    test(`tanpa scroll horizontal di ${path}`, async ({ page }) => {
      await page.goto(path);
      await page.evaluate(() => document.fonts.ready);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBe(0);
    });
  }

  test("screener di ponsel: alasan per kondisi terlihat di dalam layar, tanpa geser", async ({ page }) => {
    await page.goto("/screener?preset=value_wajar");
    const chip = resultRow(page, /^Lolos/, "VPAS").locator("li[title*='nilai aktual']").first();
    await expect(chip).toBeVisible();
    const box = (await chip.boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  });

  test("navigasi utama di ponsel: tombol Menu membuka daftar vertikal", async ({ page }) => {
    await page.goto("/");
    // Menu tertutup: tidak ada deretan tautan navigasi yang terlihat.
    await expect(page.getByRole("navigation", { name: "Navigasi utama" })).toHaveCount(0);
    await page.getByRole("button", { name: "Menu" }).click();
    const nav = page.getByRole("navigation", { name: "Navigasi utama" });
    const links = nav.getByRole("link");
    await expect(links.first()).toBeVisible();
    // Vertikal: setiap tautan berada di bawah tautan sebelumnya.
    const ys = await links.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().top));
    expect(ys.every((y, i) => i === 0 || y > ys[i - 1]!)).toBe(true);
    await nav.getByRole("link", { name: "Screener" }).click();
    await expect(page).toHaveURL(/\/screener/);
    await expect(page.getByRole("navigation", { name: "Navigasi utama" })).toHaveCount(0); // tertutup setelah pindah halaman
  });
});
