import type { ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";
import { isAdmin } from "../../src/admin";
import { AccountMenu } from "./account-menu";
import { DoneNotice } from "./done-notice";
import { BottomTabs, SidebarNav } from "./nav";

/**
 * サインイン後のどの画面も共通で持つ骨組み（Issue #162）。
 *
 * | 端末 | 上 | 左 | 下 |
 * |---|---|---|---|
 * | PC（`md` 以上） | ヘッダー（右にアカウントのボタン） | サイドバー | ― |
 * | スマホ | ヘッダー（サイドバーの色の面。左に名前） | ― | タブ |
 *
 * **shadcn の `sidebar` は入れない。** 727行と7つの部品（`sheet`・`tooltip`・
 * `skeleton` など）を連れてくるが、この画面のサイドバーは畳まないので、
 * Sheet・Ctrl/⌘+B・ツールチップの経路は全部使われない（討論で測った）。
 * 畳まない1列は素の `<aside>` で足りる。開閉やキーボードの扱いが本当に要る
 * アカウントのメニューには `dropdown-menu` を使っている。
 *
 * **非同期にしない。** 画面のテストは `renderToStaticMarkup` で描いており
 * （`test/render-page.ts` の `render`）、入れ子の非同期コンポーネントは待てずに
 * 落ちる。セッションは `app/(signed-in)/layout.tsx` が読んで、値で渡す
 */
export function AppShell({
  email,
  children,
}: {
  email: string;
  children: ReactNode;
}) {
  // 管理者かどうかはここで決める。`src/admin.ts` はサーバー側でしか読めない
  // （読み込みの時点で `ADMIN_EMAIL` を見る）ので、ブラウザ側で動く
  // `SidebarNav`・`AccountMenu` には真偽値だけを渡す
  const admin = isAdmin(email);

  return (
    <div className="flex min-h-svh">
      {/* 面と枠線を同じ色にして線を見せない（CLAUDE.md「色」の `sidebar-border`）。
          `sticky` にするのは、一覧が長い画面で行き先が流れて消えないようにするため。
          ネイビーの面なので、フォーカスの輪を面の上で見える色に差し替える
          （`ring` のままだと差が 1.54。下のヘッダーと同じ理由） */}
      <aside className="sticky top-0 hidden h-svh w-56 shrink-0 flex-col border-sidebar-border border-r bg-sidebar [--ring:var(--sidebar-ring)] md:flex">
        <div className="flex h-16 shrink-0 items-center px-5 font-bold text-lg text-sidebar-foreground">
          イチカブ 管理
        </div>
        <nav aria-label="メニュー" className="px-3">
          <SidebarNav admin={admin} />
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* スマホのヘッダーはネイビーの面なので、フォーカスの輪を面の上で見える色に
            差し替える。`ring` のままだと面との差が 1.54 で見えない（CLAUDE.md「色」）。
            PC のヘッダーは明るい面なので `ring` のままでよい */}
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center justify-between border-sidebar-border border-b bg-sidebar px-3 max-md:[--ring:var(--sidebar-ring)] md:h-16 md:justify-end md:border-border md:bg-background md:px-6">
          <span className="font-bold text-sidebar-foreground md:hidden">
            イチカブ 管理
          </span>
          <AccountMenu email={email} />
        </header>

        {/* 下のタブ（`h-16` = 64px）に隠れて最後の行が押せなくならないよう、
            スマホでは 96px 空ける。PC はタブが出ないので空けない */}
        <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-10 p-6 pb-24 md:pb-6">
          {children}
        </main>
      </div>

      <BottomTabs admin={admin} />

      {/* 登録・更新・削除が済んだあとの知らせ（Issue #164）。画面に固定して出すので、
          長い画面の途中のフォームで登録しても見える位置に出る。
          `theme="light"`: 部品の既定は OS の設定に合わせるが、この画面は明るい色しか持たない。
          `mobileOffset`: スマホでは下のタブ（`h-16` = 64px）の上に出す。既定の 16px だと
          タブに重なる */}
      <Toaster theme="light" mobileOffset={{ bottom: 80 }} />
      <DoneNotice />
    </div>
  );
}
