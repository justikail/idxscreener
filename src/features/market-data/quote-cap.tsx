import { Term } from "@/components/Term";
import { formatCompact, formatDateTimeWib, formatNumber, formatTradingDate } from "@/lib/format";

type Quote = {
  lastPrice: string | null;
  sourceDate: string | null;
  dataTs: string | null;
  marketLabel: string | null;
  noTradeToday: boolean | null;
  isFallbackClose: boolean;
  quoteAgeMs: number | null;
  fetchedAt: Date;
};

type Cap = { snapshotDate: string; listedShares: string | null; marketCap: string | null; turnoverRatio: string | null; fetchedAt: Date };

/**
 * Baris keterangan di bawah strip harga: harga terakhir dari cache (bila saham
 * ini dijadwalkan) dan jumlah saham tercatat. Tidak pernah berlabel realtime.
 */
export function QuoteAndCap({ quote, cap }: { quote: Quote | null; cap: Cap | null }) {
  if (!(quote && quote.lastPrice !== null) && !cap?.listedShares) return null;
  const ageMin = quote?.quoteAgeMs != null ? Math.round(quote.quoteAgeMs / 60_000) : null;
  return (
    <ul className="mt-3 flex flex-col gap-1.5 text-sm text-ink-700 sm:flex-row sm:flex-wrap sm:gap-x-6">
      {quote && quote.lastPrice !== null && (
        <li className="flex items-center gap-2">
          <span aria-hidden className={`h-2 w-2 rounded-full ${quote.isFallbackClose ? "bg-ink-400" : "bg-kunyit-500"}`} />
          <span>
            <Term k="harga_terakhir">Harga terakhir sumber</Term>: <strong className="num">Rp{formatNumber(Number(quote.lastPrice))}</strong>{" "}
            <span className="text-ink-500">
              {quote.isFallbackClose
                ? `(penutupan ${quote.sourceDate ? formatTradingDate(quote.sourceDate, { weekday: false }) : "sesi sebelumnya"}, belum ada transaksi hari ini)`
                : `(transaksi ${quote.sourceDate ? formatTradingDate(quote.sourceDate, { weekday: false }) : ""}${quote.dataTs ? ` pukul ${quote.dataTs}` : ""}${
                    ageMin !== null ? `, ±${ageMin} menit sebelum diambil` : ""
                  })`}{" "}
              · diambil {formatDateTimeWib(quote.fetchedAt)}
            </span>
          </span>
        </li>
      )}
      {cap?.listedShares && (
        <li>
          Saham tercatat <strong className="num">{formatCompact(Number(cap.listedShares), 2)} lembar</strong>{" "}
          <span className="text-ink-500">per {formatTradingDate(cap.snapshotDate, { weekday: false })}</span>
        </li>
      )}
    </ul>
  );
}
