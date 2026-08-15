import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "../../src/auth";
import { countByUser } from "../../src/db/audit";
import { Nav } from "../nav";

/**
 * 貢献度の画面。入力者ごとの登録・更新・削除の件数を出す（Issue #112）。
 *
 * 数え方は持たず `src/db/audit.ts` の `countByUser` を呼ぶだけにする
 * （`app/status/page.tsx`・`app/audit/page.tsx` と同じ形）。
 *
 * 管理者だけにはしない。誰がどれだけ入れたかは3人で見えていてよく、
 * 監査ログ（前後の値まで出る）とは見えるものの重さが違う
 */
export default async function Page() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/signin");
  }

  const rows = await countByUser();

  return (
    <>
      <h1 className="text-xl font-bold">貢献度</h1>
      <Nav email={session.user.email} />

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-bold">
          入力者ごとの件数（{rows.length}人）
        </h2>
        <ul className="flex flex-col gap-1">
          {/* 0件を黙って空白で表さない。空白は「まだ読めていない」と
              見分けが付かない（`app/status/page.tsx` と同じ理由） */}
          {rows.length === 0 ? (
            <li className="text-muted">記録なし</li>
          ) : (
            rows.map((row) => (
              <li
                key={row.userId ?? "import"}
                className="border-b border-border py-1"
              >
                {row.userName ?? "取り込み"}
                <span className="text-muted">
                  {" "}
                  / 登録 {row.created}件 / 更新 {row.updated}件 / 削除{" "}
                  {row.deleted}件
                </span>
              </li>
            ))
          )}
        </ul>
      </section>
    </>
  );
}
