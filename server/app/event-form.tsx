"use client";

import { useActionState } from "react";
import { addEvent } from "./actions";

type Theme = { id: number; name: string };
type Stock = { id: number; market: string; ticker: string; name: string };

/** 市場イベントの対象（全体設計書 §5）。GLOBAL は全員に出る */
const MARKETS = ["JP", "US", "GLOBAL"];

/** 重要度（★1〜3。全体設計書 §4.1） */
const IMPORTANCES = [1, 2, 3];

const field = "rounded border border-border p-2";

/**
 * イベントの登録フォーム。
 *
 * 対象は1つの <select> にまとめる。<select> は1つしか選べないため、
 * event の3列が「ちょうど1つだけ非NULL」であることが画面の側で保たれる（設計書 §4）。
 * 値は "market:JP" のような形にし、app/actions.ts で3列に振り分ける
 */
export function EventForm({
  themes,
  stocks,
}: {
  themes: Theme[];
  stocks: Stock[];
}) {
  const [error, formAction, pending] = useActionState(addEvent, null);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        名称
        <input type="text" name="title" required className={field} />
      </label>
      <label className="flex flex-col gap-1">
        短縮ラベル（カレンダーのセルに出す。全角5文字まで）
        {/* maxLength は半角と全角を区別しないため目安にすぎない。
            全角換算の判定は src/db/register.ts が持つ（設計書 §7） */}
        <input
          type="text"
          name="shortLabel"
          required
          maxLength={10}
          className={field}
        />
      </label>
      <label className="flex flex-col gap-1">
        対象
        <select name="target" required defaultValue="" className={field}>
          <option value="" disabled>
            選んでください
          </option>
          <optgroup label="市場">
            {MARKETS.map((market) => (
              <option key={market} value={`market:${market}`}>
                {market}
              </option>
            ))}
          </optgroup>
          <optgroup label="テーマ">
            {themes.map((theme) => (
              <option key={theme.id} value={`theme:${theme.id}`}>
                {theme.name}
              </option>
            ))}
          </optgroup>
          <optgroup label="銘柄">
            {stocks.map((stock) => (
              <option key={stock.id} value={`stock:${stock.id}`}>
                {stock.market} {stock.ticker} {stock.name}
              </option>
            ))}
          </optgroup>
        </select>
      </label>
      <label className="flex flex-col gap-1">
        開始日
        <input type="date" name="startDate" required className={field} />
      </label>
      <label className="flex flex-col gap-1">
        終了日（空のままなら単日）
        <input type="date" name="endDate" className={field} />
      </label>
      <label className="flex flex-col gap-1">
        時刻（JST。空にできる）
        <input type="time" name="time" className={field} />
      </label>
      <label className="flex flex-col gap-1">
        重要度
        <select name="importance" defaultValue="2" className={field}>
          {IMPORTANCES.map((importance) => (
            <option key={importance} value={importance}>
              {importance}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        補足
        <textarea name="note" rows={2} className={field} />
      </label>
      <label className="flex flex-col gap-1">
        出典URL（この日付をどこで確認したか）
        <input type="url" name="sourceUrl" className={field} />
      </label>
      <p className="text-muted text-sm">
        日付・時刻はすべてJSTで入れる。日単位で確定した日付だけを登録する
      </p>
      <button
        type="submit"
        disabled={pending}
        className="rounded border border-border p-2 disabled:opacity-50"
      >
        {pending ? "送信中" : "イベントを登録"}
      </button>
      <p className="text-error empty:hidden" aria-live="polite">
        {error}
      </p>
    </form>
  );
}
