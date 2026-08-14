import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// 設計書がコードを指すとき、行番号ではなく識別子で指す（Issue #92）。
// 識別子はコードが動いても付いて回るが、消えたり名前が変わったりはする。
// そのときここが赤くなり、設計書の記述が嘘になったことがマージ前に分かる。
const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

// toContain だと赤のときにファイル全文が出て読めないため、真偽と文言で確かめる
const contains = (path: string, needle: string) =>
  expect(read(path).includes(needle), `${path} に ${needle} が無い`).toBe(true);
const lacks = (path: string, needle: string) =>
  expect(read(path).includes(needle), `${path} に ${needle} がある`).toBe(
    false,
  );

const eventFormSpec =
  "../../docs/records/specs/2026-08-09-7-admin-event-form-design.md";
const themeSpec =
  "../../docs/records/specs/2026-08-11-27-theme-registration-design.md";

describe("設計書が指しているコードが実在する", () => {
  it("イベント登録フォームは Server Component で、use client は app/form.tsx にある（イベント登録の設計書 §2）", () => {
    contains(eventFormSpec, '"use client" は app/form.tsx にある');
    lacks("../app/event-form.tsx", '"use client"');
    contains("../app/form.tsx", '"use client"');
  });

  it("イベント登録フォームの対象欄にテーマの選択肢がある（テーマ登録の設計書 §1）", () => {
    contains(themeSpec, '`<optgroup label="テーマ">`');
    contains("../app/event-form.tsx", '<optgroup label="テーマ">');
  });
});
