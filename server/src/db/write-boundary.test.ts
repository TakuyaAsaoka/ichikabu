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

describe("src/db/write の書き込み関数を呼べるファイル", () => {
  it("記録を差し込んだ2つだけ", () => {
    // git が追跡しているファイルだけを見る。ビルド成果物や生成物は入らない
    const tracked = execFileSync("git", ["ls-files", "*.ts", "*.tsx"], {
      cwd: `${import.meta.dirname}/../..`,
      encoding: "utf8",
    })
      .split("\n")
      .filter((path) => path !== "" && !path.endsWith(".test.ts"));

    const callers = tracked.filter((path) => {
      const source = readFileSync(
        `${import.meta.dirname}/../../${path}`,
        "utf8",
      );
      return [...source.matchAll(WRITE_IMPORT)].some(([, clause]) =>
        importsWriteFunction(clause),
      );
    });

    expect(callers.sort()).toEqual([...ALLOWED].sort());
  });
});
