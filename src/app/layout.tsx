import type { Metadata } from "next";
import { Fraunces, Instrument_Sans, JetBrains_Mono } from "next/font/google";

import { DemoBadge } from "@/components/DemoBadge";
import { isDataModeVisible } from "@/server/data-mode";

import "./globals.css";

const display = Fraunces({ subsets: ["latin"], variable: "--font-display", axes: ["opsz", "SOFT"], display: "swap" });
const sans = Instrument_Sans({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Screener Saham ID",
  description: "Screener saham Bursa Efek Indonesia: peta pasar, grafik, indikator, dan alasan lolos filter yang transparan.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={`${display.variable} ${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        {/* Terapkan ukuran teks pilihan sebelum halaman tampil (tanpa kedip). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var s={besar:"112.5%",sangat:"125%"}[localStorage.getItem("ukuran-teks")];if(s)document.documentElement.style.fontSize=s}catch(e){}`,
          }}
        />
      </head>
      <body className="flex min-h-screen flex-col">
        <a href="#main-content" className="skip-link">
          Langsung ke konten utama
        </a>
        {isDataModeVisible("demo") && <DemoBadge />}

        {children}
      </body>
    </html>
  );
}
