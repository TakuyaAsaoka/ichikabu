import Link from "next/link";
import { findGaps, GAP_KINDS, GAP_TITLES, jstToday } from "../../../src/status";
import { requireSession } from "../../guard";

/**
 * 状態の画面。登録の抜けを種類ごとに並べる（#110）。
 * 判定は持たず `src/status.ts` の `findGaps` を呼ぶだけにする。
 * 4種類それぞれの抜けの有無を、画面の形に左右されずに確かめられる
 * （画面そのものも検査できる。→ `src/status.ts` の注記）
 */
export default async function Page() {
  await requireSession();

  const gaps = await findGaps(jstToday(new Date()));

  return (
    <>
      <h1 className="text-xl font-bold">状態</h1>

      {GAP_KINDS.map((kind) => {
        const rows = gaps.filter((gap) => gap.kind === kind);
        return (
          <section key={kind} className="flex flex-col gap-3">
            <h2 className="text-base font-bold">
              {GAP_TITLES[kind]}（{rows.length}件）
            </h2>
            {/* 抜けが無いことは見出しの「（0件）」が示す。空白にはならないので
                「抜けが無い」と「調べていない」は見分けが付く。
                抜けであることは見出しの言葉（「決算月なし」など）が伝えるので、
                行ごとに「抜け」の札を重ねない（#188） */}
            {rows.length > 0 && (
              <ul className="flex flex-col gap-1">
                {rows.map((gap) => (
                  <li
                    key={gap.href ?? gap.label}
                    className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border py-1"
                  >
                    {gap.label}
                    {gap.href !== null && (
                      <Link href={gap.href} className="underline">
                        直す
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </>
  );
}
