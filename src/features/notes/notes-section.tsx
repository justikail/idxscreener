"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { formatDateTimeWib } from "@/lib/format";

import { addNote, deleteNote } from "./actions";

interface Note {
  id: number;
  body: string;
  createdAt: Date;
}

const MAX = 2000;

/** Catatan pribadi: hanya terlihat oleh pemiliknya. */
export function NotesSection({ instrumentCode, notes }: { instrumentCode: string; notes: Note[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [value, setValue] = useState("");
  const [confirmId, setConfirmId] = useState<number | null>(null);

  return (
    <div className="rounded-md border border-ink-200 bg-card p-4 sm:p-5">
      <h3 className="text-lg font-semibold">Catatan pribadi</h3>
      <p className="mt-1 text-sm text-ink-600">Alasan membeli, rencana, atau hal yang ingin dipantau. Hanya Anda yang bisa melihatnya.</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const body = value.trim();
          if (!body) return;
          startTransition(async () => {
            await addNote(instrumentCode, body);
            setValue("");
            router.refresh();
          });
        }}
        className="mt-4 flex flex-col gap-2"
      >
        <label className="sr-only" htmlFor={`note-${instrumentCode}`}>
          Catatan baru untuk {instrumentCode}
        </label>
        <textarea
          id={`note-${instrumentCode}`}
          value={value}
          maxLength={MAX}
          onChange={(e) => setValue(e.target.value)}
          rows={3}
          placeholder={`Mis. "Pantau laporan Q3 ${instrumentCode}, cek apakah laba tetap tumbuh."`}
          className="w-full rounded-md border border-ink-300 bg-paper px-3 py-2.5 text-[1.0625rem] leading-relaxed placeholder:text-ink-400 focus:border-ink-900"
        />
        <div className="flex items-center justify-between gap-3">
          <span className="num text-xs text-ink-500">
            {value.length}/{MAX}
          </span>
          <button
            type="submit"
            disabled={isPending || value.trim().length === 0}
            className="rounded-full bg-ink-900 px-5 py-2 text-sm font-semibold text-paper hover:bg-ink-700 disabled:opacity-40"
          >
            {isPending ? "Menyimpan…" : "Simpan catatan"}
          </button>
        </div>
      </form>

      <ul className="mt-4 flex flex-col gap-2">
        {notes.map((note) => (
          <li key={note.id} className="rounded-md border-l-4 border-kunyit-400 bg-paper px-4 py-3">
            <p className="whitespace-pre-wrap text-[1.0625rem] leading-relaxed text-ink-900">{note.body}</p>
            <div className="mt-2 flex items-center justify-between gap-3 text-xs text-ink-500">
              <span>{formatDateTimeWib(note.createdAt)}</span>
              {confirmId === note.id ? (
                <span className="flex items-center gap-2">
                  <span>Hapus catatan ini?</span>
                  <button
                    type="button"
                    onClick={() =>
                      startTransition(async () => {
                        await deleteNote(note.id);
                        setConfirmId(null);
                        router.refresh();
                      })
                    }
                    className="rounded-full bg-down-600 px-3 py-1 font-semibold text-paper"
                  >
                    Ya, hapus
                  </button>
                  <button type="button" onClick={() => setConfirmId(null)} className="rounded-full px-3 py-1 hover:bg-ink-100">
                    Batal
                  </button>
                </span>
              ) : (
                <button type="button" onClick={() => setConfirmId(note.id)} className="rounded-full px-3 py-1 text-down-700 hover:bg-down-50">
                  Hapus
                </button>
              )}
            </div>
          </li>
        ))}
        {notes.length === 0 && <li className="text-sm text-ink-500">Belum ada catatan untuk saham ini.</li>}
      </ul>
    </div>
  );
}
