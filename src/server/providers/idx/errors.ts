/**
 * Error typed untuk adapter IDX. Dibedakan secara eksplisit karena masing-masing
 * butuh penanganan berbeda oleh job ingest (retry vs berhenti vs catat sebagai
 * data_quality_issue) — lihat AGENTS.md §5, §6, §11.
 */

/** HTTP non-200, ATAU 200 tapi content-type bukan JSON (mis. halaman Cloudflare). */
export class IdxBlockedError extends Error {
  constructor(
    public readonly httpStatus: number,
    public readonly contentType: string | null,
    message = `Akses ditolak provider IDX (HTTP ${httpStatus}, content-type: ${contentType ?? "unknown"}). ` +
      `Kemungkinan proteksi Cloudflare atau pembatasan akses. TIDAK melakukan bypass — lihat AGENTS.md §5/§11.`,
  ) {
    super(message);
    this.name = "IdxBlockedError";
  }
}

/** Timeout atau kegagalan jaringan transien (layak retry terbatas). */
export class IdxTransientError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "IdxTransientError";
  }
}

/** Respons 200 dengan JSON tapi bentuknya tidak sesuai schema yang diketahui. */
export class IdxSchemaError extends Error {
  constructor(message: string, public readonly issues: unknown) {
    super(message);
    this.name = "IdxSchemaError";
  }
}
