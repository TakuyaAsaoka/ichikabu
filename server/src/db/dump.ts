/**
 * ダンプの出力先の名前。接続先のホストとデータベース名を入れる。
 *
 * 名前に入れるのは、取り違えに後から気づけるようにするため。`--env-file` は
 * シェルにすでにある値を上書きしないので、本番のつもりで `.env.deploy.local` の
 * 読み込みを忘れると、開発用DBを黙ってダンプする（→ docs/guides/backup.md）。
 * 時刻だけの名前だと、backups/ を開いたときにどれが本番か見分けられない。
 */
export function dumpFileName(databaseUrl: string, date: Date): string {
  const { hostname, pathname } = new URL(databaseUrl);
  // pathname は先頭に "/" が付く。そのまま名前に入れるとディレクトリ扱いになる
  const database = pathname.slice(1);
  // sv-SE の日付表記は YYYY-MM-DD。時間帯を書かずに UTC で切ると、
  // 朝に取ったバックアップに前日の日付が付く
  const day = date.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });

  return `${day}-${hostname}-${database}.sql`;
}

/** event の COPY 行。この直後にデータ行が続く。0件だと次の行がすぐ `\.` になる */
const eventCopy = /^COPY public\.event \(.*\) FROM stdin;\n/m;

/**
 * ダンプに event の行が1件以上入っているか。
 *
 * **ファイルができただけでは足りない。** 空のDBに繋いでも pg_dump は成功して
 * ファイルを作り、`COPY public.event ... FROM stdin;` の行も出る。そのため
 * `grep -c '^COPY public.event '` は0行のダンプでも 1 を返す（実測）。
 */
export function hasEventRows(dump: string): boolean {
  const rows = dump.split(eventCopy)[1];

  return rows !== undefined && !rows.startsWith("\\.");
}
