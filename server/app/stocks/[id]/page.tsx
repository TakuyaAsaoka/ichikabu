import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "../../../src/auth";
import { db } from "../../../src/db";
import { stock, theme, themeStock } from "../../../src/db/schema";
import { isId } from "../../../src/db/write";
import { editStock, removeStock } from "../../actions";
import { ActionForm } from "../../form";
import { StockForm } from "../../stock-form";

/**
 * 銘柄の編集ページ（設計書 §3）。
 * 登録フォームと同じ StockForm に初期値を渡して出す
 */
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/signin");
  }

  // 問い合わせに渡せないIDは、integer 列に渡す前に弾く。渡すと型変換エラーで
  // 500 になる。判定は Server Action と同じものを使う（イベントの編集・削除 設計書 §6）
  const { id } = await params;
  const stockId = Number(id);
  if (!isId(stockId)) {
    notFound();
  }

  const [row] = await db.select().from(stock).where(eq(stock.id, stockId));
  if (!row) {
    notFound();
  }

  // 銘柄を消すとテーマ所属も一緒に消える（theme_stock.stock_id は ON DELETE cascade）。
  // 何が外れるかを画面と確認ダイアログの両方に出す（設計書 §4.1）
  const belongings = await db
    .select({ name: theme.name })
    .from(themeStock)
    .innerJoin(theme, eq(themeStock.themeId, theme.id))
    .where(eq(themeStock.stockId, stockId))
    .orderBy(theme.name);

  return (
    <>
      <h1 className="text-xl font-bold">銘柄を編集</h1>
      <Link href="/" className="text-muted underline">
        一覧に戻る
      </Link>

      <section className="flex flex-col gap-3">
        <StockForm action={editStock} submitLabel="銘柄を更新" stock={row} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-bold">削除</h2>
        <ul className="flex flex-col gap-1">
          {belongings.length === 0 ? (
            <li className="text-muted">所属しているテーマなし</li>
          ) : (
            belongings.map((t) => (
              <li key={t.name} className="text-muted">
                {t.name}
              </li>
            ))
          )}
        </ul>
        {/* 消した銘柄は戻せないため、送信前に確認を挟む（イベントの編集・削除 設計書 §3.2）。
            テーマ所属は黙って一緒に消えるため件数を出す。名前は上に出ている（設計書 §4.1） */}
        <ActionForm
          action={removeStock}
          submitLabel="この銘柄を削除"
          confirm={`「${row.name}」を削除する。${
            belongings.length > 0
              ? `所属しているテーマ${belongings.length}件も外れる。`
              : ""
          }取り消せない。`}
        >
          <input type="hidden" name="id" value={row.id} />
        </ActionForm>
      </section>
    </>
  );
}
