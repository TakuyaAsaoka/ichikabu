import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "../src/auth";
import { db } from "../src/db";
import { event, stock, theme, themeStock } from "../src/db/schema";
import { addEvent, addStock, addTheme } from "./actions";
import { BulkEventForm } from "./bulk-event-form";
import { EventForm } from "./event-form";
import { StockForm } from "./stock-form";
import { ThemeForm } from "./theme-form";
import { ThemeStockForm } from "./theme-stock-form";

/**
 * 管理画面。登録フォームと一覧を縦に並べる（設計書 §3）。
 * 銘柄・テーマ・イベントは各行から編集ページへ行ける（編集・削除 設計書 §3）。
 * テーマ所属は直す列が無いため、行から削除ページへ行く（保有とテーマ所属の削除 設計書 §2）。
 * 並べ替え・絞り込みは付けない
 */
export default async function Page() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/signin");
  }

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

  // テーマ所属は上の themes にぶら下げて出す（設計書 §4.2）。
  // themes が全テーマを持っているため、ここは所属のある行だけを読めば足りる
  const themeStocks = await db
    .select({
      themeId: themeStock.themeId,
      stockId: themeStock.stockId,
      market: stock.market,
      ticker: stock.ticker,
      name: stock.name,
    })
    .from(themeStock)
    .innerJoin(stock, eq(themeStock.stockId, stock.id))
    .orderBy(stock.market, stock.ticker);

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

  return (
    <>
      <h1 className="text-xl font-bold">イチカブ 管理</h1>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-bold">銘柄を登録</h2>
        <StockForm action={addStock} submitLabel="銘柄を登録" />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-bold">銘柄一覧（{stocks.length}件）</h2>
        <ul className="flex flex-col gap-1">
          {stocks.map((row) => (
            <li key={row.id} className="border-b border-border py-1">
              {row.market} {row.ticker} {row.name}
              {row.fiscalMonth !== null && (
                <span className="text-muted"> / {row.fiscalMonth}月決算</span>
              )}{" "}
              <Link href={`/stocks/${row.id}`} className="underline">
                編集
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-bold">テーマを登録</h2>
        <ThemeForm action={addTheme} submitLabel="テーマを登録" />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-bold">テーマ所属を登録</h2>
        <ThemeStockForm themes={themes} stocks={stocks} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-bold">テーマ一覧（{themes.length}件）</h2>
        <ul className="flex flex-col gap-1">
          {themes.map((row) => {
            const belongings = themeStocks.filter((s) => s.themeId === row.id);
            return (
              <li key={row.id} className="border-b border-border py-1">
                {row.name}{" "}
                <Link href={`/themes/${row.id}`} className="underline">
                  編集
                </Link>
                <ul className="pl-4">
                  {belongings.length === 0 ? (
                    <li className="text-muted">銘柄なし</li>
                  ) : (
                    belongings.map((s) => (
                      <li key={s.stockId}>
                        {s.market} {s.ticker} {s.name}{" "}
                        <Link
                          href={`/themes/${row.id}/stocks/${s.stockId}`}
                          className="underline"
                        >
                          外す
                        </Link>
                      </li>
                    ))
                  )}
                </ul>
              </li>
            );
          })}
        </ul>
      </section>

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
          {events.map((row) => (
            <li key={row.id} className="border-b border-border py-1">
              {!row.active && "【非アクティブ】"}
              {row.startDate}
              {row.endDate !== null && `〜${row.endDate}`} ★{row.importance}{" "}
              {row.shortLabel}
              <span className="text-muted">
                {" "}
                / {row.market ?? row.themeName ?? row.ticker} / {row.title} /
                出典: {row.sourceName ?? "表示名なし"}
              </span>{" "}
              <Link href={`/events/${row.id}`} className="underline">
                編集
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
