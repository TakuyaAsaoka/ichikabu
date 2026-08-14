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
 * どのファイルから読んでもよい（`isId` は画面5つが URL のIDの判定に使う）
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
 * **拾えるのは `db` か `tx` に直に書いた形だけ。** 別名に付け替える、
 * 取り引きの引数を `tx` 以外の名前にする、といった避け方は見ていない。
 * **うっかり増えた3つ目の経路を鳴らすためのもの**で、意図して避ける相手を
 * 止めるものではない
 */
const DIRECT_WRITE = /\b(?:db|tx)\b\s*\.\s*(?:insert|update|delete|execute)\(/;

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
        path !== "" && !path.endsWith(".test.ts") && !path.startsWith("test/"),
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
