"use client";

import { useActionState } from "react";
import { addStock } from "./actions";

/** 決算月の選択肢（1〜12） */
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

/**
 * 銘柄の登録フォーム。
 * name は notNull だが空文字を弾く CHECK が無いため、required で塞ぐ（設計書 §3）
 */
export function StockForm() {
  const [error, formAction, pending] = useActionState(addStock, null);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        市場
        <select name="market" className="rounded border border-border p-2">
          <option value="JP">JP</option>
          <option value="US">US</option>
        </select>
      </label>
      <label className="flex flex-col gap-1">
        ティッカー
        <input
          type="text"
          name="ticker"
          required
          className="rounded border border-border p-2"
        />
      </label>
      <label className="flex flex-col gap-1">
        銘柄名
        <input
          type="text"
          name="name"
          required
          className="rounded border border-border p-2"
        />
      </label>
      <label className="flex flex-col gap-1">
        決算月（JP銘柄のみ。US銘柄は空のまま）
        <select name="fiscalMonth" className="rounded border border-border p-2">
          <option value="">なし</option>
          {MONTHS.map((month) => (
            <option key={month} value={month}>
              {month}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded border border-border p-2 disabled:opacity-50"
      >
        {pending ? "送信中" : "銘柄を登録"}
      </button>
      <p className="text-error empty:hidden" aria-live="polite">
        {error}
      </p>
    </form>
  );
}
