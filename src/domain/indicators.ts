// Indikator teknikal murni. Hanya memakai data yang tersedia sampai indeks saat itu
// (tidak ada look-ahead). Semua fungsi menerima array harian terurut tanggal naik.

export interface IndicatorPoint {
  value: number | null;
}

/** Simple Moving Average. null selama history < period. */
export function sma(closes: readonly number[], period: number): (number | null)[] {
  if (period <= 0) throw new Error("period harus > 0");
  const result: (number | null)[] = new Array(closes.length).fill(null);
  let sum = 0;
  for (let i = 0; i < closes.length; i++) {
    sum += closes[i]!;
    if (i >= period) sum -= closes[i - period]!;
    if (i >= period - 1) result[i] = sum / period;
  }
  return result;
}

/**
 * Exponential Moving Average. Seed menggunakan SMA dari `period` titik pertama
 * (konvensi umum), lalu smoothing standar 2/(period+1). null sebelum seed tersedia.
 */
export function ema(closes: readonly number[], period: number): (number | null)[] {
  if (period <= 0) throw new Error("period harus > 0");
  const result: (number | null)[] = new Array(closes.length).fill(null);
  const k = 2 / (period + 1);
  let seed: number | null = null;
  for (let i = 0; i < closes.length; i++) {
    if (i === period - 1) {
      let sum = 0;
      for (let j = 0; j <= i; j++) sum += closes[j]!;
      seed = sum / period;
      result[i] = seed;
    } else if (i >= period) {
      const prev = result[i - 1]!;
      result[i] = closes[i]! * k + prev * (1 - k);
    }
  }
  return result;
}

/**
 * RSI Wilder smoothing standar. Seed average gain/loss dari `period` perubahan
 * pertama, lalu smoothing rekursif. null sebelum seed tersedia.
 */
export function rsi(closes: readonly number[], period = 14): (number | null)[] {
  if (period <= 0) throw new Error("period harus > 0");
  const result: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length <= period) return result;

  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const change = closes[i]! - closes[i - 1]!;
    if (change > 0) avgGain += change;
    else avgLoss += -change;
  }
  avgGain /= period;
  avgLoss /= period;

  const computeRsi = (gain: number, loss: number): number => {
    if (loss === 0 && gain === 0) return 50; // harga datar berturut-turut, edge case netral
    if (loss === 0) return 100;
    const rs = gain / loss;
    return 100 - 100 / (1 + rs);
  };

  result[period] = computeRsi(avgGain, avgLoss);

  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i]! - closes[i - 1]!;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    result[i] = computeRsi(avgGain, avgLoss);
  }

  return result;
}

export interface MacdResult {
  macd: (number | null)[];
  signal: (number | null)[];
  histogram: (number | null)[];
}

/** MACD standar 12/26/9 (parameter dapat diubah). */
export function macd(
  closes: readonly number[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9,
): MacdResult {
  const fastEma = ema(closes, fastPeriod);
  const slowEma = ema(closes, slowPeriod);

  const macdLine: (number | null)[] = closes.map((_, i) => {
    const f = fastEma[i] ?? null;
    const s = slowEma[i] ?? null;
    return f !== null && s !== null ? f - s : null;
  });

  // Signal = EMA dari macdLine, tapi hanya dihitung dari titik pertama macdLine valid.
  const firstValid = macdLine.findIndex((v) => v !== null);
  const signal: (number | null)[] = new Array(closes.length).fill(null);
  if (firstValid !== -1) {
    const validSlice = macdLine.slice(firstValid).map((v) => v as number);
    const signalOnValid = ema(validSlice, signalPeriod);
    for (let i = 0; i < signalOnValid.length; i++) {
      signal[firstValid + i] = signalOnValid[i] ?? null;
    }
  }

  const histogram: (number | null)[] = closes.map((_, i) => {
    const m = macdLine[i] ?? null;
    const s = signal[i] ?? null;
    return m !== null && s !== null ? m - s : null;
  });

  return { macd: macdLine, signal, histogram };
}

/**
 * Volume relatif terhadap rata-rata volume `lookback` sesi sebelumnya (tidak
 * termasuk sesi berjalan). Mengembalikan null bila history tidak cukup atau
 * sesi berjalan (candle belum final) — pemanggil bertanggung jawab menandai
 * sesi belum final secara eksplisit di UI, fungsi ini hanya kalkulasi murni.
 */
export function relativeVolume(
  volumes: readonly number[],
  index: number,
  lookback = 20,
): number | null {
  if (index < lookback) return null;
  let sum = 0;
  for (let i = index - lookback; i < index; i++) sum += volumes[i]!;
  const avg = sum / lookback;
  if (avg === 0) return null;
  return volumes[index]! / avg;
}
