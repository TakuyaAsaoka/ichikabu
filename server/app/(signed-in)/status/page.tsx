import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { findGaps, GAP_KINDS, GAP_TITLES, jstToday } from "../../../src/status";
import { requireSession } from "../../guard";

/**
 * 状態の画面。登録の抜けを種類ごとに並べる（#110）。
 * 判定は持たず `src/status.ts` の `findGaps` を呼ぶだけにする。
 * 5種類それぞれの「抜けあり・抜けなし」を、画面の形に左右されずに確かめられる
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
            <ul className="flex flex-col gap-1">
              {/* 抜けが無いことを黙って空白で表さない。空白は「調べていない」と
                  見分けが付かず、この画面を開く意味が無くなる */}
              {rows.length === 0 ? (
                <li className="text-muted-foreground">抜けなし</li>
              ) : (
                rows.map((gap) => (
                  <li
                    key={gap.href ?? gap.label}
                    className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border py-1"
                  >
                    {/* 抜けであることを言葉で出す。色だけで運ばない（CLAUDE.md「色」）。
                        赤い文字だけだと、色の見分けが付きにくい人に何も伝わらない。
                        文章は foreground のままにして、色は印にだけ付ける */}
                    <Badge variant="destructive">抜け</Badge>
                    {gap.label}
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
