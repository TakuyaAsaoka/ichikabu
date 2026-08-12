import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "../../../src/auth";
import { db } from "../../../src/db";
import { stock, theme, themeStock } from "../../../src/db/schema";
import { isId } from "../../../src/db/write";
import { editTheme, removeTheme } from "../../actions";
import { ActionForm } from "../../form";
import { ThemeForm } from "../../theme-form";

/**
 * テーマの編集ページ（設計書 §3）。
 * 登録フォームと同じ ThemeForm に初期値を渡して出す
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
  const themeId = Number(id);
  if (!isId(themeId)) {
    notFound();
  }

  const [row] = await db.select().from(theme).where(eq(theme.id, themeId));
  if (!row) {
    notFound();
  }

  // テーマを消すと所属も一緒に消える（theme_stock.theme_id は ON DELETE cascade）。
  // 何が外れるかを画面と確認ダイアログの両方に出す（設計書 §4）
  const belongings = await db
    .select({
      market: stock.market,
      ticker: stock.ticker,
      name: stock.name,
    })
    .from(themeStock)
    .innerJoin(stock, eq(themeStock.stockId, stock.id))
    .where(eq(themeStock.themeId, themeId))
    .orderBy(stock.market, stock.ticker);

  return (
    <>
      <h1 className="text-xl font-bold">テーマを編集</h1>
      <Link href="/" className="text-muted underline">
        一覧に戻る
      </Link>

      <section className="flex flex-col gap-3">
        <ThemeForm action={editTheme} submitLabel="テーマを更新" theme={row} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-bold">削除</h2>
        <ul className="flex flex-col gap-1">
          {belongings.length === 0 ? (
            <li className="text-muted">所属している銘柄なし</li>
          ) : (
            belongings.map((s) => (
              <li key={`${s.market}-${s.ticker}`} className="text-muted">
                {s.market} {s.ticker} {s.name}
              </li>
            ))
          )}
        </ul>
        {/* 消したテーマは戻せないため、送信前に確認を挟む（イベントの編集・削除 設計書 §3.2）。
            所属は黙って一緒に消えるため件数を出す。名前は上に出ている（設計書 §4） */}
        <ActionForm
          action={removeTheme}
          submitLabel="このテーマを削除"
          confirm={`「${row.name}」を削除する。${
            belongings.length > 0
              ? `所属している銘柄${belongings.length}件も外れる。`
              : ""
          }取り消せない。`}
        >
          <input type="hidden" name="id" value={row.id} />
        </ActionForm>
      </section>
    </>
  );
}
