import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isAdmin } from "../../src/admin";
import { auth } from "../../src/auth";
import {
  type AuditAction,
  type AuditResource,
  listRecent,
} from "../../src/db/audit";
import { Nav } from "../nav";

/** 操作の区分の見出し。足し忘れは Record の型が落とす */
const ACTION_TITLES: Record<AuditAction, string> = {
  create: "登録",
  update: "変更",
  delete: "削除",
};

/** 対象の見出し。足し忘れは Record の型が落とす */
const RESOURCE_TITLES: Record<AuditResource, string> = {
  stock: "銘柄",
  theme: "テーマ",
  event: "イベント",
  theme_stock: "テーマ所属",
};

/**
 * 日時を日本時間で出す。`created_at` は timestamptz なので、時間帯を書かないと
 * 動かす場所の設定しだいで表示が変わる（`src/status.ts` の `jstToday` と同じ理由）。
 * 手元は日本時間なので、外しても手元のテストでは気づけない
 */
const formatJst = (at: Date): string =>
  at.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", hour12: false });

/**
 * 監査ログの画面（監査ログ 設計書 §7）。管理者だけが開ける。
 *
 * 読み出しは持たず `src/db/audit.ts` の `listRecent` を呼ぶだけにする。
 * 並び順の判定をここに書くと、DBを繋いで確かめる場所が無くなる
 */
export default async function Page() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/signin");
  }
  // 画面から入口を消すだけでは足りない。URL を直に打てば開ける。
  // `redirect` で追い返す。ここで止めれば、下の読み出しに進めない
  if (!isAdmin(session.user.email)) {
    redirect("/");
  }

  const rows = await listRecent();

  return (
    <>
      <h1 className="text-xl font-bold">監査ログ</h1>
      <Nav email={session.user.email} />

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-bold">新しい順（{rows.length}件）</h2>
        <ul className="flex flex-col gap-1">
          {/* 0件を黙って空白で表さない。空白は「まだ読めていない」と
              見分けが付かない（状態画面 `app/status/page.tsx` と同じ理由） */}
          {rows.length === 0 ? (
            <li className="text-muted">記録なし</li>
          ) : (
            rows.map((row) => (
              <li key={row.id} className="border-b border-border py-1">
                {formatJst(row.createdAt)} {ACTION_TITLES[row.action]}{" "}
                {RESOURCE_TITLES[row.resourceType]} #{row.resourceId}
                <span className="text-muted">
                  {" "}
                  / {row.userName ?? "取り込み"} / 記録 #{row.id}
                </span>
              </li>
            ))
          )}
        </ul>
      </section>
    </>
  );
}
