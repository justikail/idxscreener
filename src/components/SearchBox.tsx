"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SearchBox() {
  const router = useRouter();
  const [value, setValue] = useState("");

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = value.trim();
        if (trimmed.length === 0) return;
        router.push(`/cari?q=${encodeURIComponent(trimmed)}`);
      }}
      className="flex w-full min-w-0 max-w-md items-stretch border-b-2 border-ink-900 focus-within:border-kunyit-500"
    >
      <label htmlFor="search-input" className="sr-only">
        Cari kode atau nama saham
      </label>
      <input
        id="search-input"
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Cari kode atau nama saham, contoh: BBCA"
        className="min-w-0 flex-1 bg-transparent px-1 py-2 text-sm placeholder:text-ink-400 focus:outline-none"
      />
      <button
        type="submit"
        className="font-mono text-[12px] font-semibold uppercase tracking-[0.16em] text-ink-900 transition-colors hover:text-kunyit-600"
      >
        Cari
      </button>
    </form>
  );
}
