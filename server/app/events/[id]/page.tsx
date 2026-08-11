import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "../../../src/auth";
import { db } from "../../../src/db";
import { event, stock, theme } from "../../../src/db/schema";
import { editEvent, removeEvent } from "../../actions";
import { EventForm } from "../../event-form";
import { ActionForm } from "../../form";

/**
 * イベントの編集ページ（設計書 §3）。
 * 登録フォームと同じ EventForm に初期値を渡して出す
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

  // 数字でないIDは Number() が NaN になる。NaN のまま integer 列に渡すと
  // 型変換エラーで 500 になるため、問い合わせる前に弾く（設計書 §6）
  const { id } = await params;
  const eventId = Number(id);
  if (!Number.isInteger(eventId)) {
    notFound();
  }

  const [row] = await db.select().from(event).where(eq(event.id, eventId));
  if (!row) {
    notFound();
  }

  const themes = await db
    .select({ id: theme.id, name: theme.name })
    .from(theme)
    .orderBy(theme.name);

  const stocks = await db
    .select({
      id: stock.id,
      market: stock.market,
      ticker: stock.ticker,
      name: stock.name,
    })
    .from(stock)
    .orderBy(stock.market, stock.ticker);

  return (
    <>
      <h1 className="text-xl font-bold">イベントを編集</h1>
      <Link href="/" className="text-muted underline">
        一覧に戻る
      </Link>

      <section className="flex flex-col gap-3">
        <EventForm
          themes={themes}
          stocks={stocks}
          action={editEvent}
          submitLabel="イベントを更新"
          event={row}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-bold">削除</h2>
        {/* 消したイベントは戻せないため、送信前に確認を挟む（設計書 §3.2） */}
        <ActionForm
          action={removeEvent}
          submitLabel="このイベントを削除"
          confirm={`「${row.title}」を削除する。取り消せない。`}
        >
          <input type="hidden" name="id" value={row.id} />
        </ActionForm>
      </section>
    </>
  );
}
