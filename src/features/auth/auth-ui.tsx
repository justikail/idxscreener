"use client";

import { useId, useState } from "react";

/** Kolom kata sandi dengan tombol tampilkan/sembunyikan (mengurangi salah ketik). */
export function PasswordField({ label, name, minLength, autoComplete, hint }: { label: string; name: string; minLength?: number; autoComplete: string; hint?: string }) {
  const [show, setShow] = useState(false);
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="block text-[0.9375rem] font-medium text-ink-800">
        {label}
      </label>
      <div className="mt-1.5 flex rounded-md border border-ink-400 bg-paper focus-within:border-ink-900 focus-within:outline focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-kunyit-500">
        <input
          id={id}
          name={name}
          type={show ? "text" : "password"}
          required
          minLength={minLength}
          autoComplete={autoComplete}
          aria-describedby={hint ? `${id}-hint` : undefined}
          className="w-full bg-transparent px-3.5 py-3 text-[1.0625rem] outline-none"
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-pressed={show}
          className="shrink-0 px-3.5 text-sm font-medium text-ink-600 hover:text-ink-900"
        >
          {show ? "Sembunyikan" : "Tampilkan"}
        </button>
      </div>
      {hint && (
        <p id={`${id}-hint`} className="mt-1 text-sm text-ink-500">
          {hint}
        </p>
      )}
    </div>
  );
}
