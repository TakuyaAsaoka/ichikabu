import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { EVENT_MARKETS } from "../src/db/schema";
import type { EventInput } from "../src/db/write";
import { ActionForm, fieldLabel, fieldSelect } from "./form";
import type { Action } from "./notice";

type Theme = { id: number; name: string };
type Stock = { id: number; market: string; ticker: string; name: string };

/** 編集のときの初期値。登録では渡さない */
type EventRow = EventInput & { id: number };

/** 重要度（★1〜3） */
const IMPORTANCES = [1, 2, 3];

/**
 * 対象の選択欄の初期選択を作る。埋まっている1列から "market:JP" の形にする。
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
 * イベントのフォーム。登録と編集の両方で使う（#43）。
 * event を渡すと各欄に初期値が入り、更新先を表す隠しの id が付く。
 *
 * 対象は1つの選択欄にまとめる。選択欄は1つしか選べないため、
 * event の3列が「ちょうど1つだけ非NULL」であることが画面の側で保たれる。
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
      <Label className={fieldLabel}>
        名称
        <Input type="text" name="title" required defaultValue={event?.title} />
      </Label>
      <Label className={fieldLabel}>
        短縮ラベル（カレンダーのセルに出す。全角5文字まで）
        {/* maxLength は半角と全角を区別しないため目安にすぎない。
            全角換算の判定は src/db/write.ts が持つ */}
        <Input
          type="text"
          name="shortLabel"
          required
          maxLength={10}
          defaultValue={event?.shortLabel}
        />
      </Label>
      <Label className={fieldLabel}>
        対象
        {/* 1つのイベントが持てる対象は1つだけで、2銘柄・2テーマに効く出来事は
            そのままでは表せない。1つの出来事は1行で登録し、複製しない。
            銘柄とテーマの両方に出したいときは、銘柄をテーマに入れてテーマのイベント
            1行にする（2行にすると、セルの2件の枠と月のまとめの件数を二重に使う） */}
        <NativeSelect
          name="target"
          required
          defaultValue={event ? toTargetValue(event) : ""}
          className={fieldSelect}
        >
          <option value="" disabled>
            選んでください
          </option>
          <optgroup label="市場">
            {EVENT_MARKETS.map((market) => (
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
        </NativeSelect>
      </Label>
      <Label className={fieldLabel}>
        開始日
        <Input
          type="date"
          name="startDate"
          required
          defaultValue={event?.startDate}
        />
      </Label>
      <Label className={fieldLabel}>
        終了日（空のままなら単日）
        <Input
          type="date"
          name="endDate"
          defaultValue={event?.endDate ?? undefined}
        />
      </Label>
      <Label className={fieldLabel}>
        時刻（JST。空にできる）
        {/* time 列は "14:00:00" の形で返るが、時刻の入力欄は秒を扱わないため、
            先頭5文字（HH:MM）だけ渡す */}
        <Input
          type="time"
          name="time"
          defaultValue={event?.time?.slice(0, 5)}
        />
      </Label>
      <Label className={fieldLabel}>
        重要度
        <NativeSelect
          name="importance"
          defaultValue={event?.importance ?? 2}
          className={fieldSelect}
        >
          {IMPORTANCES.map((importance) => (
            <option key={importance} value={importance}>
              {importance}
            </option>
          ))}
        </NativeSelect>
      </Label>
      <Label className={fieldLabel}>
        補足
        {/* `rows` は渡さない。部品が `field-sizing-content` を持ち、中身の量で
            伸び縮みするため効かない。最初の高さは部品の `min-h-16`（2行ぶん）でよい */}
        <Textarea name="note" defaultValue={event?.note ?? undefined} />
      </Label>
      <Label className={fieldLabel}>
        出典URL（この日付をどこで確認したか）
        <Input
          type="url"
          name="sourceUrl"
          defaultValue={event?.sourceUrl ?? undefined}
        />
      </Label>
      <Label className={fieldLabel}>
        出典の表示名（入れるとアプリの画面に出る。空なら出ない）
        <Input
          type="text"
          name="sourceName"
          placeholder="内閣府（PDL1.0）"
          defaultValue={event?.sourceName ?? undefined}
        />
      </Label>
      <p className="text-muted-foreground text-sm">
        日付・時刻はすべてJSTで入れる。日単位で確定した日付だけを登録する。
        出典の記載が条件の出典を使うときは、表示名を必ず入れる。市場イベントは出典URLと表示名の両方が要る
      </p>
    </ActionForm>
  );
}
