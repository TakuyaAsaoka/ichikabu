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
        短縮ラベル（全角5文字まで）
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
        終了日（任意）
        <Input
          type="date"
          name="endDate"
          defaultValue={event?.endDate ?? undefined}
        />
      </Label>
      <Label className={fieldLabel}>
        時刻（任意）
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
        出典URL
        <Input
          type="url"
          name="sourceUrl"
          defaultValue={event?.sourceUrl ?? undefined}
        />
      </Label>
      <Label className={fieldLabel}>
        出典の表示名（アプリに出る）
        <Input
          type="text"
          name="sourceName"
          placeholder="内閣府（PDL1.0）"
          defaultValue={event?.sourceName ?? undefined}
        />
      </Label>
      {/* 決まりはここ1か所に書く。欄の名前にも書くと、スマホで名前が2行に折れ、
          同じことを2回読むことになる（#190）。欄の名前の括弧は短い補足だけにする */}
      <p className="text-muted-foreground text-sm">
        日付と時刻は日本時間（JST）で、確定した日付だけを登録します。
        市場イベントは出典URLと表示名が必須です。記載が条件の出典も、表示名が必須です。
      </p>
    </ActionForm>
  );
}
