import { PencilIcon } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * 一覧の行の「編集」。文字ではなく鉛筆のアイコンで出す（#225）。
 * 読み上げの名前とマウスを乗せたときの言葉は「編集」。
 * 押せる範囲は 36px 四方（アイコンは 16px）。
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
      className={`ml-auto ${className ?? ""}`}
    >
      <Link href={href} aria-label="編集" title="編集">
        <PencilIcon aria-hidden="true" />
      </Link>
    </Button>
  );
}
