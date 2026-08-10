"use client";

import { useActionState } from "react";
import { addThemeStock } from "./actions";

type ThemeChoice = { id: number; name: string };
type StockChoice = { id: number; market: string; ticker: string; name: string };

/**
 * テーマ所属の登録フォーム。
 * テーマか銘柄が0件のときはフォームを出さない。選択肢が空の <select> を出すと、
 * 送信しても外部キー違反になり、制約違反の日本語化を通らず 500 になる（設計書 §4.3）
 */
export function ThemeStockForm({
  themes,
  stocks,
}: {
  themes: ThemeChoice[];
  stocks: StockChoice[];
}) {
  const [error, formAction, pending] = useActionState(addThemeStock, null);

  if (themes.length === 0 || stocks.length === 0) {
    return (
      <p className="text-muted">
        先にテーマと銘柄をどちらも登録すると選べるようになる。
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        テーマ
        <select name="themeId" className="rounded border border-border p-2">
          {themes.map((theme) => (
            <option key={theme.id} value={theme.id}>
              {theme.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        銘柄
        <select name="stockId" className="rounded border border-border p-2">
          {stocks.map((stock) => (
            <option key={stock.id} value={stock.id}>
              {stock.market} {stock.ticker} {stock.name}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded border border-border p-2 disabled:opacity-50"
      >
        {pending ? "送信中" : "テーマ所属を登録"}
      </button>
      <p className="text-error empty:hidden" aria-live="polite">
        {error}
      </p>
    </form>
  );
}
