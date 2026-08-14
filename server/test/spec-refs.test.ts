import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// 設計書がコードを指すとき、行番号ではなく識別子で指す（Issue #92）。
// 識別子はコードが動いても付いて回るが、消えたり名前が変わったりはする。
// そのときここが赤くなり、設計書の記述が嘘になったことがマージ前に分かる。
//
// 見るのは Issue #92 が名指しした2件だけで、docs/ 全体の行番号は見ていない
// （残りは Issue #96）。照合するのは識別子だけにする。日本語の文を照合すると、
// 言い換えただけで赤くなるうえ、文書が嘘になっても気づけない。
//
// 対象ファイルの隣に置けない検査（docs/ を見る）のため test/ に置いている。
// vitest の globalSetup を通るので、単体で流すときも開発用DBの起動が要る。
const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

// toContain だと赤のときにファイル全文が出て読めないため、真偽と文言で確かめる
const contains = (path: string, needle: string) =>
  expect(read(path).includes(needle), `${path} に ${needle} が無い`).toBe(true);

const eventFormSpec =
  "../../docs/records/specs/2026-08-09-7-admin-event-form-design.md";
const themeSpec =
  "../../docs/records/specs/2026-08-11-27-theme-registration-design.md";

describe("設計書が指しているコードが実在する", () => {
  it("フォームは Server Component で、use client は app/form.tsx にある（イベント登録の設計書 §2・テーマ登録の設計書 §4.3）", () => {
    contains(eventFormSpec, "app/form.tsx");
    contains(themeSpec, "app/form.tsx");
    // 1行目だけ見る。全文だと「use client は要らない」のような文にも当たる
    expect(read("../app/event-form.tsx").split("\n")[0]).not.toMatch(
      /use client/,
    );
    expect(read("../app/form.tsx").split("\n")[0]).toMatch(/use client/);
  });

  it("イベント登録フォームの対象欄にテーマの選択肢がある（テーマ登録の設計書 §1）", () => {
    contains(themeSpec, '`<optgroup label="テーマ">`');
    contains("../app/event-form.tsx", '<optgroup label="テーマ">');
  });
});
