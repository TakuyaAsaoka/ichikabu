import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "../src/db";

// 見ているのが compose.yaml で src/ の隣に置けないため、ここに置く（spec-refs.test.ts と同じ）。
// 位置はこのファイルから決める。process.cwd() に頼ると server/ 以外から起動したときに落ちる
const composeImage = readFileSync(
  new URL("../compose.yaml", import.meta.url),
  "utf8",
).match(/^\s*image:\s*(\S+)$/m)?.[1];

/** 開発用DBのコンテナ名。compose のプロジェクト名がどのWorktreeでも server になる（CLAUDE.md） */
const CONTAINER = "server-db-1";

describe("開発用DBのイメージ", () => {
  it("compose.yaml に版とダイジェストまで書かれている", () => {
    // 浮動タグ（postgres:18）に戻すと、docker compose pull のたびに中身が変わりうる
    expect(composeImage).toMatch(/^postgres:\d+\.\d+@sha256:[0-9a-f]{64}$/);
  });

  it("動いているコンテナが compose.yaml のイメージで作られている", () => {
    // 書き換えたあとコンテナを作り直し忘れると、動いているのは古いイメージのまま。
    // 版を変えずにダイジェストだけ書き換えた場合も、版を見るだけでは分からないのでここで見る
    const running = execFileSync(
      "docker",
      ["inspect", CONTAINER, "--format", "{{.Config.Image}}"],
      { encoding: "utf8" },
    ).trim();
    expect(running).toBe(composeImage);
  });

  it("動いている PostgreSQL の版が compose.yaml のタグと一致する", async () => {
    // ダイジェストを書くと docker はタグを見ないため、別の版のダイジェストを
    // 貼っても黙って動く。実際に動いている版と突き合わせて気づく
    const tag = composeImage?.match(/^postgres:(\d+\.\d+)@/)?.[1];
    // 戻り値は「18.4 (Debian 18.4-1.pgdg13+1)」の形。先頭の版だけを見る
    const { rows } = await db.execute<{ server_version: string }>(
      sql`SHOW server_version`,
    );
    expect(rows[0].server_version.split(" ")[0]).toBe(tag);
  });
});
