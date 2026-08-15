import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "イチカブ 管理",
};

/**
 * ルートレイアウト。App Router は html と body をここで書くことを求める。
 *
 * **ここにナビゲーションは置かない。** このレイアウトは `app/signin/page.tsx` も
 * 包むため、置くとサインインしていない人の画面に管理画面のリンクが並ぶ
 * （nav を入れて `curl /signin` で実測）。画面の行き来は、各画面が行き先の
 * リンクを自分で1本持つ形にする（状態画面 設計書 §4）
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <body className="bg-background text-foreground">
        <main className="mx-auto flex max-w-3xl flex-col gap-10 p-6">
          {children}
        </main>
      </body>
    </html>
  );
}
