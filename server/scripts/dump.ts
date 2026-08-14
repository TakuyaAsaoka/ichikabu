import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync } from "node:fs";
import { dumpFileName, hasEventRows } from "../src/db/dump";

const url = process.env.DATABASE_URL;

if (!url) {
  throw new Error("DATABASE_URL が設定されていない。.env.example を参照");
}

// PATH の pg_dump は Homebrew の postgresql@14（14.9）で、開発用DB（18）にも
// 本番の Supabase にも「server version mismatch」で断られる。pg_dump は自分より
// 新しいサーバーを扱えないため、18系を直接指す。opt/ の下は Homebrew が張り替える
// 別名なので、18.3 → 18.4 の更新でこのパスは変わらない。PostgreSQL 19 に上げた
// ときは同じ mismatch で止まるので、そのとき 19 に書き換える
const pgDump = "/opt/homebrew/opt/postgresql@18/bin/pg_dump";

if (!existsSync(pgDump)) {
  throw new Error(
    `${pgDump} が無い。\`brew install postgresql@18\` を実行する`,
  );
}

// パスワードは引数ではなく PGPASSWORD で渡す。引数に入れると実行中は ps に見え、
// pg_dump が失敗したときに Node が出すエラー文（実行したコマンドの全文が入る）に
// 本番のパスワードがそのまま残る
const conn = new URL(url);
const { password } = conn;
conn.password = "";

const out = `backups/${dumpFileName(url, new Date())}`;
// 中身を確かめるまでは .part に書く。空のダンプが本番の名前で backups/*.sql に
// 並ぶと、後から中身を見ずに戻してしまう
const partial = `${out}.part`;

mkdirSync("backups", { recursive: true });
console.log(`接続先: ${conn.host}`);

// --data-only: テーブルの定義は server/drizzle/ にあり、戻すときは pnpm db:migrate
//   で作る。定義を入れると、Supabase のプロジェクトへ戻すときに向こうに元からある
//   ものとぶつかって止まる
// -n public: Supabase のプロジェクトには auth・storage 等のスキーマが最初から入って
//   いる。指定しないと、そちらのデータまでダンプに入る
execFileSync(
  pgDump,
  ["--data-only", "-n", "public", "-f", partial, conn.toString()],
  { env: { ...process.env, PGPASSWORD: password }, stdio: "inherit" },
);

if (hasEventRows(readFileSync(partial, "utf8"))) {
  renameSync(partial, out);
  console.log(`${out} を作成しました`);
} else {
  // 消さずに残す。中身を確かめられるようにするため
  console.error(
    `event の行が1件も無い。${conn.host} が空か、違うDBを指している。取れたものは ${partial}`,
  );
  process.exitCode = 1;
}
