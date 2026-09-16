import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "イチカブ 管理",
};

/**
 * ルートレイアウト。App Router は html と body をここで書くことを求める。
 *
 * **ここには骨組み（行き先・アカウントのメニュー）を置かない。** このレイアウトは
 * `app/signin/page.tsx` も包むため、置くとサインインしていない人の画面に
 * 管理画面のリンクが並ぶ（nav を入れて `curl /signin` で実測。状態画面 設計書 §4）。
 * 骨組みは `app/(signed-in)/layout.tsx` が持つ（Issue #162）。
 *
 * **中身を `<main>` で包まない。** サイドバーは `<main>` の外に出る必要があり、
 * 幅を `max-w-3xl` に絞るのも中身の側の都合。どちらも骨組みが受け持つ。
 * サインインの画面は自分で外枠を持つ
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <body className="bg-background text-foreground">{children}</body>
    </html>
  );
}
