import { getTableColumns } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { STAT_TITLE_PATTERN } from "../../app/stat-schedule";
import { resetDatabase } from "../../test/helpers";
import { db } from ".";
import { type AuditEntry, record } from "./audit";
import { auditLog, event, stock, theme, themeStock } from "./schema";
import {
  createEvent,
  createStock,
  createTheme,
  createThemeStock,
  deleteEvent,
  deleteStock,
  deleteTheme,
  type EventInput,
  updateEvent,
  upsertMarketEvents,
  type WriteResult,
} from "./write";

beforeEach(resetDatabase);

/**
 * 書き込みが成功したことを判定し、記録を取り出す。
 * 失敗するとエラー文（文字列）が返るため、その文言を出して落とす
 */
function entriesOf(result: WriteResult): AuditEntry[] {
  if (typeof result === "string") {
    throw new Error(`書き込みが失敗した: ${result}`);
  }
  return result;
}

const EVENT: EventInput = {
  title: "日本銀行 金融政策決定会合",
  shortLabel: "日銀会合",
  startDate: "2026-09-18",
  endDate: null,
  time: null,
  importance: 3,
  note: null,
  sourceUrl: null,
  sourceName: null,
  market: "JP",
  themeId: null,
  stockId: null,
};

/** 取り込みが入れる形の市場イベント。名称は STAT_TITLE_PATTERN に当たる */
function statEvent(overrides: Partial<EventInput> = {}): EventInput {
  return {
    ...EVENT,
    title: "消費者物価指数（2026年1月分）",
    shortLabel: "CPI",
    startDate: "2027-02-20",
    time: "08:30",
    ...overrides,
  };
}

describe("record", () => {
  it("記録が無いときは何も書かない", async () => {
    expect(await record(null, [])).toBeNull();
    expect(await db.select().from(auditLog)).toEqual([]);
  });

  it("利用者IDが空の記録は取り込みが行ったことを表す", async () => {
    await record(null, entriesOf(await createTheme("半導体")));

    const [row] = await db.select().from(auditLog);
    expect(row.userId).toBeNull();
    expect(row.action).toBe("create");
    expect(row.resourceType).toBe("theme");
  });

  it("実在しない利用者IDでは書けず、エラー文が返る", async () => {
    // audit_log.user_id は user への外部キー。書き込みの時点で弾かれる
    expect(
      await record("no-such-user", entriesOf(await createTheme("半導体"))),
    ).toBe(
      "書き込みは済んだが、監査ログに残せなかった。押し直さず管理者に知らせること",
    );
    expect(await db.select().from(auditLog)).toEqual([]);
  });
});

describe("削除の記録", () => {
  it("消える前の行の内容がまるごと残る", async () => {
    await createEvent(EVENT);
    const [before] = await db.select().from(event);

    await record(null, entriesOf(await deleteEvent(before.id)));

    const [row] = await db.select().from(auditLog);
    expect(row.action).toBe("delete");
    expect(row.resourceType).toBe("event");
    expect(row.resourceId).toBe(String(before.id));
    expect(row.newValues).toBeNull();
    // 列が1本残らず入っている。キーはDBの列名（`short_label`）で、
    // TypeScript 側の名前（`shortLabel`）ではない。§5.4 の復元SQLが
    // 列名でしか行を組み立てられないため
    expect(Object.keys(row.previousValues ?? {}).sort()).toEqual(
      Object.values(getTableColumns(event))
        .map((column) => column.name)
        .sort(),
    );
    expect(row.previousValues?.short_label).toBe(before.shortLabel);
    expect(row.previousValues?.start_date).toBe(before.startDate);
  });

  it("消した行を previous_values から元に戻せる", async () => {
    // 設計書 §5.4 の復元。復元用の画面もコードも作らず、このSQL1文で戻す
    await createEvent(EVENT);
    const [before] = await db.select().from(event);
    await record(null, entriesOf(await deleteEvent(before.id)));
    expect(await db.select().from(event)).toEqual([]);

    const [log] = await db.select().from(auditLog);
    await db.execute(`
      INSERT INTO event OVERRIDING SYSTEM VALUE
      SELECT r.* FROM audit_log a,
        LATERAL jsonb_populate_record(NULL::event, a.previous_values) AS r
      WHERE a.id = ${log.id};
    `);

    expect(await db.select().from(event)).toEqual([before]);
  });

  it("銘柄の削除で道連れになるテーマ所属も記録に残る", async () => {
    // theme_stock は CASCADE で一緒に消え、DBに任せると行がどこにも残らない
    await createStock({
      market: "JP",
      ticker: "7203",
      name: "トヨタ自動車",
      fiscalMonth: 3,
    });
    await createTheme("自動車");
    const [{ id: stockId }] = await db.select().from(stock);
    const [{ id: themeId }] = await db.select().from(theme);
    await createThemeStock(themeId, stockId);
    const [link] = await db.select().from(themeStock);

    await record(null, entriesOf(await deleteStock(stockId)));

    const rows = await db.select().from(auditLog);
    const linkLog = rows.find((row) => row.resourceType === "theme_stock");
    expect(linkLog?.action).toBe("delete");
    expect(linkLog?.resourceId).toBe(`${themeId}:${stockId}`);
    expect(Object.keys(linkLog?.previousValues ?? {}).sort()).toEqual([
      "created_at",
      "stock_id",
      "theme_id",
    ]);
    expect(linkLog?.previousValues?.theme_id).toBe(link.themeId);
    expect(linkLog?.previousValues?.stock_id).toBe(link.stockId);
  });

  it("テーマの削除で道連れになるテーマ所属も記録に残る", async () => {
    await createStock({
      market: "JP",
      ticker: "7203",
      name: "トヨタ自動車",
      fiscalMonth: 3,
    });
    await createTheme("自動車");
    const [{ id: stockId }] = await db.select().from(stock);
    const [{ id: themeId }] = await db.select().from(theme);
    await createThemeStock(themeId, stockId);

    await record(null, entriesOf(await deleteTheme(themeId)));

    const rows = await db.select().from(auditLog);
    expect(rows.map((row) => row.resourceType).sort()).toEqual([
      "theme",
      "theme_stock",
    ]);
  });
});

describe("更新の記録", () => {
  it("変更前と変更後の両方が残る", async () => {
    await createEvent(EVENT);
    const [before] = await db.select().from(event);

    await record(
      null,
      entriesOf(await updateEvent(before.id, { ...EVENT, importance: 1 })),
    );

    const [row] = await db.select().from(auditLog);
    expect(row.action).toBe("update");
    expect(row.previousValues?.importance).toBe(3);
    expect(row.newValues?.importance).toBe(1);
  });
});

describe("取り込みの記録", () => {
  it("登録・変更・非アクティブ化のそれぞれが残る", async () => {
    // 取り込みは app/actions.ts を通らない。この経路が漏れると実データの
    // ほとんどが記録されない（設計書 §5.2）
    const first = await upsertMarketEvents([statEvent()], STAT_TITLE_PATTERN);
    await record(null, first.entries);

    const changed = await upsertMarketEvents(
      [statEvent({ startDate: "2027-02-24" })],
      STAT_TITLE_PATTERN,
    );
    await record(null, changed.entries);

    // 公表予定から消えた「これからの回」は非アクティブになる。
    // 0件を渡すと何もしないため、別の回を1件渡して落とす
    const gone = await upsertMarketEvents(
      [statEvent({ title: "消費者物価指数（2026年2月分）" })],
      STAT_TITLE_PATTERN,
    );
    await record(null, gone.entries);

    const rows = await db.select().from(auditLog);
    expect(rows.every((row) => row.userId === null)).toBe(true);

    const cpi = rows.filter(
      (row) => row.resourceId === String(rows[0].resourceId),
    );
    expect(cpi.map((row) => row.action)).toEqual([
      "create",
      "update",
      "update",
    ]);
    // 非アクティブ化は active の変更として残る
    const off = cpi[2];
    expect(off.previousValues?.active).toBe(true);
    expect(off.newValues?.active).toBe(false);
  });
});
