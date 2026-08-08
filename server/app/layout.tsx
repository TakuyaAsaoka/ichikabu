import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "イチカブ 管理",
};

/**
 * ルートレイアウト。App Router は html と body をここで書くことを求める。
 * 画面が2枚しかないためナビゲーションは置かない（設計書 §3）
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
