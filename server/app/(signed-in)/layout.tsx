import type { ReactNode } from "react";
import { AppShell } from "../app-shell/app-shell";
import { requireSession } from "../guard";

/**
 * サインイン後の9枚を包む骨組み（Issue #162）。
 *
 * **Issue #112 の「`app/(admin)/layout.tsx` は作らない」を覆した。** あのときの
 * 理由は「レイアウトはテストで描けない」だったが、これは誤りだった。
 * `renderToStaticMarkup(await Layout({ children }))` でそのまま描け、
 * `vi.mock("next/navigation")` で `usePathname` を差し替えれば今いる画面の印
 * （`aria-current`）まで見える（#162 の討論で実測。→ `test/pages.test.ts`）。
 * 根の `app/layout.tsx` に置けないこと（サインイン画面も包むため）は変わらない。
 *
 * 画面ごとに `<Nav>` を呼ぶ形はやめた。9か所に同じ呼び出しが並び、画面を足したときに
 * 入れ忘れられる。レイアウトなら Next.js のルーターが必ず合成するので、
 * 入れ忘れという失敗の形そのものが無くなる。
 * 代わりに要るのは「サインインが要る画面が全部この下にあるか」で、
 * `test/pages.test.ts` が `app/` を数え合わせて見ている。
 *
 * **ここで追い返しても、各画面の `requireSession()` は外さない。** Server Action は
 * 宛先へ直に送られてレイアウトを通らないため、画面と書き込みの入口がそれぞれ通る
 * （`app/guard.ts`）
 */
export default async function SignedInLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await requireSession();

  return <AppShell email={session.user.email}>{children}</AppShell>;
}
