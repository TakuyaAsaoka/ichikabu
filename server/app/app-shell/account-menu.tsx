"use client";

import { ChevronDownIcon, LogOutIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut } from "./sign-out";

/**
 * 右上のアカウントのボタンと、そのメニュー（Issue #162）。
 *
 * 中身はメールアドレスとサインアウトだけ。行き先はサイドバーと下のタブが全部持つので、
 * ここには入れない（`app/app-shell/nav.tsx`）。
 *
 * **顔写真は無い。** 利用者の表の列にもGoogleから取る作りにもしていない。
 * 誰として入っているかはメールアドレスで出す（利用者は3人。Issue #82）
 */
export function AccountMenu({ email }: { email: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {/* スマホではネイビーの面の上に載るので、面に合う色にする。
            PC は明るい面なので既定のゴーストのままでよい */}
        <Button
          variant="ghost"
          size="lg"
          className="gap-1.5 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground md:text-foreground md:hover:bg-muted md:hover:text-foreground"
        >
          {/* スマホではメールアドレスを見せない（幅が足りない）が、
              読み上げには残す。誰として入っているかが分からなくなるため */}
          <span className="sr-only md:not-sr-only">{email}</span>
          <span className="sr-only">（アカウントのメニュー）</span>
          <ChevronDownIcon className="size-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      {/* 部品の既定はボタンと同じ幅（`w-(--radix-dropdown-menu-trigger-width)`）。
          スマホではボタンがアイコンだけの幅になり、メールアドレスが入らない */}
      <DropdownMenuContent align="end" className="w-auto min-w-56">
        <DropdownMenuLabel className="font-normal text-muted-foreground">
          {email}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {/*
         * **フォームの送信にしない。** 行を選んだ瞬間にメニューが閉じてフォームが
         * 消えるので、送信が通るかが閉じるアニメーションの長さに頼ることになる
         * （novel-system の `src/app/log-out-button.tsx` に実測が残っている）。
         * 選んだときに Server Action を直に呼ぶ
         */}
        <DropdownMenuItem
          onSelect={() => {
            void signOut();
          }}
        >
          <LogOutIcon aria-hidden />
          サインアウト
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
