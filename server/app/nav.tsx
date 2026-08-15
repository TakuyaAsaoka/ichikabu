import Link from "next/link";
import { isAdmin } from "../src/admin";

/**
 * サインイン済みの画面が共通で出す行き先（Issue #112 で討論して決めた）。
 * 管理者だけの監査ログは下で分けるため、ここには入れない
 */
const LINKS = [
  { href: "/", label: "銘柄とテーマ" },
  { href: "/events", label: "イベント" },
  { href: "/contributions", label: "貢献度" },
  { href: "/status", label: "状態（登録の抜け）" },
] as const;

/**
 * 画面の行き先を並べる。**サインイン済みの画面だけが呼ぶ**（Issue #112）。
 *
 * `app/layout.tsx` には置かない。あれは `app/signin/page.tsx` も包むため、
 * サインインしていない人の画面にリンクが並ぶ（状態画面 設計書 §4 が実測で棄却）。
 *
 * サインイン済みの画面だけを包む `app/(admin)/layout.tsx` も作らない。
 * レイアウトは `renderToStaticMarkup(await Page())` では描かれないため、
 * 下の管理者の判定を確かめる場所が無くなる（`app/audit/page.test.ts` の形）。
 * 1行ずつ呼ぶ形なら、画面のテストがそのままこの判定を見られる
 */
export function Nav({ email }: { email: string }) {
  return (
    <nav className="flex flex-wrap gap-3">
      {LINKS.map((link) => (
        <Link key={link.href} href={link.href} className="text-muted underline">
          {link.label}
        </Link>
      ))}
      {/* 入力者には出さない。開いても追い返されるリンクを見せない
          （判定は `app/audit/page.tsx` が自分でもう1度やる） */}
      {isAdmin(email) && (
        <Link href="/audit" className="text-muted underline">
          監査ログ
        </Link>
      )}
    </nav>
  );
}
