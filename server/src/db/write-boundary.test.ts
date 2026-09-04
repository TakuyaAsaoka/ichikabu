import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * 書き込み関数を呼んでよいファイルの一覧（監査ログ設計書 §5.2）。
 *
 * 監査ログの記録は `app/actions.ts` と `scripts/import-stat-schedule.ts` の
 * 2箇所に差し込んである。3つ目の経路が増えると、その経路の書き込みは
 * どこにも記録が残らないまま実データを変える。**そのときここが落ちる。**
 *
 * 増やすときは、記録を差し込んでからこの一覧に足すこと。
 */
const ALLOWED = ["app/actions.ts", "scripts/import-stat-schedule.ts"];

/**
 * `src/db/write.ts` を通さずにDBへ直接書いてよいファイル。
 *
 * 上の一覧だけでは足りない。`write.ts` を読み込まずに `db.insert(...)` を
 * 直に書けば、記録も上の判定も素通りする。
 *
 * | ファイル | 直に書く理由 |
 * |---|---|
 * | `src/db/write.ts` | 書き込みの層そのもの |
 * | `src/db/audit.ts` | `audit_log` に書く唯一のファイル |
 * | `src/db/seed-event.ts` | 開発用データ。固定値を入れるだけで記録しない（設計書 §5.2） |
 * | `src/db/seed-user.ts` | 利用者の投入。Better Auth のフックを通さない経路（設計書 §9） |
 */
const ALLOWED_DIRECT_WRITERS = [
  "src/db/audit.ts",
  "src/db/seed-event.ts",
  "src/db/seed-user.ts",
  "src/db/write.ts",
];

/**
 * 書き込み関数ではない値の export。読み込んでも実データは変わらないため、
 * どのファイルから読んでもよい（`isId` は `app/guard.ts` が URL のIDの判定に使う）
 */
const READ_ONLY_EXPORTS = ["isId"];

/**
 * `import ... from "...db/write"` の取り出し。改行をまたぐ形も拾う。
 *
 * 取り出す中身に `"` を許さない。許すと1つ前の import 文の先頭から
 * この import 文の末尾までが1つの当たりになり、`isId` だけを読む画面が
 * 手前の行の import 文を巻き込んで書き込み側と判定される（実測）
 */
const WRITE_IMPORT = /import\s+([^"]*?)\s+from\s+"[^"]*db\/write"/g;

/**
 * DBへ直接書く呼び出し。取り引きの `tx.insert(...)` も同じ形で拾う。
 * 整形で `db` と `.insert(` の間に改行が入るため、空白をまたいで拾う。
 * `execute` も入れる。生のSQLは insert・update・delete の抜け道になる。
 *
 * 名前の後ろに `(` を求めない。`db.execute<{ conname: string }>(sql`...`)` の
 * ように型を書く形がこのリポジトリの書き方で（`src/db/schema.test.ts`）、
 * `(` を求めると素通りする。これらの名前は呼び出す以外に使い道が無い。
 *
 * **拾えるのは `db` か `tx` に直に書いた形だけ。** 別名に付け替える、
 * 取り引きの引数を `tx` 以外の名前にする、といった避け方は見ていない。
 * **うっかり増えた3つ目の経路を鳴らすためのもの**で、意図して避ける相手を
 * 止めるものではない
 */
const DIRECT_WRITE = /\b(?:db|tx)\b\s*\.\s*(?:insert|update|delete|execute)\b/;

/**
 * `src/db/write.ts` の関数のうち、行を消すもの。**名前ではなく中身で見分ける。**
 *
 * 名前の頭が `delete` かで決めると、`deleteTheme` を `purgeTheme` に改名した
 * だけで見張りが1本黙って減り、その関数を呼ぶ Server Action から
 * `adminOnly` が落ちても緑のまま通る（実測）。改名は日常の書き直しで起き、
 * 減ったことは誰にも知らされない。本文の `.delete(` は改名しても残る。
 * `db` と `tx` の書き方は上の `DIRECT_WRITE` と揃えてある
 */
function deleteFunctions(source: string): string[] {
  return source
    .split("\nexport ")
    .slice(1)
    .filter((block) => /\b(?:db|tx)\s*\.\s*delete\(/.test(block))
    .map((block) => /function (\w+)/.exec(block)?.[1] ?? "");
}

/**
 * `app/actions.ts` の `export const` を1本ずつ、名前と中身の組にして切り出す。
 *
 * 終わりを `\n);` で探さない。`addEvents` は `});` で終わるため、そこで閉じずに
 * 次の `export const` の末尾まで1つの当たりになり、隣の `adminOnly: true` を
 * 飲み込む（実測）。上の `WRITE_IMPORT` が同じ形の事故を1度踏んでいる。
 * 次の `export const` までを中身にすれば起きない
 */
function exportedActions(source: string): [string, string][] {
  return source
    .split("\nexport const ")
    .slice(1)
    .map((block) => [block.split(/\W/)[0], block]);
}

/**
 * 1つの import 文が書き込み関数を値として読み込んでいるかを判定する。
 * `import type { EventInput }` と、`{ type StockInput, createEvent }` の
 * 内側の `type` の両方を落とす
 */
function importsWriteFunction(clause: string): boolean {
  if (clause.startsWith("type ")) {
    return false;
  }
  const names = clause
    .replace(/[{}]/g, "")
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name !== "" && !name.startsWith("type "));
  return names.some((name) => !READ_ONLY_EXPORTS.includes(name));
}

/**
 * git が追跡している、配信されるコードの本文。
 * ビルド成果物や生成物は入らない。テストと `test/` の下も外す
 * （`test/helpers.ts` は全テーブルを空にする生のSQLを流すが、それは検査の仕掛け）
 */
function trackedSources(): Map<string, string> {
  const root = `${import.meta.dirname}/../..`;
  const paths = execFileSync("git", ["ls-files", "*.ts", "*.tsx"], {
    cwd: root,
    encoding: "utf8",
  })
    .split("\n")
    .filter(
      (path) =>
        path !== "" && !/\.test\.tsx?$/.test(path) && !path.startsWith("test/"),
    );
  return new Map(
    paths.map((path) => [path, readFileSync(`${root}/${path}`, "utf8")]),
  );
}

describe("書き込みの経路", () => {
  it("src/db/write の書き込み関数を呼べるのは記録を差し込んだ2つだけ", () => {
    const callers = [...trackedSources()]
      .filter(([, source]) =>
        [...source.matchAll(WRITE_IMPORT)].some(([, clause]) =>
          importsWriteFunction(clause),
        ),
      )
      .map(([path]) => path);

    expect(callers.sort()).toEqual([...ALLOWED].sort());
  });

  it("DBへ直に書けるのは書き込みの層と記録と投入だけ", () => {
    const writers = [...trackedSources()]
      .filter(([, source]) => DIRECT_WRITE.test(source))
      .map(([path]) => path);

    expect(writers.sort()).toEqual([...ALLOWED_DIRECT_WRITERS].sort());
  });

  it("削除を呼ぶ Server Action には adminOnly が付いている", () => {
    // `app/actions.test.ts` は削除4本を名前で並べて「管理者でなければ拒まれる」を
    // 見ているが、一覧に載っていない5本目が増えたときは何も鳴らない。
    // 実際、`adminOnly` の無い13本目を足しても全件が緑のまま通った（Issue #150 で実測）。
    //
    // ここは動かさずに文字として見る。走らせて見る形（export を全部たどり、
    // 管理者でない人で叩いて削除が起きないことを見る）も書いて比べたが、
    // 削除の前に条件がある1本を緑のまま通した（`formData.get("confirm") !== "yes"`
    // で先に戻る形。実測）。**削除の呼び出しが在ることは、走らせなくても見える。**
    //
    // 見ているのは呼び出しが在るかどうかだけで、次の2つは素通りする。
    // どちらも隣の11本と違う書き方をわざわざ選んだときにしか出ない形で、
    // このファイルの `DIRECT_WRITE` と同じく**うっかり増えた1本を鳴らすためのもの**。
    //
    // | 素通りする書き方 | |
    // |---|---|
    // | 削除の中身を `app/actions.ts` の中の別の `const` に出す | 塊の外へ出るため |
    // | `import { deleteStock as dropStock }` と別名を付ける | 名前が変わるため |
    const sources = trackedSources();

    // どれが削除かは `src/db/write.ts` から取る。ここに名前を書き写すと、
    // 削除を1本足す人が書き写しの側も直すことになり、書き忘れで素通りする
    const deletes = deleteFunctions(sources.get("src/db/write.ts") ?? "");
    expect(deletes.length).toBeGreaterThan(0);

    const missing = exportedActions(sources.get("app/actions.ts") ?? "")
      .filter(([, body]) => deletes.some((name) => body.includes(`${name}(`)))
      .filter(([, body]) => !body.includes("adminOnly: true"))
      .map(([name]) => name);

    expect(missing).toEqual([]);
  });

  it("書き込み関数を呼ぶ2つから record( の呼び出しが消えていない", () => {
    // 呼べる場所を絞っても、そこで record() を呼ばなければ記録は残らない。
    // scripts/import-stat-schedule.ts はテストから叩けない（読み込んだ時点で
    // XML を取りに行く）ため、ここは**文字として在ることだけ**を判定する。
    // 呼び出しをコメントにする・戻り値を捨てる、といった壊し方は素通りする
    const sources = trackedSources();
    for (const path of ALLOWED) {
      expect(sources.get(path)).toMatch(/\brecord\(/);
    }
  });
});
