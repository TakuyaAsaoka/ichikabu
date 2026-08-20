import { readFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from ".";

// compose.yaml に書いたタグと、実際に動いている PostgreSQL の版を突き合わせる。
// 次のどれも、ここで赤くなる（Issue #131）
//   - 浮動タグ（postgres:18）に戻す
//   - ダイジェストを外す
//   - 版を書き換えたのにコンテナを作り直し忘れる（書いた版と動いている版がずれる）
describe("開発用DBのイメージのタグ", () => {
  it("版とダイジェストまで書かれていて、動いている PostgreSQL と一致する", async () => {
    const image = readFileSync("compose.yaml", "utf8").match(
      /^\s*image:\s*postgres:(\S+)$/m,
    )?.[1];
    // ダイジェストを書くと docker はタグを見ないため、両方書いてもずれうる。
    // 下の突き合わせでそのずれも捕まえる
    const version = image?.match(/^(\d+\.\d+)@sha256:[0-9a-f]{64}$/)?.[1];
    expect(version, `タグが版とダイジェストの形ではない: ${image}`).toBeDefined();

    // 戻り値は「18.4 (Debian 18.4-1.pgdg13+1)」の形。先頭の版だけを見る
    const { rows } = await db.execute<{ server_version: string }>(
      sql`SHOW server_version`,
    );
    expect(rows[0].server_version.split(" ")[0]).toBe(version);
  });
});
