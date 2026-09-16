import { eq } from "drizzle-orm";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { db } from "../../../src/db";
import { creatorNamesByEventId } from "../../../src/db/audit";
import { event, stock, theme } from "../../../src/db/schema";
import { addEvent } from "../../actions";
import { BulkEventForm } from "../../bulk-event-form";
import { EventForm } from "../../event-form";
import { requireSession } from "../../guard";
import { RegisterDetails } from "../../register-details";

/**
 * イベントの画面。一覧を出す（Issue #112）。
 * 登録と貼り付けでまとめて登録は、一覧の見出しの下に閉じて置き、押したときだけ開く（#165）。
 * 各行から編集ページへ行ける（編集・削除 設計書 §3）。
 * 並べ替え・絞り込みは付けない
 */
export default async function Page() {
  await requireSession();

  // 登録フォームの対象の選択肢。イベントは銘柄かテーマかマーケットに紐づく
  const stocks = await db
    .select({
      id: stock.id,
      market: stock.market,
      ticker: stock.ticker,
      name: stock.name,
      fiscalMonth: stock.fiscalMonth,
    })
    .from(stock)
    .orderBy(stock.market, stock.ticker);

  const themes = await db
    .select({ id: theme.id, name: theme.name })
    .from(theme)
    .orderBy(theme.name);

  // 対象は3列のうち1つだけが埋まる（全体設計書 §5）ため、
  // テーマと銘柄を外部結合し、埋まっている側だけが値を持つ形で読む
  const events = await db
    .select({
      id: event.id,
      title: event.title,
      shortLabel: event.shortLabel,
      startDate: event.startDate,
      endDate: event.endDate,
      importance: event.importance,
      market: event.market,
      // 出典の表示名を入れ忘れた行は、出典の記載を条件とする出典では規約の
      // 条件を満たさない。一覧でそれが分かるように出す（編集・削除 設計書 §3.1）
      sourceName: event.sourceName,
      // 非アクティブの行はアプリに出ない。それが分かる場所は他に無いので
      // ここに出す（公表予定の非アクティブ化 設計書 §4）
      active: event.active,
      themeName: theme.name,
      ticker: stock.ticker,
    })
    .from(event)
    .leftJoin(theme, eq(event.themeId, theme.id))
    .leftJoin(stock, eq(event.stockId, stock.id))
    .orderBy(event.startDate);

  // 誰が入れたかは監査ログから引く。`event` に作成者の列は作らない
  // （監査ログ 設計書 §5.5）。1行ずつ問い合わせず、全件を1回読んで突き合わせる
  const creators = await creatorNamesByEventId();

  return (
    <>
      <h1 className="text-xl font-bold">イベント</h1>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-bold">
          イベント一覧（{events.length}件）
        </h2>
        <RegisterDetails label="イベントを登録">
          <EventForm
            themes={themes}
            stocks={stocks}
            action={addEvent}
            submitLabel="イベントを登録"
          />
        </RegisterDetails>
        <RegisterDetails label="まとめて登録">
          <BulkEventForm />
        </RegisterDetails>
        {/* PC（lg 以上）は列をそろえ、1件を1行に収める（#172）。名称と出典だけを
            切り詰め、項目は1つも落とさない（出典は一覧に出す。編集・削除 設計書 §3.1）。
            lg 未満は本文の幅が 720px に届かない（サイドバーが 224px 取る）ので、
            いまの折り返す並びのまま全文を出す。行は1通りで、幅で変わるのはクラスだけ。
            **行に項目を足したら、列の指定と見出しのマスも足す。** 足し忘れても
            エラーにならず1件が2段に折れるだけなので、`page.test.ts` が数を突き合わせている */}
        <div className="lg:grid lg:grid-cols-[auto_auto_auto_auto_minmax(0,2fr)_minmax(5rem,1fr)_auto_auto] lg:gap-x-2 lg:text-sm">
          {/* 行の「出典: 」「入力: 」は PC では画面から消すので、何の列かをここで示す。
              読み上げには行の側の前置きが残るので、見出しは読ませない。
              他の列は中身で分かる。見出しを付けると中身より広い列が出て、名称の列が縮む */}
          <div
            aria-hidden="true"
            className="hidden text-muted-foreground text-xs lg:col-span-full lg:grid lg:grid-cols-subgrid"
          >
            <span />
            <span />
            <span />
            <span />
            <span />
            <span>出典</span>
            <span>入力</span>
            <span />
          </div>
          <ul className="flex flex-col gap-y-1 lg:col-span-full lg:grid lg:grid-cols-subgrid">
            {events.map((row) => {
              const id = String(row.id);
              return (
                <li
                  key={row.id}
                  // 「 / 」でつないだ1文をやめ、項目ごとに区切って並べる（#161）。
                  // 折り返す並びにしてあるので、スマホの幅でも横にはみ出さない。
                  // `gap-x-2` は PC でも効き、包みの `lg:gap-x-2` と同じ値にしてある。
                  // 変えると見出しと行の列が見た目でずれる（テストでは赤くならない）
                  className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border py-1 lg:col-span-full lg:grid lg:grid-cols-subgrid"
                >
                  {/* **日付を行の先頭から動かさない。** `page.test.ts` が
                    行のHTMLの先頭10文字を日付として読み、開始日順に並ぶことを見ている。
                    前に何かを足すと、並び順の検査が日付以外を比べ始める */}
                  {row.startDate}
                  {row.endDate !== null && `〜${row.endDate}`}
                  <span>★{row.importance}</span>
                  <span>{row.shortLabel}</span>
                  <span className="text-muted-foreground">
                    {row.market ?? row.themeName ?? row.ticker}
                  </span>
                  {/* 切り詰めた全文は `title` で読める。編集ページにも全文が出る */}
                  <span className="flex min-w-0 items-center gap-2">
                    {/* 非アクティブの行はアプリに出ない。それが分かる場所は他に無いので
                      ここに出す（公表予定の非アクティブ化 設計書 §4）。
                      行の頭に角括弧つきの文字を置く形をやめ、バッジにした（#161）。
                      名称と同じマスに入れ、付いた行だけ列が増えないようにした（#172） */}
                    {!row.active && (
                      <Badge variant="secondary">非アクティブ</Badge>
                    )}
                    <span
                      className="text-muted-foreground lg:truncate"
                      title={row.title}
                    >
                      {row.title}
                    </span>
                  </span>
                  {/* 「表示名なし」は切らない（出典の列の最小 5rem に収まる）。
                    入っているかどうかを一覧で見るための欄なので（設計書 §3.1） */}
                  <span
                    className="text-muted-foreground lg:truncate"
                    title={row.sourceName ?? undefined}
                  >
                    <span className="lg:sr-only">出典: </span>
                    {row.sourceName ?? "表示名なし"}
                  </span>
                  <span className="text-muted-foreground">
                    <span className="lg:sr-only">入力: </span>
                    {/* 記録が無いことと、取り込みが入れたことは別（→ `creatorNamesByEventId`） */}
                    {creators.has(id)
                      ? (creators.get(id) ?? "取り込み")
                      : "記録なし"}
                  </span>
                  <Link href={`/events/${row.id}`} className="underline">
                    編集
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </section>
    </>
  );
}
