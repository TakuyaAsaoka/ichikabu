import type { EventInput } from "../src/db/write";
import { type Action, ActionForm, field, fieldLabel } from "./form";

type Theme = { id: number; name: string };
type Stock = { id: number; market: string; ticker: string; name: string };

/** 編集のときの初期値。登録では渡さない（設計書 §4.2） */
type EventRow = EventInput & { id: number };

/** 市場イベントの対象（全体設計書 §5）。GLOBAL は全員に出る */
const MARKETS = ["JP", "US", "GLOBAL"];

/** 重要度（★1〜3。全体設計書 §4.1） */
const IMPORTANCES = [1, 2, 3];

/**
 * 対象の <select> の初期選択を作る。埋まっている1列から "market:JP" の形にする。
 * app/event-input.ts の toTarget（振り分け）と対になる
 */
function toTargetValue(row: EventRow): string {
  if (row.market !== null) {
    return `market:${row.market}`;
  }
  if (row.themeId !== null) {
    return `theme:${row.themeId}`;
  }
  return `stock:${row.stockId}`;
}

/**
 * イベントのフォーム。登録と編集の両方で使う（設計書 §4.2）。
 * event を渡すと各欄に初期値が入り、更新先を表す隠しの id が付く。
 *
 * 対象は1つの <select> にまとめる。<select> は1つしか選べないため、
 * event の3列が「ちょうど1つだけ非NULL」であることが画面の側で保たれる（設計書 §4）。
 * 値は "market:JP" のような形にし、app/event-input.ts で3列に振り分ける
 */
export function EventForm({
  themes,
  stocks,
  action,
  submitLabel,
  event,
}: {
  themes: Theme[];
  stocks: Stock[];
  action: Action;
  submitLabel: string;
  event?: EventRow;
}) {
  return (
    <ActionForm action={action} submitLabel={submitLabel}>
      {event && <input type="hidden" name="id" value={event.id} />}
      <label className={fieldLabel}>
        名称
        <input
          type="text"
          name="title"
          required
          defaultValue={event?.title}
          className={field}
        />
      </label>
      <label className={fieldLabel}>
        短縮ラベル（カレンダーのセルに出す。全角5文字まで）
        {/* maxLength は半角と全角を区別しないため目安にすぎない。
            全角換算の判定は src/db/write.ts が持つ（設計書 §7） */}
        <input
          type="text"
          name="shortLabel"
          required
          maxLength={10}
          defaultValue={event?.shortLabel}
          className={field}
        />
      </label>
      <label className={fieldLabel}>
        対象
        <select
          name="target"
          required
          defaultValue={event ? toTargetValue(event) : ""}
          className={field}
        >
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
      <label className={fieldLabel}>
        開始日
        <input
          type="date"
          name="startDate"
          required
          defaultValue={event?.startDate}
          className={field}
        />
      </label>
      <label className={fieldLabel}>
        終了日（空のままなら単日）
        <input
          type="date"
          name="endDate"
          defaultValue={event?.endDate ?? undefined}
          className={field}
        />
      </label>
      <label className={fieldLabel}>
        時刻（JST。空にできる）
        {/* time 列は "14:00:00" の形で返るが <input type="time"> は秒を扱わないため、
            先頭5文字（HH:MM）だけ渡す（設計書 §6） */}
        <input
          type="time"
          name="time"
          defaultValue={event?.time?.slice(0, 5)}
          className={field}
        />
      </label>
      <label className={fieldLabel}>
        重要度
        <select
          name="importance"
          defaultValue={event?.importance ?? 2}
          className={field}
        >
          {IMPORTANCES.map((importance) => (
            <option key={importance} value={importance}>
              {importance}
            </option>
          ))}
        </select>
      </label>
      <label className={fieldLabel}>
        補足
        <textarea
          name="note"
          rows={2}
          defaultValue={event?.note ?? undefined}
          className={field}
        />
      </label>
      <label className={fieldLabel}>
        出典URL（この日付をどこで確認したか）
        <input
          type="url"
          name="sourceUrl"
          defaultValue={event?.sourceUrl ?? undefined}
          className={field}
        />
      </label>
      <label className={fieldLabel}>
        出典の表示名（入れるとアプリの画面に出る。空なら出ない）
        <input
          type="text"
          name="sourceName"
          placeholder="内閣府（PDL1.0）"
          defaultValue={event?.sourceName ?? undefined}
          className={field}
        />
      </label>
      <p className="text-muted text-sm">
        日付・時刻はすべてJSTで入れる。日単位で確定した日付だけを登録する。
        出典の記載が条件の出典を使うときは、表示名を必ず入れる
      </p>
    </ActionForm>
  );
}
