import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { addEvents } from "./actions";
import { ActionForm, fieldLabel } from "./form";

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
      <Label className={fieldLabel}>
        貼り付け（1行に1件。タブ区切り）
        {/* 高さは `rows` では決まらない。部品が `field-sizing-content` を持ち、
            中身の量で伸び縮みするため。最初の高さは `min-h-*` で決める（#161） */}
        <Textarea
          name="rows"
          required
          placeholder={SAMPLE}
          className="min-h-36"
        />
      </Label>
      <p className="text-muted-foreground text-sm">
        列の並び: 名称 / 短縮ラベル / 対象 / 開始日 / 終了日 / 時刻 / 重要度 /
        補足 / 出典URL / 出典の表示名。 対象は
        market:GLOBAL・stock:JP:7203・theme:半導体 のように書く。
        1行でも読めないものがあると1件も登録しない
      </p>
    </ActionForm>
  );
}
