import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "../../src/auth";
import { findGaps, GAP_KINDS, GAP_TITLES, jstToday } from "../../src/status";
import { Nav } from "../nav";

/**
 * 状態の画面。登録の抜けを種類ごとに並べる（状態画面 設計書 §3）。
 * 判定は持たず `src/status.ts` の `findGaps` を呼ぶだけにする。
 * 5種類それぞれの「抜けあり・抜けなし」を、画面の形に左右されずに確かめられる
 * （画面そのものも検査できる。→ `src/status.ts` の注記）
 */
export default async function Page() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/signin");
  }

  const gaps = await findGaps(jstToday(new Date()));

  return (
    <>
      <h1 className="text-xl font-bold">状態</h1>
      <Nav email={session.user.email} />

      {GAP_KINDS.map((kind) => {
        const rows = gaps.filter((gap) => gap.kind === kind);
        return (
          <section key={kind} className="flex flex-col gap-3">
            <h2 className="text-base font-bold">
              {GAP_TITLES[kind]}（{rows.length}件）
            </h2>
            <ul className="flex flex-col gap-1">
              {/* 抜けが無いことを黙って空白で表さない。空白は「調べていない」と
                  見分けが付かず、この画面を開く意味が無くなる */}
              {rows.length === 0 ? (
                <li className="text-muted">抜けなし</li>
              ) : (
                rows.map((gap) => (
                  <li
                    key={gap.href ?? gap.label}
                    className="border-b border-border py-1 text-error"
                  >
                    {gap.label}{" "}
                    {gap.href !== null && (
                      <Link href={gap.href} className="underline">
                        直す
                      </Link>
                    )}
                  </li>
                ))
              )}
            </ul>
          </section>
        );
      })}
    </>
  );
}
