"use client";

import { useActionState } from "react";
import { addHolding } from "./actions";

type Choice = { id: number; market: string; ticker: string; name: string };

/**
 * 保有の登録フォーム。
 * user_id はセッションから取るため入力欄を出さない（設計書 §3）
 */
export function HoldingForm({ choices }: { choices: Choice[] }) {
  const [error, formAction, pending] = useActionState(addHolding, null);

  if (choices.length === 0) {
    return <p className="text-muted">先に銘柄を登録すると選べるようになる。</p>;
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        銘柄
        <select name="stockId" className="rounded border border-border p-2">
          {choices.map((choice) => (
            <option key={choice.id} value={choice.id}>
              {choice.market} {choice.ticker} {choice.name}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded border border-border p-2 disabled:opacity-50"
      >
        {pending ? "送信中" : "保有を登録"}
      </button>
      {error && <p className="text-error">{error}</p>}
    </form>
  );
}
