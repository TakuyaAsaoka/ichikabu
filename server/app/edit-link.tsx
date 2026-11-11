import { cn } from "cn";
import { PencilIcon } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * 一覧の行の「編集」。文字ではなく鉛筆のアイコンで出す（#225）。
 * 読み上げの名前とマウスを乗せたときの言葉は「編集」。
 * 押せる範囲は 36px 四方（アイコンは 16px）。PC（lg 以上）は行の間隔が 33px ほどで
 * 36px だと隣の行と重なるので 32px にする。
 * 上下の負の余白（-my-1.5）で、行の高さをアイコンで増やさない（文字の1行は 24px。
 * 36 - 6 - 6 = 24。PC は文字が 20px で 32 - 6 - 6 = 20）。
 * 行の右端に寄せる（`ml-auto`）。並べ方が違う一覧は `className` で足す
 */
export function EditLink({
  href,
  className,
}: {
  href: string;
  className?: string;
}) {
  return (
    <Button
      asChild
      variant="ghost"
      size="icon-lg"
      className={cn("-my-1.5 ml-auto lg:size-8", className)}
    >
      <Link href={href} aria-label="編集" title="編集">
        <PencilIcon aria-hidden="true" />
      </Link>
    </Button>
  );
}
