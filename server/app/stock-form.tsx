import type { StockInput } from "../src/db/write";
import { type Action, ActionForm, field, fieldLabel } from "./form";

/** 決算月の選択肢（1〜12） */
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

/** 編集のときの初期値。登録では渡さない（設計書 §3） */
type StockRow = StockInput & { id: number };

/**
 * 銘柄のフォーム。登録と編集の両方で使う（設計書 §3）。
 * stock を渡すと各欄に初期値が入り、更新先を表す隠しの id が付く。
 *
 * name は notNull だが空文字を弾く CHECK が無いため、required で塞ぐ。
 * required は "   " を通すため、空白だけの判定は src/db/write.ts が持つ（設計書 §5）
 */
export function StockForm({
  action,
  submitLabel,
  stock,
}: {
  action: Action;
  submitLabel: string;
  stock?: StockRow;
}) {
  return (
    <ActionForm action={action} submitLabel={submitLabel}>
      {stock && <input type="hidden" name="id" value={stock.id} />}
      <label className={fieldLabel}>
        市場
        <select name="market" defaultValue={stock?.market} className={field}>
          <option value="JP">JP</option>
          <option value="US">US</option>
        </select>
      </label>
      <label className={fieldLabel}>
        ティッカー
        <input
          type="text"
          name="ticker"
          required
          defaultValue={stock?.ticker}
          className={field}
        />
      </label>
      <label className={fieldLabel}>
        銘柄名
        <input
          type="text"
          name="name"
          required
          defaultValue={stock?.name}
          className={field}
        />
      </label>
      <label className={fieldLabel}>
        決算月（JP銘柄のみ。US銘柄は空のまま）
        <select
          name="fiscalMonth"
          defaultValue={stock?.fiscalMonth ?? ""}
          className={field}
        >
          <option value="">なし</option>
          {MONTHS.map((month) => (
            <option key={month} value={month}>
              {month}
            </option>
          ))}
        </select>
      </label>
    </ActionForm>
  );
}
