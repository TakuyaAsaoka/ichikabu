import {
  desc,
  eq,
  getTableColumns,
  getTableName,
  type Table,
} from "drizzle-orm";
import { db } from ".";
import {
  type AUDIT_ACTIONS,
  type AUDIT_RESOURCES,
  auditLog,
  user,
} from "./schema";

/**
 * 操作の区分。対象は `resourceType` が別に持つため、`create_event` のように
 * 対象を混ぜた値にはしない（設計書 §5.1）
 */
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/** 記録の対象になるテーブル */
export type AuditResource = (typeof AUDIT_RESOURCES)[number];

/**
 * 監査ログに書く1件（設計書 §5.1）。
 *
 * 誰が操作したかは持たない。この形を組み立てるのは `src/db/write.ts` で、
 * あの層はDBだけを見ていてセッションを知らないため（設計書 §6）。
 * 利用者IDは記録を書く側（`app/actions.ts`・取り込みスクリプト）が足す
 */
export type AuditEntry = {
  action: AuditAction;
  resourceType: AuditResource;
  /** 主キーの値。`theme_stock` は複合主キーなので ":" でつなぐ */
  resourceId: string;
  /** 変更前の行。登録では null */
  previousValues: Record<string, unknown> | null;
  /** 変更後の行。削除では null */
  newValues: Record<string, unknown> | null;
};

/** 記録の対象になるテーブル。テーブル名がそのまま `resource_type` になる */
type AuditTable = Table & { _: { name: AuditResource } };

/**
 * 行のキーをDBの列名に直す。
 *
 * Drizzle が返す行のキーは `shortLabel` のような TypeScript 側の名前で、
 * 設計書 §5.4 の復元SQL（`jsonb_populate_record(NULL::event, previous_values)`）は
 * **列名（`short_label`）でしか行を組み立てられない**。TypeScript 側の名前で
 * 入れると、名前の違う列が全部 NULL になって NOT NULL 違反で戻せない（実測）
 */
function toColumnNames(
  table: AuditTable,
  row: Record<string, unknown>,
): Record<string, unknown> {
  const columns: Record<string, { name: string } | undefined> =
    getTableColumns(table);
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      columns[key]?.name ?? key,
      value,
    ]),
  );
}

/** 登録の記録を作る */
export function createdEntry(
  table: AuditTable,
  resourceId: string,
  row: Record<string, unknown>,
): AuditEntry {
  return {
    action: "create",
    resourceType: getTableName(table),
    resourceId,
    previousValues: null,
    newValues: toColumnNames(table, row),
  };
}

/** 更新の記録を作る。前後の両方を残す */
export function updatedEntry(
  table: AuditTable,
  resourceId: string,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): AuditEntry {
  return {
    action: "update",
    resourceType: getTableName(table),
    resourceId,
    previousValues: toColumnNames(table, before),
    newValues: toColumnNames(table, after),
  };
}

/**
 * 削除の記録を作る。消える前の行をまるごと `previousValues` に残す。
 * これが消した行の唯一の写しで、設計書 §5.4 の復元はここからしか戻せない
 */
export function deletedEntry(
  table: AuditTable,
  resourceId: string,
  row: Record<string, unknown>,
): AuditEntry {
  return {
    action: "delete",
    resourceType: getTableName(table),
    resourceId,
    previousValues: toColumnNames(table, row),
    newValues: null,
  };
}

/**
 * 記録を書く。**このファイルだけが `audit_log` に書く**（設計書 §5.2）。
 * 成功で null、失敗で画面に出す日本語のエラー文を返す。
 *
 * 失敗を握りつぶさない。`console.error` の行き先は Netlify の関数のログで、
 * 転送も監視も設定しておらず（`netlify.toml` に log drain 無し）、誰も読まない。
 * 黙って成功にすると、記録の無い書き込みが積み上がったことに気づく手がかりが
 * どこにも出ない。`src/db/write.ts` の `run()` と取り込みスクリプトが同じ理由で
 * 「握りつぶさない」を選んでいる。
 *
 * 文言に「書き込みは済んだ」と書く。書き込み自体は成功しているのに押し直すと、
 * 削除は0件削除で成功に化けて記録が永久に残らなくなる
 *
 * @param userId 操作した利用者。取り込みスクリプトなど人以外は null
 */
export async function record(
  userId: string | null,
  entries: AuditEntry[],
): Promise<string | null> {
  // 0件更新・0件削除では記録することが無い
  if (entries.length === 0) {
    return null;
  }
  try {
    await db
      .insert(auditLog)
      .values(entries.map((entry) => ({ ...entry, userId })));
  } catch (error) {
    // 画面に出す文言には原因を載せられないため、詳細はここに出す
    console.error("監査ログに残せなかった", error);
    return "書き込みは済んだが、監査ログに残せなかった。押し直さず管理者に知らせること";
  }
  return null;
}

/** 画面に出す1行。前後の値は出さない（→ `listRecent`） */
export type AuditRow = {
  id: number;
  createdAt: Date;
  /** 操作した人の表示名。取り込みスクリプトなど人以外は null */
  userName: string | null;
  action: AuditAction;
  resourceType: AuditResource;
  resourceId: string;
};

/**
 * 新しい順に全件読む（`app/audit/page.tsx`）。
 *
 * `previousValues` と `newValues` は返さない。1行が行まるごとの写しで、
 * 一覧に並べると読めない量になる。消した行を戻すのは設計書 §5.4 の
 * `jsonb_populate_record` を psql で流す手順のままにする。
 *
 * **件数の上限も絞り込みも付けない**（Issue #111 で討論して決めた）。
 *
 * - 上限を付けると、設計書 §5.4 の復元が届かなくなる。復元は
 *   `WHERE a.id = <監査ログのID>` で、その id を管理者は画面で探す。
 *   上限より古い削除は画面から永久に見えなくなり、`previousValues` は
 *   消した行の唯一の写しなので、戻す手段そのものが消える
 * - 絞り込みを付けるより、全件をHTMLに出してブラウザの検索（⌘F）に任せるほうが
 *   よく効く。「削除」でも入力者のメールアドレスでも1回で引ける。コードは0行で、
 *   逆に上限や送り出しを付けるとこの検索が表示中のぶんにしか届かなくなる
 * - 増える速さも測った。窓に追いついた状態で `pnpm import:stat` を叩くと
 *   監査ログは**0件**しか増えない（実測。2ヶ月ぶん新しく入っても2件）。
 *   残りは3人の手入力だけで、本番は今0件
 *
 * 測った天井は1万件で読み出し8.4ミリ秒・HTML 429kB。ここに近づいたら
 * `action` での絞り込みを足す。画面が件数を出すので、増え方は見て分かる
 */
export async function listRecent(): Promise<AuditRow[]> {
  return (
    db
      .select({
        id: auditLog.id,
        createdAt: auditLog.createdAt,
        userName: user.name,
        action: auditLog.action,
        resourceType: auditLog.resourceType,
        resourceId: auditLog.resourceId,
      })
      .from(auditLog)
      // 取り込みスクリプトの記録は user_id が NULL なので、内部結合にすると消える
      .leftJoin(user, eq(auditLog.userId, user.id))
      // id も並び順に入れる。`created_at` の既定値は `now()` で、これは取引の
      // 開始時刻を返すため、1回の操作でまとめて入れた行は全部同じ値になる
      // （`record` は1文で入れる）。`created_at` だけで並べると、その中の順序が
      // DBの都合任せになり、実際に古い順で返ってくる（実測）
      .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
  );
}
