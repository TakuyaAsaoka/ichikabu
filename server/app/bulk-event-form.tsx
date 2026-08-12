import { addEvents } from "./actions";
import { ActionForm, field, fieldLabel } from "./form";

/** 貼り付ける行の見本。タブ区切りで、終了日と補足は空にしてある（設計書 §5） */
const SAMPLE = [
  "米消費者物価指数（2026年7月分）",
  "米CPI",
  "market:GLOBAL",
  "2026-08-12",
  "",
  "21:30",
  "2",
  "",
  "https://www.bls.gov/schedule/news_release/cpi.htm",
  "U.S. Bureau of Labor Statistics",
].join("\t");

/**
 * イベントの一括登録フォーム。タブ区切りの行を貼り付ける（設計書 §5）。
 * スプレッドシートからのコピーがそのままタブ区切りになる
 */
export function BulkEventForm() {
  return (
    <ActionForm action={addEvents} submitLabel="まとめて登録">
      <label className={fieldLabel}>
        貼り付け（1行に1件。タブ区切り）
        <textarea
          name="rows"
          required
          rows={6}
          placeholder={SAMPLE}
          className={field}
        />
      </label>
      <p className="text-muted text-sm">
        列の並び: 名称 / 短縮ラベル / 対象 / 開始日 / 終了日 / 時刻 / 重要度 /
        補足 / 出典URL / 出典の表示名。 対象は
        market:GLOBAL・stock:JP:7203・theme:半導体 のように書く。
        1行でも読めないものがあると1件も登録しない
      </p>
    </ActionForm>
  );
}
