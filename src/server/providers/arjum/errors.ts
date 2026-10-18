/** 401/403 — key tidak valid, kedaluwarsa, atau tidak berhak. TIDAK di-retry. */
export class ArjumAuthError extends Error {
  constructor(public readonly httpStatus: number, public readonly detail: string | null) {
    super(`Arjum menolak autentikasi (HTTP ${httpStatus})${detail ? `: ${detail}` : ""}.`);
    this.name = "ArjumAuthError";
  }
}

/** Respons bukan JSON (mis. halaman HTML challenge/error proxy). TIDAK di-retry. */
export class ArjumNonJsonError extends Error {
  constructor(public readonly httpStatus: number, public readonly contentType: string | null) {
    super(`Arjum mengembalikan konten non-JSON (HTTP ${httpStatus}, ${contentType ?? "tanpa content-type"}).`);
    this.name = "ArjumNonJsonError";
  }
}

/** 429 atau kuota penyedia habis setelah retry terbatas. */
export class ArjumRateLimitError extends Error {
  constructor(public readonly retryAfterSeconds: number | null) {
    super(`Arjum membatasi laju/kuota (HTTP 429)${retryAfterSeconds !== null ? `, Retry-After ${retryAfterSeconds}s` : ""}.`);
    this.name = "ArjumRateLimitError";
  }
}

/** 5xx, timeout, atau kegagalan jaringan setelah retry terbatas. */
export class ArjumTransientError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "ArjumTransientError";
  }
}

/** 4xx lain (mis. 404 kode tidak dikenal, 422 parameter salah). TIDAK di-retry. */
export class ArjumClientError extends Error {
  constructor(public readonly httpStatus: number, public readonly detail: string | null) {
    super(`Arjum menolak request (HTTP ${httpStatus})${detail ? `: ${detail}` : ""}.`);
    this.name = "ArjumClientError";
  }
}

/** JSON valid tapi bentuknya tidak sesuai skema yang diharapkan. */
export class ArjumSchemaError extends Error {
  constructor(message: string, public readonly issues: unknown) {
    super(message);
    this.name = "ArjumSchemaError";
  }
}

export class ArjumMissingKeyError extends Error {
  constructor() {
    super("ARJUM_API_KEY belum diset di environment server (.env.local). Tidak ada request yang dikirim.");
    this.name = "ArjumMissingKeyError";
  }
}
