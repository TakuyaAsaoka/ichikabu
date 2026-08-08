import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "../src/auth";
import { db } from "../src/db";
import { holding, stock } from "../src/db/schema";
import { HoldingForm } from "./holding-form";
import { StockForm } from "./stock-form";

/**
 * 管理画面。銘柄と保有の登録フォームと一覧を縦に並べる（設計書 §3）。
 * 削除・編集・並べ替え・絞り込みは付けない
 */
export default async function Page() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/signin");
  }

  const stocks = await db
    .select()
    .from(stock)
    .orderBy(stock.market, stock.ticker);

  // 保有はサインインしている利用者の分だけを出す（設計書 §3）
  const holdings = await db
    .select({
      market: stock.market,
      ticker: stock.ticker,
      name: stock.name,
    })
    .from(holding)
    .innerJoin(stock, eq(holding.stockId, stock.id))
    .where(eq(holding.userId, session.user.id))
    .orderBy(stock.market, stock.ticker);

  return (
    <>
      <h1 className="text-xl font-bold">イチカブ 管理</h1>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-bold">銘柄を登録</h2>
        <StockForm />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-bold">銘柄一覧（{stocks.length}件）</h2>
        <ul className="flex flex-col gap-1">
          {stocks.map((row) => (
            <li key={row.id} className="border-b border-border py-1">
              {row.market} {row.ticker} {row.name}
              {row.fiscalMonth !== null && (
                <span className="text-muted"> / {row.fiscalMonth}月決算</span>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-bold">保有を登録</h2>
        <HoldingForm choices={stocks} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-bold">保有一覧（{holdings.length}件）</h2>
        <ul className="flex flex-col gap-1">
          {holdings.map((row) => (
            <li
              key={`${row.market}-${row.ticker}`}
              className="border-b border-border py-1"
            >
              {row.market} {row.ticker} {row.name}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
