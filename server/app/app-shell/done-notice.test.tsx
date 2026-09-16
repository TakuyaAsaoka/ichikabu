// @vitest-environment jsdom
// ブラウザの真似（jsdom）で動かす。理由は `app/form.test.tsx` の冒頭と同じ
import { act, cleanup, render, screen } from "@testing-library/react";
import { toast } from "sonner";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "./app-shell";

/**
 * `useSearchParams()` の戻り値。
 *
 * ルーターの外で描くと本物は `null` を返し続けるので、差し替えないと
 * 「2回目の移動でも知らせが出る」を確かめられない。骨組みは画面を移っても
 * 付いたままなので、URL が変わったことはこの値が変わることでしか分からない
 * （#164 の討論）。値を入れ替えて描き直すことで、移動を真似る
 */
const searchParams = { current: new URLSearchParams() };
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useSearchParams: () => searchParams.current,
  // 骨組みの行き先（`app/app-shell/nav.tsx`）が今いる画面を読む
  usePathname: () => window.location.pathname,
}));

// トーストは部品の外の置き場に残るので消す（理由は `app/form.test.tsx` の afterEach）
afterEach(() => {
  cleanup();
  toast.dismiss();
  window.history.replaceState(null, "", "/");
});

/** 読み上げの領域の中に、その言葉が出ている数（`app/form.test.tsx` と同じ見方） */
function announced(text: string): number {
  return screen
    .queryAllByText(text)
    .filter((element) => element.closest('[aria-live="polite"]') !== null)
    .length;
}

/** Server Action の `redirect()` で、その URL へ移ったことにする */
function navigateTo(url: string) {
  window.history.pushState(null, "", url);
  searchParams.current = new URLSearchParams(window.location.search);
}

/**
 * 本物の骨組みを描く。Toaster と DoneNotice を自分で並べて描くと、
 * 骨組みから片方を外しても緑のまま通る
 */
function Shell() {
  return <AppShell email="editor@example.com">画面の中身</AppShell>;
}

describe("移った先で出す知らせ", () => {
  it("行き先の印を読んで、読み上げの領域に知らせの言葉を出す", async () => {
    navigateTo("/events?done=event-removed");

    render(<Shell />);

    await vi.waitFor(() => expect(announced("イベントを削除しました")).toBe(1));
  });

  // sonner は幅 600px 以下で `--mobile-offset-bottom`、それより広いと `--offset-bottom` を使う。
  // 下のタブは 768px 未満まで出るので、片方だけだと 601〜767px でタブに重なる
  // （レビューの指摘。700px で実測）。位置の計算は jsdom ではできないので、渡した値を見る
  it("どの幅でも、下のタブ（64px）の上に出す", async () => {
    navigateTo("/?done=stock-updated");

    render(<Shell />);
    await vi.waitFor(() => expect(announced("銘柄を更新しました")).toBe(1));

    const toaster = document.querySelector<HTMLElement>(
      "[data-sonner-toaster]",
    );
    expect(toaster?.style.getPropertyValue("--offset-bottom")).toBe("80px");
    expect(toaster?.style.getPropertyValue("--mobile-offset-bottom")).toBe(
      "80px",
    );
  });

  it("知らせを出したら、URL から印を外す（再読み込みしても出ない）", async () => {
    navigateTo("/events?done=event-removed");
    render(<Shell />);
    await vi.waitFor(() => expect(window.location.search).toBe(""));
    expect(window.location.pathname).toBe("/events");

    // 再読み込み: 今の URL のまま、骨組みを付け直す。再読み込みはトーストの置き場も
    // 空にするので、ここでも消す。残るのは URL だけで、見たいのはそこ
    cleanup();
    toast.dismiss();
    searchParams.current = new URLSearchParams(window.location.search);
    render(<Shell />);
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));

    expect(screen.queryByText("イベントを削除しました")).toBeNull();
  });

  it("骨組みを付けたまま2回移っても、2回とも知らせる", async () => {
    navigateTo("/?done=stock-updated");
    const { rerender } = render(<Shell />);
    await vi.waitFor(() => expect(announced("銘柄を更新しました")).toBe(1));
    await vi.waitFor(() => expect(window.location.search).toBe(""));

    navigateTo("/?done=theme-removed");
    rerender(<Shell />);

    await vi.waitFor(() => expect(announced("テーマを削除しました")).toBe(1));
  });

  it("表に無い印は言葉にしない", async () => {
    navigateTo("/?done=%E6%B6%88%E3%81%97%E3%81%BE%E3%81%97%E3%81%9F");

    render(<Shell />);
    await vi.waitFor(() => expect(window.location.search).toBe(""));

    expect(screen.queryByText("消しました")).toBeNull();
  });
});
