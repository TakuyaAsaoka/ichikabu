import { addStock } from "./actions";
import { ActionForm, field, fieldLabel } from "./form";

/** 決算月の選択肢（1〜12） */
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

/**
 * 銘柄の登録フォーム。
 * name は notNull だが空文字を弾く CHECK が無いため、required で塞ぐ（設計書 §3）
 */
export function StockForm() {
  return (
    <ActionForm action={addStock} submitLabel="銘柄を登録">
      <label className={fieldLabel}>
        市場
        <select name="market" className={field}>
          <option value="JP">JP</option>
          <option value="US">US</option>
        </select>
      </label>
      <label className={fieldLabel}>
        ティッカー
        <input type="text" name="ticker" required className={field} />
      </label>
      <label className={fieldLabel}>
        銘柄名
        <input type="text" name="name" required className={field} />
      </label>
      <label className={fieldLabel}>
        決算月（JP銘柄のみ。US銘柄は空のまま）
        <select name="fiscalMonth" className={field}>
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
