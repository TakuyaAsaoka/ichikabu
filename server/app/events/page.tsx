import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "../../src/auth";
import { db } from "../../src/db";
import { creatorNamesByEventId } from "../../src/db/audit";
import { event, stock, theme } from "../../src/db/schema";
import { addEvent } from "../actions";
import { BulkEventForm } from "../bulk-event-form";
import { EventForm } from "../event-form";
import { Nav } from "../nav";

/**
 * イベントの画面。登録・貼り付けでまとめて登録・一覧を並べる（Issue #112）。
 * 各行から編集ページへ行ける（編集・削除 設計書 §3）。
 * 並べ替え・絞り込みは付けない
 */
export default async function Page() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/signin");
  }

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
      <Nav email={session.user.email} />

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-bold">イベントを登録</h2>
        <EventForm
          themes={themes}
          stocks={stocks}
          action={addEvent}
          submitLabel="イベントを登録"
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-bold">イベントをまとめて登録</h2>
        <BulkEventForm />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-bold">
          イベント一覧（{events.length}件）
        </h2>
        <ul className="flex flex-col gap-1">
          {events.map((row) => {
            const id = String(row.id);
            return (
              <li key={row.id} className="border-b border-border py-1">
                {!row.active && "【非アクティブ】"}
                {row.startDate}
                {row.endDate !== null && `〜${row.endDate}`} ★{row.importance}{" "}
                {row.shortLabel}
                <span className="text-muted">
                  {" "}
                  / {row.market ?? row.themeName ?? row.ticker} / {row.title} /
                  出典: {row.sourceName ?? "表示名なし"} / 入力:{" "}
                  {/* 記録が無いことと、取り込みが入れたことは別（→ `creatorNamesByEventId`） */}
                  {creators.has(id)
                    ? (creators.get(id) ?? "取り込み")
                    : "記録なし"}
                </span>{" "}
                <Link href={`/events/${row.id}`} className="underline">
                  編集
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
