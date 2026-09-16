"use client";

import {
  ActivityIcon,
  CalendarIcon,
  LayersIcon,
  type LucideIcon,
  ScrollTextIcon,
  UsersIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/** 行き先1つ */
export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /**
   * この道の下にいる間、この行を選んでいる扱いにする。
   *
   * **`href` から導かない。** 銘柄・テーマの編集画面（`/stocks/1`・`/themes/1`）は
   * `/` から開くので `/` の行が光るべきだが、`href` の前方一致にすると `/` が
   * どのURLにも当たり、どこに居ても「銘柄とテーマ」が光る（討論の実測で見つけた）
   */
  under: string[];
};

/**
 * サインイン済みの画面が共通で出す行き先（Issue #112 で討論して決めた）。
 * 管理者だけの監査ログは下の `AUDIT` に分けるため、ここには入れない。
 *
 * **リンクの名前は、着いた先の `<h1>` と1文字ずつ同じにする**（Issue #122 で討論して決めた）。
 * 違うと、リンクを押して着いたのかどうかが名前では分からない。
 * 揃っているかは `test/pages.test.ts` が確かめる。この定数の4本と、
 * `AUDIT` を合わせた5本が対象
 */
export const LINKS: NavItem[] = [
  {
    href: "/",
    label: "銘柄とテーマ",
    icon: LayersIcon,
    // 銘柄・テーマ・テーマ所属の編集画面はこの画面から開く
    under: ["/", "/stocks", "/themes"],
  },
  {
    href: "/events",
    label: "イベント",
    icon: CalendarIcon,
    under: ["/events"],
  },
  {
    href: "/contributions",
    label: "貢献度",
    icon: UsersIcon,
    under: ["/contributions"],
  },
  { href: "/status", label: "状態", icon: ActivityIcon, under: ["/status"] },
];

/** 管理者だけに出す行き先。入力者には出さない（開いても追い返されるため） */
export const AUDIT: NavItem = {
  href: "/audit",
  label: "監査ログ",
  icon: ScrollTextIcon,
  under: ["/audit"],
};

/**
 * 並べる行き先。監査ログは管理者だけに出す。
 *
 * サイドバーと下のタブで同じものを並べる。片方にだけ足す形にすると、
 * 行き先を1つ増やしたときに、端末によって行けたり行けなかったりする
 */
function navItems(admin: boolean): NavItem[] {
  return admin ? [...LINKS, AUDIT] : LINKS;
}

/**
 * 今いる画面かどうか。
 *
 * `under` に書いた道と丸ごと同じか、その下にいるときに真。
 * `startsWith(p)` だけにすると `/status` が `/statusXYZ` にも当たるため、
 * 区切りの `/` まで見る
 */
function isCurrent(pathname: string, item: NavItem): boolean {
  return item.under.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

/**
 * PC の左の列に並べる行（Issue #162）。
 *
 * **`app/app-shell/app-shell.tsx` からだけ呼ぶ。** 画面ごとに呼ぶ形はやめた
 * （理由は `app/(signed-in)/layout.tsx`）
 */
export function SidebarNav({ admin }: { admin: boolean }) {
  const pathname = usePathname();

  return (
    <ul className="flex flex-col gap-1">
      {navItems(admin).map((item) => {
        const current = isCurrent(pathname, item);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={current ? "page" : undefined}
              className={
                current
                  ? "flex items-center gap-2.5 rounded-lg bg-sidebar-accent px-3 py-2 font-bold text-sidebar-accent-foreground text-sm"
                  : "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sidebar-foreground text-sm hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              }
            >
              <item.icon className="size-4 shrink-0" aria-hidden />
              {/* 名前は `<span>` に入れる。アイコンと同じ高さに並べるためと、
                  リンク名を取り出す `test/pages.test.ts` の `navLabelOf` が
                  アイコンの svg を拾わないようにするため */}
              <span>{item.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * スマホの下に固定するタブ（Issue #162）。サイドバーと同じ行き先を並べる。
 *
 * **名前は折り返さない**（`whitespace-nowrap`）。これが5つ並ぶかどうかを決めている。
 * 管理者は監査ログが入って5つになり、390px では1つ 78px、`m-1` を引いた中身が
 * 70px になる。「銘柄とテーマ」の名前は 71.6px でこれより広いが、折り返さない指定に
 * したことで、その行だけ縮まずに 71.6px を保ち、残りの4つが少しずつ譲る
 * （320px まで溢れないことを実測）。指定を外すと2行になって 64px の帯から溢れる。
 *
 * **PC では出さない**（`md:hidden`）。隠れている側は画面にも読み上げにも出ないので、
 * サイドバーと同じ名前のリンクが2つ見えることはない
 */
export function BottomTabs({ admin }: { admin: boolean }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="メニュー"
      className="fixed inset-x-0 bottom-0 z-10 h-16 border-border border-t bg-background md:hidden"
    >
      <ul className="flex">
        {navItems(admin).map((item) => {
          const current = isCurrent(pathname, item);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={current ? "page" : undefined}
                className={
                  current
                    ? "m-1 flex flex-col items-center gap-0.5 rounded-lg bg-accent py-1.5 font-bold text-accent-foreground text-xs"
                    : "m-1 flex flex-col items-center gap-0.5 rounded-lg py-1.5 text-muted-foreground text-xs"
                }
              >
                <item.icon className="size-5 shrink-0" aria-hidden />
                <span className="whitespace-nowrap">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
