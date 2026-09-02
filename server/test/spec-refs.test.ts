import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// 設計書がコードを指すとき、行番号ではなく識別子で指す（Issue #92）。
// 識別子はコードが動いても付いて回るが、消えたり名前が変わったりはする。
// そのときここが赤くなり、設計書の記述が嘘になったことがマージ前に分かる。
//
// 照合するのは識別子だけにする。日本語の文を照合すると、言い換えただけで赤くなる
// うえ、文書が嘘になっても気づけない。そのため Issue #96 では、設計書が日本語の
// 文（見出し・注記）で指していた2箇所を、隣の識別子（`EventForm`・
// `requireSession`）を指す形に書き換えた。**ここが見ているのはそのうち
// `requireSession` だけ**で、`EventForm` を入れない理由は下の3つ目の箇条書き。
//
// 「改名すれば typecheck が落ちるから、ここで見るのは重複」ではない。呼び出し元まで
// 揃えて改名すると typecheck は緑のまま通り、設計書だけが嘘になる（2026-08-15 実測）。
//
// 対象ファイルの隣に置けない検査（docs/ を見る）のため test/ に置いている。
// vitest の globalSetup を通るので、単体で流すときも開発用DBの起動が要る。
const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

// toContain だと赤のときにファイル全文が出て読めないため、真偽と文言で確かめる
const contains = (path: string, needle: string) =>
  expect(read(path).includes(needle), `${path} に ${needle} が無い`).toBe(true);

// 設計書の側は、識別子の前後が英数字・アンダースコアでないことまで見る。
// 部分一致だと `upsertMarketEvents` を `upsertMarketEventsRenamed` に書き換えても
// 緑のまま通る（2026-08-15 に実測）
const hasIdentifier = (path: string, name: string) =>
  expect(
    new RegExp(`\\b${name}\\b`).test(read(path)),
    `${path} に識別子 ${name} が無い`,
  ).toBe(true);

const eventFormSpec =
  "../../docs/records/specs/2026-08-09-7-admin-event-form-design.md";
const themeSpec =
  "../../docs/records/specs/2026-08-11-27-theme-registration-design.md";

describe("設計書が指しているコードが実在する", () => {
  it("フォームは Server Component で、use client は app/form.tsx にある（イベント登録の設計書 §2・テーマ登録の設計書 §4.3）", () => {
    contains(eventFormSpec, "app/form.tsx");
    contains(themeSpec, "app/form.tsx");
    // 行頭固定で見る。全文照合だと「use client は要らない」のような文にも当たり、
    // 1行目だけだと "use client" の前にコメントが入った形を見逃す
    for (const form of ["event-form", "theme-form", "theme-stock-form"]) {
      expect(read(`../app/${form}.tsx`)).not.toMatch(/^"use client"/m);
    }
    expect(read("../app/form.tsx")).toMatch(/^"use client"/m);
  });

  it("イベント登録フォームの対象欄にテーマの選択肢がある（テーマ登録の設計書 §1）", () => {
    contains(themeSpec, '<optgroup label="テーマ">');
    contains("../app/event-form.tsx", '<optgroup label="テーマ">');
  });

  // Issue #96。設計書がコードを指す7箇所から行番号を外し、識別子に直した。
  // ここに並ぶのは、そのうち今も実在するコードを指している3件（設計書のみ）。
  // 残り4件を入れない理由:
  // - 完了した手順書（Issue #60 のもの）の中の2件（`EventInput` と `EventForm`）は、
  //   実行済みの作業の記録。
  //   消すときは記録ごと消えるべきものを、生きた検査で固定しない。
  //   **その手順書は Issue #137 で実際に消えた。** ここに入れていたら、そのとき
  //   指し先を失って赤くなっていた
  // - kabu-legends の引用は別リポジトリで、隣にチェックアウトが無い手元では必ず赤くなる
  // - `TokenStore.swift` は #88（PR #99）で削除済みで、指し先が無い
  //
  // iOS の Swift を server のテストが読んでいる。docs/ を見る検査がここにしか無く、
  // かつ #99 が `TokenStore.swift` を消したとき設計書は誰にも直されなかったため
  // （それが Issue #96 の7件目）、消えたら鳴る場所を1つ持たせている。
  // コード側は宣言の形で見る。名前だけで見ると、`src/db/write.ts` の
  // `// upsertMarketEvents が同じ event の行に重なる` というコメントに当たり、
  // 宣言を改名しても緑のまま通る（2026-08-15 に実測）。
  // `decl` は名前の次の1文字（`(` か `:`）まで必ず入れる。名前で切ると、
  // `baseURL` → `baseURLRenamed` のように後ろへ足す改名を素通しする（同日に実測）
  const specRefs = [
    {
      spec: "../../docs/records/specs/2026-08-13-74-deploy-target-design.md",
      code: "../../ios/Ichikabu/APIClient.swift",
      name: "baseURL",
      decl: "static let baseURL:",
      section: "配信先の設計書 §6",
    },
    {
      spec: "../../docs/records/specs/2026-08-14-82-multi-editor-audit-design.md",
      code: "../src/db/write.ts",
      name: "upsertMarketEvents",
      decl: "export async function upsertMarketEvents(",
      section: "監査ログの設計書 §5.2",
    },
    {
      spec: "../../docs/records/specs/2026-08-14-82-multi-editor-audit-design.md",
      code: "../app/actions.ts",
      name: "requireSession",
      decl: "async function requireSession(",
      section: "監査ログの設計書 §4",
    },
    {
      spec: "../../docs/records/specs/2026-08-15-110-admin-status-screen-design.md",
      code: "../src/status.ts",
      name: "findGaps",
      decl: "export async function findGaps(",
      section: "状態画面の設計書 §2",
    },
    {
      spec: "../../docs/records/specs/2026-08-16-112-split-admin-screens-design.md",
      code: "../app/nav.tsx",
      name: "Nav",
      decl: "export function Nav(",
      section: "管理画面を分ける設計書 §3",
    },
    {
      spec: "../../docs/records/specs/2026-08-16-112-split-admin-screens-design.md",
      code: "../src/db/audit.ts",
      name: "creatorNamesByEventId",
      decl: "export async function creatorNamesByEventId(",
      section: "管理画面を分ける設計書 §4",
    },
    {
      spec: "../../docs/records/specs/2026-08-16-112-split-admin-screens-design.md",
      code: "../src/db/audit.ts",
      name: "countByUser",
      decl: "export async function countByUser(",
      section: "管理画面を分ける設計書 §5",
    },
    {
      spec: "../../docs/records/specs/2026-08-16-112-split-admin-screens-design.md",
      code: "../test/render-page.ts",
      name: "redirectedTo",
      decl: "export async function redirectedTo(",
      section: "管理画面を分ける設計書 §6",
    },
    {
      spec: "../../docs/records/specs/2026-08-16-118-public-api-cache-design.md",
      code: "../src/cache.ts",
      name: "PUBLIC_API_CACHE_HEADERS",
      decl: "export const PUBLIC_API_CACHE_HEADERS = {",
      section: "公開APIのキャッシュ 設計書 §2",
    },
    {
      spec: "../../docs/records/specs/2026-08-16-118-public-api-cache-design.md",
      code: "../test/helpers.ts",
      name: "expectPublicApiCacheHeaders",
      decl: "export function expectPublicApiCacheHeaders(",
      section: "公開APIのキャッシュ 設計書 §6",
    },
  ];

  for (const { spec, code, name, decl, section } of specRefs) {
    it(`設計書が名指しする ${name} が ${code.split("/").pop()} にある（${section}）`, () => {
      hasIdentifier(spec, name);
      contains(code, decl);
    });
  }
});
