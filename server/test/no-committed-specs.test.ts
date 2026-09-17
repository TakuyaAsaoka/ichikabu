import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// spec（docs/records の specs）と plan（同じく plans）は作業中だけ使い、コミットしない
// （~/.claude/CLAUDE.md「ドキュメント配置ルール」。Issue #169）。
// 決まりはコードの隣のコメント・CLAUDE.md・docs/reference・docs/guides に書く。
//
// .gitignore だけでは足りない。`git add -f` は通り、brainstorming のスキルは spec の
// コミットまで指示する。spec を指すコメントも、spec を消した日に行き先を失ったのに
// エラーにならず残る（消す前に 325 行あった）。そのためここで2つとも見る。
//
// 対象外になった経路を1つ書いておく。「設計の §3」のように言い換えた参照は拾えない。
const root = `${import.meta.dirname}/../..`;
const self = "server/test/no-committed-specs.test.ts";

const git = (...args: string[]) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8" })
    .split("\n")
    .filter(Boolean);

describe("spec と plan をコミットしない", () => {
  it("docs/records/specs と docs/records/plans に追跡しているファイルが無い", () => {
    expect(git("ls-files", "docs/records/specs", "docs/records/plans")).toEqual(
      [],
    );
  });

  it("spec を指す語とパスがどのファイルにも無い", () => {
    // まだ add していないファイルも読む。追跡しているファイルだけを見ると、
    // 新しく足したファイルがコミットの後で初めて赤くなる
    const files = git(
      "ls-files",
      "--cached",
      "--others",
      "--exclude-standard",
    ).filter(
      (path) =>
        path !== self &&
        // .gitignore は置き場の名前を書く場所で、spec を指していない
        path !== ".gitignore" &&
        !path.startsWith("docs/records/") &&
        // 手元で消してまだ add していないファイルは、追跡の一覧に残るが読めない
        existsSync(`${root}/${path}`),
    );
    const found = files.flatMap((path) =>
      readFileSync(`${root}/${path}`, "utf8")
        .split("\n")
        .flatMap((line, i) =>
          /設計書|records\/(specs|plans)\//.test(line)
            ? [`${path}:${i + 1}: ${line.trim()}`]
            : [],
        ),
    );
    expect(found).toEqual([]);
  });
});
