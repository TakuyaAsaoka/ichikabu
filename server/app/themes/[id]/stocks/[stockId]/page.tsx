import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "../../../../../src/auth";
import { db } from "../../../../../src/db";
import { stock, theme, themeStock } from "../../../../../src/db/schema";
import { isId } from "../../../../../src/db/write";
import { removeThemeStock } from "../../../../actions";
import { ActionForm } from "../../../../form";

/**
 * テーマ所属を外すページ（設計書 §2）。
 * 直す列が無いため編集フォームは無く、削除だけを置く。
 * テーマIDのスラッグ名は親の `[id]` に合わせる（設計書 §2.1）
 */
export default async function Page({
  params,
}: {
  params: Promise<{ id: string; stockId: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/signin");
  }

  // 複合主キーなので2列とも判定する（設計書 §4）
  const { id, stockId: rawStockId } = await params;
  const themeId = Number(id);
  const stockId = Number(rawStockId);
  if (!isId(themeId) || !isId(stockId)) {
    notFound();
  }

  const [row] = await db
    .select({
      themeName: theme.name,
      market: stock.market,
      ticker: stock.ticker,
      name: stock.name,
    })
    .from(themeStock)
    .innerJoin(theme, eq(themeStock.themeId, theme.id))
    .innerJoin(stock, eq(themeStock.stockId, stock.id))
    .where(
      and(eq(themeStock.themeId, themeId), eq(themeStock.stockId, stockId)),
    );
  if (!row) {
    notFound();
  }

  return (
    <>
      <h1 className="text-xl font-bold">テーマ所属を外す</h1>
      <Link href="/" className="text-muted underline">
        一覧に戻る
      </Link>

      <section className="flex flex-col gap-3">
        <p>
          {row.themeName} / {row.market} {row.ticker} {row.name}
        </p>
        {/* 確認ダイアログは出さない。外れるのは所属だけで、テーマも銘柄も残り、
            テーマ所属フォームから入れ直せる（設計書 §3） */}
        <ActionForm action={removeThemeStock} submitLabel="この所属を外す">
          <input type="hidden" name="themeId" value={themeId} />
          <input type="hidden" name="stockId" value={stockId} />
        </ActionForm>
      </section>
    </>
  );
}
