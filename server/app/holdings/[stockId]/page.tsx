import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "../../../src/auth";
import { db } from "../../../src/db";
import { holding, stock } from "../../../src/db/schema";
import { isId } from "../../../src/db/write";
import { removeHolding } from "../../actions";
import { ActionForm } from "../../form";

/**
 * 保有を外すページ（設計書 §2）。
 * 直す列が無いため編集フォームは無く、削除だけを置く
 */
export default async function Page({
  params,
}: {
  params: Promise<{ stockId: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/signin");
  }

  // 問い合わせに渡せないIDは、integer 列に渡す前に弾く。渡すと型変換エラーで
  // 500 になる。判定は Server Action と同じものを使う（設計書 §4）
  const { stockId: raw } = await params;
  const stockId = Number(raw);
  if (!isId(stockId)) {
    notFound();
  }

  // 利用者IDはURLではなくセッションから取る（設計書 §2.1）。
  // 持っていない銘柄のURLを直接開かれても、ここで404になる
  const [row] = await db
    .select({ market: stock.market, ticker: stock.ticker, name: stock.name })
    .from(holding)
    .innerJoin(stock, eq(holding.stockId, stock.id))
    .where(
      and(eq(holding.userId, session.user.id), eq(holding.stockId, stockId)),
    );
  if (!row) {
    notFound();
  }

  return (
    <>
      <h1 className="text-xl font-bold">保有を外す</h1>
      <Link href="/" className="text-muted underline">
        一覧に戻る
      </Link>

      <section className="flex flex-col gap-3">
        <p>
          {row.market} {row.ticker} {row.name}
        </p>
        {/* 確認ダイアログは出さない。巻き添えは0件で、外しても保有フォームから
            入れ直せる（設計書 §3）。銘柄そのものは消えない */}
        <ActionForm action={removeHolding} submitLabel="この保有を外す">
          <input type="hidden" name="stockId" value={stockId} />
        </ActionForm>
      </section>
    </>
  );
}
