# イベントの一括登録 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 管理UIの `<textarea>` にタブ区切りの行を貼り付けて、イベントをまとめて登録できるようにする。

**Architecture:** 貼り付けた文字列を `EventInput[]` にする変換（`app/bulk-event-input.ts`、純粋関数でテストできる）と、1つの取り引きでまとめて INSERT する `createEvents`（`src/db/write.ts`）に分ける。Server Action が銘柄・テーマの対応表を読んで両者をつなぐ。

**Tech Stack:** Next.js 16（App Router・Server Actions）、React 19、Drizzle ORM、PostgreSQL、Vitest

- 設計書: `docs/records/specs/2026-08-12-60-bulk-event-input-design.md`
- Issue: [#60](https://github.com/TakuyaAsaoka/ichikabu/issues/60)

## Global Constraints

- コードコメント・テストケース名・コミットメッセージは日本語。ファイル名・ディレクトリ名は英語
- コミットの件名は `[種別] 内容`。この計画では `[feat]` と `[test]` を使う
- 実行ディレクトリは `server/`
- 品質ゲート: `pnpm install && pnpm gen && pnpm build && pnpm test:run && pnpm typecheck && pnpm lint`。エラーだけでなく warning も0件にする
- 前提: 開発用DBが起動していること（`docker compose up -d --wait`）
- `as` キャストで型を偽らない。値の妥当性は DB の制約に判定させる方針を崩さない（`src/db/write.ts` の `eventValues` と同じ）
- 貼り付ける行の列は10個。並びは 名称 / 短縮ラベル / 対象 / 開始日 / 終了日 / 時刻 / 重要度 / 補足 / 出典URL / 出典の表示名

---

## File Structure

| ファイル | 役割 |
|---|---|
| `server/app/bulk-event-input.ts`（新規） | 貼り付けた文字列と対応表から `EventInput[]` を作る。エラーは行番号付きの文字列で返す。`next/headers` に触れない素のモジュールにして Vitest から読めるようにする |
| `server/app/bulk-event-input.test.ts`（新規） | 上のテスト |
| `server/src/db/write.ts`（変更） | `createEvents` を足す |
| `server/src/db/write.test.ts`（変更） | `createEvents` のテストを足す |
| `server/app/bulk-event-form.tsx`（新規） | `<textarea>` と列の並びの説明 |
| `server/app/actions.ts`（変更） | `addEvents` を足す。対応表を読む |
| `server/app/page.tsx`（変更） | 「イベントをまとめて登録」のセクションを足す |

---

## Task 1: 貼り付けた文字列を EventInput[] にする

**Files:**
- Create: `server/app/bulk-event-input.ts`
- Test: `server/app/bulk-event-input.test.ts`

**Interfaces:**
- Consumes: `EventInput`（`server/src/db/write.ts:136`）
- Produces:
  - `type Lookup = { stocks: { id: number; market: string; ticker: string }[]; themes: { id: number; name: string }[] }`
  - `function toEventInputs(text: string, lookup: Lookup): EventInput[] | string` — 成功で `EventInput[]`、失敗で日本語のエラー文

- [ ] **Step 1: 失敗するテストを書く**

`server/app/bulk-event-input.test.ts` を新規作成する。

```ts
import { describe, expect, it } from "vitest";
import { type Lookup, toEventInputs } from "./bulk-event-input";

/** 対応表。テストで使う銘柄とテーマだけを入れる */
const LOOKUP: Lookup = {
  stocks: [
    { id: 1, market: "JP", ticker: "7203" },
    { id: 2, market: "US", ticker: "AAPL" },
  ],
  themes: [{ id: 5, name: "半導体" }],
};

/** 貼り付ける1行を組み立てる。列は10個（設計書 §2） */
function rowOf(columns: Partial<Record<number, string>> = {}): string {
  const defaults = [
    "米消費者物価指数（2026年7月分）",
    "米CPI",
    "market:GLOBAL",
    "2026-08-12",
    "",
    "21:30",
    "2",
    "米東部時間 8:30 の公表を日本時間に直した時刻",
    "https://www.bls.gov/schedule/news_release/cpi.htm",
    "U.S. Bureau of Labor Statistics",
  ];
  return defaults.map((value, index) => columns[index] ?? value).join("\t");
}

describe("toEventInputs", () => {
  it("市場のイベントと銘柄のイベントを1回で読める", () => {
    // Issue #60 の「あるべき姿の出力」。値は src/db/seed-event.ts に手で入っているもの
    const text = [
      rowOf(),
      [
        "トヨタ自動車 2027年3月期 第1四半期決算",
        "7203決算",
        "stock:JP:7203",
        "2026-08-04",
        "",
        "",
        "3",
        "",
        "https://global.toyota/pages/global_toyota/ir/financial-results/2027_1q_summary_jp.pdf",
        "",
      ].join("\t"),
    ].join("\n");

    const inputs = toEventInputs(text, LOOKUP);

    expect(inputs).toEqual([
      {
        title: "米消費者物価指数（2026年7月分）",
        shortLabel: "米CPI",
        market: "GLOBAL",
        themeId: null,
        stockId: null,
        startDate: "2026-08-12",
        endDate: null,
        time: "21:30",
        importance: 2,
        note: "米東部時間 8:30 の公表を日本時間に直した時刻",
        sourceUrl: "https://www.bls.gov/schedule/news_release/cpi.htm",
        sourceName: "U.S. Bureau of Labor Statistics",
      },
      {
        title: "トヨタ自動車 2027年3月期 第1四半期決算",
        shortLabel: "7203決算",
        market: null,
        themeId: null,
        stockId: 1,
        startDate: "2026-08-04",
        endDate: null,
        time: null,
        importance: 3,
        note: null,
        sourceUrl:
          "https://global.toyota/pages/global_toyota/ir/financial-results/2027_1q_summary_jp.pdf",
        sourceName: null,
      },
    ]);
  });

  it("テーマ名で対象を指定できる", () => {
    const inputs = toEventInputs(rowOf({ 2: "theme:半導体" }), LOOKUP);

    expect(inputs).toEqual([
      expect.objectContaining({ themeId: 5, market: null, stockId: null }),
    ]);
  });

  it("同じティッカーでも市場が違えば別の銘柄として引く", () => {
    // stock の一意の制約は (market, ticker) の組（設計書 §3）
    const inputs = toEventInputs(rowOf({ 2: "stock:US:AAPL" }), LOOKUP);

    expect(inputs).toEqual([expect.objectContaining({ stockId: 2 })]);
  });

  it("空白だけの行は飛ばす", () => {
    // 貼り付けの末尾には改行が入る
    const inputs = toEventInputs(`${rowOf()}\n\n  \n`, LOOKUP);

    expect(inputs).toHaveLength(1);
  });

  it("改行コードが CRLF でも読める", () => {
    const inputs = toEventInputs(`${rowOf()}\r\n${rowOf()}\r\n`, LOOKUP);

    expect(inputs).toHaveLength(2);
  });

  it("列が10個ない行はエラー文が返る", () => {
    const inputs = toEventInputs(`${rowOf()}\n名称\t短縮\tmarket:JP`, LOOKUP);

    expect(inputs).toBe("2行目: 列が10個ない（3個）");
  });

  it("登録されていないティッカーはエラー文が返る", () => {
    const inputs = toEventInputs(rowOf({ 2: "stock:JP:9999" }), LOOKUP);

    expect(inputs).toBe("1行目: その銘柄は無い");
  });

  it("登録されていないテーマ名はエラー文が返る", () => {
    const inputs = toEventInputs(rowOf({ 2: "theme:海運" }), LOOKUP);

    expect(inputs).toBe("1行目: そのテーマは無い");
  });

  it("market・stock・theme のどれでもない対象はエラー文が返る", () => {
    const inputs = toEventInputs(rowOf({ 2: "sector:半導体" }), LOOKUP);

    expect(inputs).toBe(
      "1行目: 対象は market: / stock: / theme: のどれかで始める",
    );
  });

  it("コロンが無い対象はエラー文が返る", () => {
    const inputs = toEventInputs(rowOf({ 2: "GLOBAL" }), LOOKUP);

    expect(inputs).toBe(
      "1行目: 対象は market: / stock: / theme: のどれかで始める",
    );
  });

  it("読める行が1つも無ければエラー文が返る", () => {
    expect(toEventInputs("  \n\n", LOOKUP)).toBe("登録する行がない");
  });

  it("空欄の終了日・時刻・補足・出典は null になる", () => {
    // "" のまま date・time 列に入れると型変換エラーで500になる（設計書 §2）
    const inputs = toEventInputs(
      rowOf({ 4: "", 5: "", 7: "", 8: "", 9: "" }),
      LOOKUP,
    );

    expect(inputs).toEqual([
      expect.objectContaining({
        endDate: null,
        time: null,
        note: null,
        sourceUrl: null,
        sourceName: null,
      }),
    ]);
  });

  it("各列の前後の空白は落ちる", () => {
    const inputs = toEventInputs(
      rowOf({ 0: " 米CPIの名称 ", 2: " market:JP " }),
      LOOKUP,
    );

    expect(inputs).toEqual([
      expect.objectContaining({ title: "米CPIの名称", market: "JP" }),
    ]);
  });
});
```

- [ ] **Step 2: テストが失敗することを確かめる**

```bash
cd server && pnpm vitest run app/bulk-event-input.test.ts
```

期待: `Failed to load ./bulk-event-input`（ファイルが無い）で失敗する。

- [ ] **Step 3: 実装を書く**

`server/app/bulk-event-input.ts` を新規作成する。

```ts
import type { EventInput } from "../src/db/write";

// "use server" を付けない素のモジュールにしてある。app/actions.ts は next/headers を
// 使うため Vitest から読み込めず、ここに置いた変換だけがテストできる
// （イベント登録フォーム設計書 §5。app/event-input.ts と同じ理由）

/** ティッカー・テーマ名からIDを引くための対応表（設計書 §3） */
export type Lookup = {
  stocks: { id: number; market: string; ticker: string }[];
  themes: { id: number; name: string }[];
};

/** 貼り付ける1行の列数（設計書 §2） */
const COLUMNS = 10;

/**
 * 空欄を null に読み替える。1件ずつのフォーム（app/event-input.ts の toNullable）と
 * 同じ規則。"" のまま date・time 列に入れると、制約違反ではない型変換エラーで
 * 500 になる
 */
function toNullable(value: string): string | null {
  const text = value.trim();
  return text === "" ? null : text;
}

/** 対象の3列。ちょうど1つだけが埋まる（全体設計書 §4.2） */
type Target = {
  market: string | null;
  themeId: number | null;
  stockId: number | null;
};

/**
 * 対象の書き方（"market:GLOBAL" / "stock:JP:7203" / "theme:半導体"）を
 * event の3列に振り分ける。引けなければ日本語のエラー文を返す（設計書 §3）。
 *
 * 銘柄は市場とティッカーの2つで引く。stock の一意の制約は (market, ticker) の
 * 組で、ティッカーだけでは1件に定まらない
 */
function toTarget(value: string, lookup: Lookup): Target | string {
  // 最初のコロンだけで分ける。テーマ名にコロンが入っても読めるようにするため
  const separator = value.indexOf(":");
  const kind = value.slice(0, separator);
  const rest = value.slice(separator + 1);

  if (kind === "market") {
    // market の値は絞り込まず、生のまま DB の event_market_check に判定させる
    // （src/db/write.ts の eventValues と同じ方針）
    return { market: rest, themeId: null, stockId: null };
  }
  if (kind === "stock") {
    const [market, ticker] = rest.split(":");
    const found = lookup.stocks.find(
      (row) => row.market === market && row.ticker === ticker,
    );
    return found
      ? { market: null, themeId: null, stockId: found.id }
      : "その銘柄は無い";
  }
  if (kind === "theme") {
    const found = lookup.themes.find((row) => row.name === rest);
    return found
      ? { market: null, themeId: found.id, stockId: null }
      : "そのテーマは無い";
  }
  return "対象は market: / stock: / theme: のどれかで始める";
}

/** 貼り付けた1行を EventInput にする。読めなければ日本語のエラー文を返す */
function toInput(line: string, lookup: Lookup): EventInput | string {
  const columns = line.split("\t");
  if (columns.length !== COLUMNS) {
    return `列が${COLUMNS}個ない（${columns.length}個）`;
  }

  const target = toTarget(columns[2].trim(), lookup);
  if (typeof target === "string") {
    return target;
  }

  return {
    title: columns[0].trim(),
    shortLabel: columns[1].trim(),
    startDate: columns[3].trim(),
    endDate: toNullable(columns[4]),
    time: toNullable(columns[5]),
    importance: Number(columns[6]),
    note: toNullable(columns[7]),
    sourceUrl: toNullable(columns[8]),
    sourceName: toNullable(columns[9]),
    ...target,
  };
}

/**
 * 貼り付けた文字列を createEvents の入力にする。
 * 読めない行があれば、行番号を付けた日本語のエラー文を返す（設計書 §4）。
 *
 * 行番号は空白だけの行を除いたあとの番号。貼り付けの末尾には改行が入るため、
 * 空行を数に入れると最後の行の番号が実物とずれる
 */
export function toEventInputs(
  text: string,
  lookup: Lookup,
): EventInput[] | string {
  // 行全体は trim しない。末尾の列が空の行から末尾のタブが消えて列数が変わる
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");
  if (lines.length === 0) {
    return "登録する行がない";
  }

  const inputs: EventInput[] = [];
  for (const [index, line] of lines.entries()) {
    const input = toInput(line, lookup);
    if (typeof input === "string") {
      return `${index + 1}行目: ${input}`;
    }
    inputs.push(input);
  }
  return inputs;
}
```

- [ ] **Step 4: テストが通ることを確かめる**

```bash
cd server && pnpm vitest run app/bulk-event-input.test.ts
```

期待: 全件 PASS。

- [ ] **Step 5: コミット**

```bash
cd server && git add app/bulk-event-input.ts app/bulk-event-input.test.ts
git commit -m "$(cat <<'EOF'
[feat] 貼り付けた行をイベントの入力に変換する

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: まとめて INSERT する

**Files:**
- Modify: `server/src/db/write.ts`（末尾に追記）
- Test: `server/src/db/write.test.ts`（末尾に追記）

**Interfaces:**
- Consumes: `EventInput`・`run`・`tooLongLabel`・`eventValues`（すべて `server/src/db/write.ts` 内の既存のもの）
- Produces: `function createEvents(inputs: EventInput[]): Promise<string | null>` — 成功で `null`、失敗で行番号付きの日本語のエラー文

- [ ] **Step 1: 失敗するテストを書く**

`server/src/db/write.test.ts` の末尾に足す。`createEvents` を先頭の import に加える。

```ts
describe("createEvents", () => {
  /** 市場イベントの入力を作る。対象は market の1列だけ */
  function marketEvent(overrides: Partial<EventInput> = {}): EventInput {
    return {
      title: "米消費者物価指数（2026年7月分）",
      shortLabel: "米CPI",
      startDate: "2026-08-12",
      endDate: null,
      time: "21:30",
      importance: 2,
      note: null,
      sourceUrl: "https://www.bls.gov/schedule/news_release/cpi.htm",
      sourceName: "U.S. Bureau of Labor Statistics",
      market: "GLOBAL",
      themeId: null,
      stockId: null,
      ...overrides,
    };
  }

  it("複数のイベントをまとめて登録できる", async () => {
    expect(
      await createEvents([
        marketEvent(),
        marketEvent({ title: "米雇用統計（2026年8月分）", startDate: "2026-09-04" }),
      ]),
    ).toBeNull();

    expect(await db.select().from(event)).toHaveLength(2);
  });

  it("1行でも制約に反すると1件も入らない", async () => {
    // 2件目の重要度が範囲外。1件目は正しいが、取り引きごと戻る（設計書 §4）
    expect(
      await createEvents([marketEvent(), marketEvent({ importance: 9 })]),
    ).toBe("2行目: 重要度は1〜3");

    expect(await db.select().from(event)).toHaveLength(0);
  });

  it("短縮ラベルが長すぎる行があると1件も入らない", async () => {
    // DB の制約ではなくアプリ側で判定するものでも取り引きが戻る
    expect(
      await createEvents([
        marketEvent(),
        marketEvent({ shortLabel: "長すぎる短縮ラベル" }),
      ]),
    ).toBe("2行目: 短縮ラベルは全角5文字まで");

    expect(await db.select().from(event)).toHaveLength(0);
  });

  it("存在しない銘柄を指した行があると1件も入らない", async () => {
    expect(
      await createEvents([
        marketEvent(),
        marketEvent({ market: null, stockId: 999 }),
      ]),
    ).toBe("2行目: その銘柄は無い");

    expect(await db.select().from(event)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: テストが失敗することを確かめる**

```bash
cd server && pnpm vitest run src/db/write.test.ts -t createEvents
```

期待: `createEvents is not a function` またはインポートの解決に失敗して FAIL。

- [ ] **Step 3: 実装を書く**

`server/src/db/write.ts` の末尾に足す。

```ts
/**
 * まとめて登録の途中で失敗したことを表す。
 * 取り引きの中から投げると Drizzle が ROLLBACK する
 */
class BulkFailure extends Error {}

/**
 * イベントをまとめて登録する。成功で null、失敗で行番号付きの日本語のエラー文を返す。
 *
 * **1行でも失敗したら1件も入れない**（設計書 §4）。一部だけ入った状態は、
 * 何が入って何が入らなかったのかを運用者が確かめられず、貼り直すと二重に入る。
 *
 * 1行ずつ INSERT する。まとめて1回の INSERT にすると、どの行が失敗したかが
 * 分からず行番号を出せない。貼り付ける行数はせいぜい数十で、1行ずつでも問題にならない
 */
export async function createEvents(
  inputs: EventInput[],
): Promise<string | null> {
  try {
    await db.transaction(async (tx) => {
      for (const [index, input] of inputs.entries()) {
        const message =
          tooLongLabel(input.shortLabel) ??
          (await run(tx.insert(event).values(eventValues(input))));
        if (message) {
          throw new BulkFailure(`${index + 1}行目: ${message}`);
        }
      }
    });
  } catch (error) {
    // 途中で失敗したときの文言はここで取り出す。それ以外の例外は投げ直す
    if (error instanceof BulkFailure) {
      return error.message;
    }
    throw error;
  }
  return null;
}
```

`tx.rollback()` ではなく自前の例外を投げる。`tx.rollback()` も例外を投げて取り引きを戻すが、失敗の文言を取り引きの外へ運ぶのに関数の外の変数が要り、TypeScript が閉包の中の代入を追えない形になる。例外に文言を持たせれば `as` を使わずに済む（Global Constraints）。

- [ ] **Step 4: テストが通ることを確かめる**

```bash
cd server && pnpm vitest run src/db/write.test.ts
```

期待: `createEvents` の4件を含め全件 PASS。既存のテストも落ちない。

- [ ] **Step 5: 型検査を通す**

```bash
cd server && pnpm typecheck
```

期待: エラー0件。

- [ ] **Step 6: コミット**

```bash
cd server && git add src/db/write.ts src/db/write.test.ts
git commit -m "$(cat <<'EOF'
[feat] イベントを1つの取り引きでまとめて登録できるようにする

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: 画面と Server Action

**Files:**
- Create: `server/app/bulk-event-form.tsx`
- Modify: `server/app/actions.ts`（末尾に追記＋import）
- Modify: `server/app/page.tsx`（import と JSX）

**Interfaces:**
- Consumes: `toEventInputs`・`Lookup`（Task 1）、`createEvents`（Task 2）、`ActionForm`・`field`・`fieldLabel`（`server/app/form.tsx`）
- Produces: `function addEvents(previous: string | null, formData: FormData): Promise<string | null>`、`function BulkEventForm(): ReactElement`

- [ ] **Step 1: Server Action を書く**

`server/app/actions.ts` を変える。

import に足す（`src/db/write` の import に `createEvents` を、新しく `db` と `stock`・`theme` を読む）。

```ts
import { db } from "../src/db";
import { stock, theme } from "../src/db/schema";
import {
  createEvent,
  createEvents,
  createHolding,
  createStock,
  createTheme,
  createThemeStock,
  deleteEvent,
  updateEvent,
} from "../src/db/write";
import { toEventInputs } from "./bulk-event-input";
import { toEventInput } from "./event-input";
```

末尾に足す。

```ts
/**
 * イベントをまとめて登録する。戻り値は失敗したときのエラー文で、useActionState の状態になる。
 *
 * 対象はティッカーとテーマ名で書くため、IDを引くための対応表をここで読む（設計書 §3）。
 * 行ごとに問い合わせず、2回の読み出しで済ませる
 */
export async function addEvents(
  _previous: string | null,
  formData: FormData,
): Promise<string | null> {
  await requireUserId();

  const [stocks, themes] = await Promise.all([
    db
      .select({ id: stock.id, market: stock.market, ticker: stock.ticker })
      .from(stock),
    db.select({ id: theme.id, name: theme.name }).from(theme),
  ]);

  const inputs = toEventInputs(String(formData.get("rows") ?? ""), {
    stocks,
    themes,
  });
  if (typeof inputs === "string") {
    return inputs;
  }

  const message = await createEvents(inputs);
  if (message) {
    return message;
  }

  revalidatePath("/");
  return null;
}
```

- [ ] **Step 2: フォームを書く**

`server/app/bulk-event-form.tsx` を新規作成する。

```tsx
import { addEvents } from "./actions";
import { ActionForm, field, fieldLabel } from "./form";

/** 貼り付ける行の見本。タブ区切りで、終了日と補足は空にしてある（設計書 §5） */
const SAMPLE = [
  "米消費者物価指数（2026年7月分）",
  "米CPI",
  "market:GLOBAL",
  "2026-08-12",
  "",
  "21:30",
  "2",
  "",
  "https://www.bls.gov/schedule/news_release/cpi.htm",
  "U.S. Bureau of Labor Statistics",
].join("\t");

/**
 * イベントの一括登録フォーム。タブ区切りの行を貼り付ける（設計書 §5）。
 * スプレッドシートからのコピーがそのままタブ区切りになる
 */
export function BulkEventForm() {
  return (
    <ActionForm action={addEvents} submitLabel="まとめて登録">
      <label className={fieldLabel}>
        貼り付け（1行に1件。タブ区切り）
        <textarea
          name="rows"
          required
          rows={6}
          placeholder={SAMPLE}
          className={field}
        />
      </label>
      <p className="text-muted text-sm">
        列の並び: 名称 / 短縮ラベル / 対象 / 開始日 / 終了日 / 時刻 / 重要度 /
        補足 / 出典URL / 出典の表示名。
        対象は market:GLOBAL・stock:JP:7203・theme:半導体 のように書く。
        1行でも読めないものがあると1件も登録しない
      </p>
    </ActionForm>
  );
}
```

- [ ] **Step 3: 管理画面に置く**

`server/app/page.tsx` を変える。

import に足す。

```tsx
import { BulkEventForm } from "./bulk-event-form";
```

「イベントを登録」のセクション（`app/page.tsx:167-175`）の直後に足す。

```tsx
      <section className="flex flex-col gap-3">
        <h2 className="text-base font-bold">イベントをまとめて登録</h2>
        <BulkEventForm />
      </section>
```

- [ ] **Step 4: ビルドと型検査と静的解析を通す**

```bash
cd server && pnpm build && pnpm typecheck && pnpm lint
```

期待: エラー0件、warning 0件。

- [ ] **Step 5: 目視で確かめる**

```bash
cd server && pnpm dev
```

設計書 §8 の手順を実行する。

1. サインインする
2. 「イベントをまとめて登録」に、市場のイベント1行と銘柄のイベント1行を貼って登録する（銘柄の行は、画面の銘柄一覧にあるティッカーを使う）
3. 一覧に2件増えることを見る
4. 2行目のティッカーを実在しないものに変えて貼り、「2行目: その銘柄は無い」が出ることと、**一覧が増えていないこと**を見る
5. 1行目の重要度を `9` にして貼り、「1行目: 重要度は1〜3」が出ることを見る

- [ ] **Step 6: コミット**

```bash
cd server && git add app/bulk-event-form.tsx app/actions.ts app/page.tsx
git commit -m "$(cat <<'EOF'
[feat] 管理UIからイベントをまとめて登録できるようにする

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: 品質ゲートと Issue の検証

**Files:** 変更なし（落ちたら該当ファイルを直す）

- [ ] **Step 1: Issue #60 の検証を走らせる**

```bash
cd server && grep -rn 'createEvents\|bulk\|一括' app src scripts; echo "grep_exit=$?"; pnpm vitest run app/bulk-event-input.test.ts 2>&1 | tail -6
```

期待（Issue #60 の「あるべき姿の出力」）: `grep_exit=0` で `app/bulk-event-input.ts` などがヒットし、テストが PASS する。

- [ ] **Step 2: 品質ゲートを全部走らせる**

```bash
cd server && pnpm install && pnpm gen && pnpm build && pnpm test:run && pnpm typecheck && pnpm lint
```

期待: すべてエラー0件・warning 0件。落ちたら直して再実行する。

- [ ] **Step 3: 最新の main を取り込む**

```bash
git fetch origin main && git merge origin/main
```

- [ ] **Step 4: コードレビューを受ける**

`superpowers:requesting-code-review` を使い、Critical・Important が0件になるまで直す。
