import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { STAT_TITLE_PATTERN } from "../../app/stat-schedule";
import { resetDatabase } from "../../test/helpers";
import { db } from ".";
import { event, stock, theme, themeStock } from "./schema";
import {
  createEvent,
  createEvents,
  createStock,
  createTheme,
  createThemeStock,
  deleteEvent,
  deleteStock,
  deleteTheme,
  deleteThemeStock,
  type EventInput,
  updateEvent,
  updateStock,
  updateTheme,
  upsertMarketEvents,
} from "./write";

const TOYOTA = {
  market: "JP",
  ticker: "7203",
  name: "トヨタ自動車",
  fiscalMonth: 3,
} as const;

/**
 * 書き込みが成功したことの判定。失敗すると日本語のエラー文（文字列）が返り、
 * 成功すると監査ログに渡す記録の並びが返る（`WriteResult`）。
 * 記録の中身そのものは `src/db/audit.test.ts` が判定する
 */
const succeeded = expect.any(Array);

beforeEach(resetDatabase);

describe("createStock", () => {
  it("銘柄を登録するとDBに行が入る", async () => {
    expect(await createStock({ ...TOYOTA })).toEqual(succeeded);

    const rows = await db.select().from(stock);
    expect(rows).toHaveLength(1);
    expect(rows[0].ticker).toBe("7203");
    expect(rows[0].fiscalMonth).toBe(3);
  });

  it("同じ市場とティッカーをもう一度登録するとエラー文が返る", async () => {
    await createStock({ ...TOYOTA });

    expect(await createStock({ ...TOYOTA, name: "別名で再登録" })).toBe(
      "その市場のティッカーは登録済み",
    );
    expect(await db.select().from(stock)).toHaveLength(1);
  });

  it("英字入りのティッカーを登録できる", async () => {
    // 全体設計書 §4.2「ticker は文字列」の検証。数値型だと 130A が入らない
    expect(
      await createStock({
        market: "JP",
        ticker: "130A",
        name: "英字入りティッカーの銘柄",
        fiscalMonth: 12,
      }),
    ).toEqual(succeeded);
  });

  it("全角のティッカーはエラー文が返る", async () => {
    // 全角の「７２０３」が半角の「7203」と別銘柄として登録されるのを防ぐ
    expect(await createStock({ ...TOYOTA, ticker: "７２０３" })).toBe(
      "ティッカーは半角の数字・英大文字・ピリオド・ハイフンだけ使える",
    );
  });

  it("US銘柄に決算月を入れるとエラー文が返る", async () => {
    // 決算月はJP銘柄のみ。US銘柄に入るとJPの休場日カレンダーで計算した
    // 権利確定日がUS銘柄に出てしまう（全体設計書 §4.1）
    expect(
      await createStock({
        market: "US",
        ticker: "AAPL",
        name: "Apple",
        fiscalMonth: 9,
      }),
    ).toBe("決算月はJP銘柄にだけ入れられる");
  });

  it("市場がJPでもUSでもないとエラー文が返る", async () => {
    expect(
      await createStock({
        market: "XX",
        ticker: "9999",
        name: "不正な市場",
        fiscalMonth: null,
      }),
    ).toBe("市場は JP か US");
    expect(await db.select().from(stock)).toHaveLength(0);
  });

  it("US銘柄は決算月なしで登録できる", async () => {
    expect(
      await createStock({
        market: "US",
        ticker: "AAPL",
        name: "Apple",
        fiscalMonth: null,
      }),
    ).toEqual(succeeded);
  });

  it("空白だけの銘柄名はエラー文が返る", async () => {
    // <input required> は "" しか弾かず "   " を通す（設計書 §5）
    expect(await createStock({ ...TOYOTA, name: "   " })).toBe(
      "銘柄名を入れる",
    );
    expect(await db.select().from(stock)).toHaveLength(0);
  });

  it("前後に空白のある銘柄名は空白を落として登録される", async () => {
    expect(await createStock({ ...TOYOTA, name: " トヨタ自動車 " })).toEqual(
      succeeded,
    );

    const [row] = await db.select().from(stock);
    expect(row.name).toBe("トヨタ自動車");
  });
});

describe("createTheme", () => {
  it("テーマを登録するとDBに行が入る", async () => {
    expect(await createTheme("半導体")).toEqual(succeeded);

    const rows = await db.select().from(theme);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("半導体");
  });

  it("同じ名前のテーマをもう一度登録するとエラー文が返る", async () => {
    await createTheme("半導体");

    expect(await createTheme("半導体")).toBe("そのテーマ名は登録済み");
    expect(await db.select().from(theme)).toHaveLength(1);
  });

  it("前後に空白のある名前は空白を落として登録される", async () => {
    // 「半導体 」を別テーマとして通すと、見分けの付かない選択肢が2つ並ぶ
    await createTheme("半導体");

    expect(await createTheme(" 半導体 ")).toBe("そのテーマ名は登録済み");
    expect(await db.select().from(theme)).toHaveLength(1);
  });

  it("空白だけの名前はエラー文が返る", async () => {
    expect(await createTheme("   ")).toBe("テーマ名を入れる");
    expect(await db.select().from(theme)).toHaveLength(0);
  });
});

describe("createThemeStock", () => {
  let themeId: number;
  let stockId: number;

  beforeEach(async () => {
    await createTheme("半導体");
    await createStock({ ...TOYOTA });
    [{ themeId }] = await db.select({ themeId: theme.id }).from(theme);
    [{ stockId }] = await db.select({ stockId: stock.id }).from(stock);
  });

  it("テーマ所属を登録するとDBに行が入る", async () => {
    expect(await createThemeStock(themeId, stockId)).toEqual(succeeded);

    const rows = await db.select().from(themeStock);
    expect(rows).toHaveLength(1);
    expect(rows[0].themeId).toBe(themeId);
    expect(rows[0].stockId).toBe(stockId);
  });

  it("同じテーマと銘柄の組をもう一度登録するとエラー文が返る", async () => {
    await createThemeStock(themeId, stockId);

    expect(await createThemeStock(themeId, stockId)).toBe(
      "その銘柄はすでにこのテーマに登録済み",
    );
    expect(await db.select().from(themeStock)).toHaveLength(1);
  });
});

/**
 * 対象3列がすべて null の土台。各テストが1列だけ埋める。
 * 短縮ラベル「日銀会合」は全角4文字（幅8）で、幅の判定には引っかからない
 */
const BASE: EventInput = {
  title: "日本銀行 金融政策決定会合",
  shortLabel: "日銀会合",
  startDate: "2026-09-18",
  endDate: null,
  time: null,
  importance: 3,
  note: null,
  sourceUrl: null,
  sourceName: null,
  market: null,
  themeId: null,
  stockId: null,
};

/** イベントの行が1件だけ入ったことを確かめ、その行を返す */
async function onlyEvent() {
  const rows = await db.select().from(event);
  expect(rows).toHaveLength(1);
  return rows[0];
}

describe("createEvent", () => {
  it("市場イベントを登録するとDBに行が入る", async () => {
    expect(await createEvent({ ...BASE, market: "GLOBAL" })).toEqual(succeeded);

    const row = await onlyEvent();
    expect(row.market).toBe("GLOBAL");
    expect(row.themeId).toBeNull();
    expect(row.stockId).toBeNull();
  });

  it("テーマイベントを登録するとDBに行が入る", async () => {
    await createTheme("半導体");
    const [{ id: themeId }] = await db.select({ id: theme.id }).from(theme);

    expect(await createEvent({ ...BASE, themeId })).toEqual(succeeded);

    const row = await onlyEvent();
    expect(row.themeId).toBe(themeId);
    expect(row.market).toBeNull();
    expect(row.stockId).toBeNull();
  });

  it("銘柄イベントを登録するとDBに行が入る", async () => {
    await createStock({ ...TOYOTA });
    const [{ id: stockId }] = await db
      .select({ id: stock.id })
      .from(stock)
      .where(eq(stock.ticker, TOYOTA.ticker));

    expect(await createEvent({ ...BASE, stockId })).toEqual(succeeded);

    const row = await onlyEvent();
    expect(row.stockId).toBe(stockId);
    expect(row.market).toBeNull();
    expect(row.themeId).toBeNull();
  });

  it("対象を1つも選ばないとエラー文が返る", async () => {
    expect(await createEvent({ ...BASE })).toBe(
      "対象は市場・テーマ・銘柄のどれか1つを選ぶ",
    );
    expect(await db.select().from(event)).toHaveLength(0);
  });

  it("対象を2つ選ぶとエラー文が返る", async () => {
    await createTheme("半導体");
    const [{ id: themeId }] = await db.select({ id: theme.id }).from(theme);

    expect(await createEvent({ ...BASE, market: "JP", themeId })).toBe(
      "対象は市場・テーマ・銘柄のどれか1つを選ぶ",
    );
    expect(await db.select().from(event)).toHaveLength(0);
  });

  it("市場がJP・US・GLOBALのどれでもないとエラー文が返る", async () => {
    expect(await createEvent({ ...BASE, market: "XX" })).toBe(
      "市場は JP・US・GLOBAL のどれか",
    );
    expect(await db.select().from(event)).toHaveLength(0);
  });

  it("短縮ラベルが全角5文字を超えるとエラー文が返る", async () => {
    // 「決算発表予定」は全角6文字＝幅12（設計書 §3）
    expect(
      await createEvent({
        ...BASE,
        market: "JP",
        shortLabel: "決算発表予定",
      }),
    ).toBe("短縮ラベルは全角5文字まで");
    expect(await db.select().from(event)).toHaveLength(0);
  });

  it("全角5文字ちょうどの短縮ラベルを登録できる", async () => {
    // 幅10。境界を1文字ぶん間違えるとここが落ちる
    expect(
      await createEvent({ ...BASE, market: "JP", shortLabel: "決算発表日" }),
    ).toEqual(succeeded);
  });

  it("半角と全角が混じった短縮ラベルを登録できる", async () => {
    // 「7203決算」は6文字だが全角換算では4文字（幅8）。文字数で数えていないことの検証
    expect(
      await createEvent({ ...BASE, market: "JP", shortLabel: "7203決算" }),
    ).toEqual(succeeded);
  });

  it("終了日を空にすると単日として登録される", async () => {
    expect(await createEvent({ ...BASE, market: "JP", endDate: null })).toEqual(
      succeeded,
    );

    expect((await onlyEvent()).endDate).toBeNull();
  });

  it("終了日が開始日と同じだとエラー文が返る", async () => {
    // 単日は end_date IS NULL でのみ表す（全体設計書 §4.2）
    expect(
      await createEvent({
        ...BASE,
        market: "JP",
        endDate: BASE.startDate,
      }),
    ).toBe("終了日は開始日より後にする（単日は空のまま）");
    expect(await db.select().from(event)).toHaveLength(0);
  });

  it("出典の名前とURLを両方入れて登録できる", async () => {
    expect(
      await createEvent({
        ...BASE,
        market: "JP",
        sourceName: "内閣府（PDL1.0）",
        sourceUrl: "https://www.cao.go.jp/",
      }),
    ).toEqual(succeeded);

    const row = await onlyEvent();
    expect(row.sourceName).toBe("内閣府（PDL1.0）");
    expect(row.sourceUrl).toBe("https://www.cao.go.jp/");
  });

  it("出典の名前だけだとエラー文が返る", async () => {
    // 画面に出した出典から元のページへたどれなくなる（設計書 §3.1）
    expect(
      await createEvent({ ...BASE, market: "JP", sourceName: "内閣府" }),
    ).toBe("出典の名前を入れるならURLも入れる");
    expect(await db.select().from(event)).toHaveLength(0);
  });

  it("出典のURLだけで登録できる", async () => {
    // source_url は運用者が誤登録を追うための記録で、画面に出さない使い方がある
    expect(
      await createEvent({
        ...BASE,
        market: "JP",
        sourceUrl: "https://global.toyota/jp/ir/",
      }),
    ).toEqual(succeeded);

    const row = await onlyEvent();
    expect(row.sourceName).toBeNull();
    expect(row.sourceUrl).toBe("https://global.toyota/jp/ir/");
  });

  it("重要度が1〜3の外だとエラー文が返る", async () => {
    expect(await createEvent({ ...BASE, market: "JP", importance: 4 })).toBe(
      "重要度は1〜3",
    );
    expect(await db.select().from(event)).toHaveLength(0);
  });
});

describe("updateEvent", () => {
  /** 市場イベントを1件登録し、そのIDを返す */
  async function registerEvent(): Promise<number> {
    await createEvent({ ...BASE, market: "JP" });
    return (await onlyEvent()).id;
  }

  it("更新するとイベントの列が書き換わる", async () => {
    const id = await registerEvent();

    expect(
      await updateEvent(id, {
        ...BASE,
        market: "US",
        title: "米連邦公開市場委員会",
        shortLabel: "FOMC",
        startDate: "2026-10-27",
        endDate: "2026-10-28",
        time: "03:00",
        importance: 2,
        note: "日本時間の未明",
      }),
    ).toEqual(succeeded);

    const row = await onlyEvent();
    expect(row.title).toBe("米連邦公開市場委員会");
    expect(row.market).toBe("US");
    expect(row.endDate).toBe("2026-10-28");
    expect(row.time).toBe("03:00:00");
    expect(row.note).toBe("日本時間の未明");
  });

  it("出典の名前だけを入れて更新するとエラー文が返る", async () => {
    // 登録と同じく event_source_name_check が効く（設計書 §5.2）
    const id = await registerEvent();

    expect(
      await updateEvent(id, { ...BASE, market: "JP", sourceName: "内閣府" }),
    ).toBe("出典の名前を入れるならURLも入れる");
    expect((await onlyEvent()).sourceName).toBeNull();
  });

  it("出典の名前とURLを両方入れて更新できる", async () => {
    // 出典を入れ忘れた行を直せること。これが Issue #43 の目的
    const id = await registerEvent();

    expect(
      await updateEvent(id, {
        ...BASE,
        market: "JP",
        sourceName: "内閣府（PDL1.0）",
        sourceUrl: "https://www.cao.go.jp/",
      }),
    ).toEqual(succeeded);

    const row = await onlyEvent();
    expect(row.sourceName).toBe("内閣府（PDL1.0）");
    expect(row.sourceUrl).toBe("https://www.cao.go.jp/");
  });

  it("短縮ラベルが全角5文字を超える更新はエラー文が返る", async () => {
    const id = await registerEvent();

    expect(
      await updateEvent(id, {
        ...BASE,
        market: "JP",
        shortLabel: "決算発表予定",
      }),
    ).toBe("短縮ラベルは全角5文字まで");
    expect((await onlyEvent()).shortLabel).toBe("日銀会合");
  });

  it("存在しないIDの更新は何も起きない", async () => {
    await registerEvent();

    expect(await updateEvent(999999, { ...BASE, market: "US" })).toEqual(
      succeeded,
    );
    expect((await onlyEvent()).market).toBe("JP");
  });

  it("数字でないIDの更新はエラー文が返る", async () => {
    // Number("abc") の NaN を integer 列に渡すと型変換エラーで 500 になる（設計書 §6）
    await registerEvent();

    expect(await updateEvent(Number("abc"), { ...BASE, market: "US" })).toBe(
      "そのイベントは見つからない",
    );
    expect((await onlyEvent()).market).toBe("JP");
  });

  it("integer の範囲を超えるIDの更新はエラー文が返る", async () => {
    // 桁数の多い数はそのまま渡せる形をしているが、integer 列には入らない
    await registerEvent();

    expect(await updateEvent(9999999999, { ...BASE, market: "US" })).toBe(
      "そのイベントは見つからない",
    );
    expect((await onlyEvent()).market).toBe("JP");
  });
});

describe("deleteEvent", () => {
  it("削除するとイベントが消える", async () => {
    await createEvent({ ...BASE, market: "JP" });
    const { id } = await onlyEvent();

    expect(await deleteEvent(id)).toEqual(succeeded);
    expect(await db.select().from(event)).toHaveLength(0);
  });

  it("存在しないIDの削除は何も起きない", async () => {
    await createEvent({ ...BASE, market: "JP" });

    expect(await deleteEvent(999999)).toEqual(succeeded);
    expect(await db.select().from(event)).toHaveLength(1);
  });

  it("数字でないIDの削除はエラー文が返る", async () => {
    await createEvent({ ...BASE, market: "JP" });

    expect(await deleteEvent(Number("abc"))).toBe("そのイベントは見つからない");
    expect(await db.select().from(event)).toHaveLength(1);
  });

  it("integer の範囲を超えるIDの削除はエラー文が返る", async () => {
    await createEvent({ ...BASE, market: "JP" });

    expect(await deleteEvent(9999999999)).toBe("そのイベントは見つからない");
    expect(await db.select().from(event)).toHaveLength(1);
  });

  it("id が無いまま送られた削除はエラー文が返る", async () => {
    // Server Action は画面を通さず直接POSTできる。Number(null) は 0 になる
    await createEvent({ ...BASE, market: "JP" });

    expect(await deleteEvent(Number(null))).toBe("そのイベントは見つからない");
    expect(await db.select().from(event)).toHaveLength(1);
  });
});

/** トヨタを1件だけ登録し、その id を返す */
async function onlyStockId(): Promise<number> {
  await createStock({ ...TOYOTA });
  const [row] = await db.select({ id: stock.id }).from(stock);
  return row.id;
}

/** テーマ「半導体」を1件だけ登録し、その id を返す */
async function onlyThemeId(): Promise<number> {
  await createTheme("半導体");
  const [row] = await db.select({ id: theme.id }).from(theme).limit(1);
  return row.id;
}

describe("updateStock", () => {
  it("4列すべてを更新するとDBの行が変わる", async () => {
    const id = await onlyStockId();

    expect(
      await updateStock(id, {
        market: "US",
        ticker: "AAPL",
        name: "Apple",
        fiscalMonth: null,
      }),
    ).toEqual(succeeded);

    const [row] = await db.select().from(stock);
    expect(row.market).toBe("US");
    expect(row.ticker).toBe("AAPL");
    expect(row.name).toBe("Apple");
    expect(row.fiscalMonth).toBeNull();
  });

  it("イベントから参照されている銘柄のティッカーを変えても参照は外れない", async () => {
    // 外部キーは stock.id を見るため、市場・ティッカーを直しても参照は付いてくる（設計書 §4）
    const stockId = await onlyStockId();
    await createEvent({ ...BASE, stockId });

    expect(await updateStock(stockId, { ...TOYOTA, ticker: "7204" })).toEqual(
      succeeded,
    );

    expect((await onlyEvent()).stockId).toBe(stockId);
    const [row] = await db.select().from(stock);
    expect(row.ticker).toBe("7204");
  });

  it("既にある市場とティッカーの組に変えるとエラー文が返る", async () => {
    const id = await onlyStockId();
    await createStock({ ...TOYOTA, ticker: "7267", name: "ホンダ" });

    expect(await updateStock(id, { ...TOYOTA, ticker: "7267" })).toBe(
      "その市場のティッカーは登録済み",
    );
  });

  it("決算月を残したままUS銘柄に変えるとエラー文が返る", async () => {
    const id = await onlyStockId();

    expect(await updateStock(id, { ...TOYOTA, market: "US" })).toBe(
      "決算月はJP銘柄にだけ入れられる",
    );
    const [row] = await db.select().from(stock);
    expect(row.market).toBe("JP");
  });

  it("前後に空白のある銘柄名は空白を落として更新される", async () => {
    const id = await onlyStockId();

    expect(
      await updateStock(id, { ...TOYOTA, name: " トヨタ自動車 " }),
    ).toEqual(succeeded);

    const [row] = await db.select().from(stock);
    expect(row.name).toBe("トヨタ自動車");
  });

  it("空白だけの銘柄名に更新するとエラー文が返る", async () => {
    const id = await onlyStockId();

    expect(await updateStock(id, { ...TOYOTA, name: "   " })).toBe(
      "銘柄名を入れる",
    );
    const [row] = await db.select().from(stock);
    expect(row.name).toBe("トヨタ自動車");
  });

  it("存在しないIDの更新は何も起きない", async () => {
    await onlyStockId();

    expect(await updateStock(999999, { ...TOYOTA, name: "別名" })).toEqual(
      succeeded,
    );
    const [row] = await db.select().from(stock);
    expect(row.name).toBe("トヨタ自動車");
  });

  it("問い合わせに渡せないIDの更新はエラー文が返る", async () => {
    for (const id of [Number("abc"), 9999999999, Number(null)]) {
      expect(await updateStock(id, { ...TOYOTA })).toBe(
        "その銘柄は見つからない",
      );
    }
  });
});

describe("deleteStock", () => {
  it("どこからも参照されていない銘柄は消える", async () => {
    const id = await onlyStockId();

    expect(await deleteStock(id)).toEqual(succeeded);
    expect(await db.select().from(stock)).toHaveLength(0);
  });

  it("テーマ所属は一緒に消える", async () => {
    // theme_stock.stock_id は ON DELETE cascade（設計書 §2）
    const stockId = await onlyStockId();
    const themeId = await onlyThemeId();
    await createThemeStock(themeId, stockId);

    expect(await deleteStock(stockId)).toEqual(succeeded);
    expect(await db.select().from(themeStock)).toHaveLength(0);
    expect(await db.select().from(theme)).toHaveLength(1);
  });

  it("イベントから参照されているとエラー文が返り、銘柄は消えない", async () => {
    // 制約名は登録のときと同じ event_stock_id_stock_id_fk が返る。
    // 「その銘柄は無い」を出すと意味が正反対になる（設計書 §2）
    const stockId = await onlyStockId();
    await createEvent({ ...BASE, stockId });

    expect(await deleteStock(stockId)).toBe(
      "その銘柄はイベントに使われていて消せない",
    );
    expect(await db.select().from(stock)).toHaveLength(1);
  });

  it("存在しないIDの削除は何も起きない", async () => {
    await onlyStockId();

    expect(await deleteStock(999999)).toEqual(succeeded);
    expect(await db.select().from(stock)).toHaveLength(1);
  });

  it("問い合わせに渡せないIDの削除はエラー文が返る", async () => {
    for (const id of [Number("abc"), 9999999999, Number(null)]) {
      expect(await deleteStock(id)).toBe("その銘柄は見つからない");
    }
  });
});

describe("updateTheme", () => {
  it("テーマ名を更新するとDBの行が変わる", async () => {
    const id = await onlyThemeId();

    expect(await updateTheme(id, "生成AI")).toEqual(succeeded);

    const [row] = await db.select().from(theme);
    expect(row.name).toBe("生成AI");
  });

  it("前後の空白は落として更新される", async () => {
    const id = await onlyThemeId();

    expect(await updateTheme(id, " 生成AI ")).toEqual(succeeded);

    const [row] = await db.select().from(theme);
    expect(row.name).toBe("生成AI");
  });

  it("空白だけの名前に更新するとエラー文が返る", async () => {
    const id = await onlyThemeId();

    expect(await updateTheme(id, "   ")).toBe("テーマ名を入れる");
    const [row] = await db.select().from(theme);
    expect(row.name).toBe("半導体");
  });

  it("既にある名前に変えるとエラー文が返る", async () => {
    const id = await onlyThemeId();
    await createTheme("生成AI");

    expect(await updateTheme(id, "生成AI")).toBe("そのテーマ名は登録済み");
  });

  it("問い合わせに渡せないIDの更新はエラー文が返る", async () => {
    for (const id of [Number("abc"), 9999999999, Number(null)]) {
      expect(await updateTheme(id, "生成AI")).toBe("そのテーマは見つからない");
    }
  });
});

describe("deleteTheme", () => {
  it("イベントから参照されていないテーマは消え、所属も一緒に消える", async () => {
    // theme_stock.theme_id は ON DELETE cascade（設計書 §2）
    const themeId = await onlyThemeId();
    const stockId = await onlyStockId();
    await createThemeStock(themeId, stockId);

    expect(await deleteTheme(themeId)).toEqual(succeeded);
    expect(await db.select().from(theme)).toHaveLength(0);
    expect(await db.select().from(themeStock)).toHaveLength(0);
    expect(await db.select().from(stock)).toHaveLength(1);
  });

  it("イベントから参照されているとエラー文が返り、テーマは消えない", async () => {
    const themeId = await onlyThemeId();
    await createEvent({ ...BASE, themeId });

    expect(await deleteTheme(themeId)).toBe(
      "そのテーマはイベントに使われていて消せない",
    );
    expect(await db.select().from(theme)).toHaveLength(1);
  });

  it("存在しないIDの削除は何も起きない", async () => {
    await onlyThemeId();

    expect(await deleteTheme(999999)).toEqual(succeeded);
    expect(await db.select().from(theme)).toHaveLength(1);
  });

  it("問い合わせに渡せないIDの削除はエラー文が返る", async () => {
    for (const id of [Number("abc"), 9999999999, Number(null)]) {
      expect(await deleteTheme(id)).toBe("そのテーマは見つからない");
    }
  });
});

describe("deleteThemeStock", () => {
  let themeId: number;
  let stockId: number;

  beforeEach(async () => {
    themeId = await onlyThemeId();
    stockId = await onlyStockId();
    await createThemeStock(themeId, stockId);
  });

  it("所属を消してもテーマも銘柄も消えない", async () => {
    expect(await deleteThemeStock(themeId, stockId)).toEqual(succeeded);
    expect(await db.select().from(themeStock)).toHaveLength(0);
    expect(await db.select().from(theme)).toHaveLength(1);
    expect(await db.select().from(stock)).toHaveLength(1);
  });

  it("他のテーマの同じ銘柄の所属は消えない", async () => {
    // 主キーは theme_id + stock_id。銘柄IDだけで消すと他のテーマの所属まで消える
    await createTheme("自動車");
    const [{ id: otherThemeId }] = await db
      .select({ id: theme.id })
      .from(theme)
      .where(eq(theme.name, "自動車"));
    await createThemeStock(otherThemeId, stockId);

    expect(await deleteThemeStock(themeId, stockId)).toEqual(succeeded);
    const rows = await db.select().from(themeStock);
    expect(rows).toHaveLength(1);
    expect(rows[0].themeId).toBe(otherThemeId);
  });

  it("存在しない組の削除は何も起きない", async () => {
    expect(await deleteThemeStock(themeId, 999999)).toEqual(succeeded);
    expect(await db.select().from(themeStock)).toHaveLength(1);
  });

  it("問い合わせに渡せないIDの削除はエラー文が返る", async () => {
    for (const id of [Number("abc"), 9999999999, Number(null)]) {
      expect(await deleteThemeStock(id, stockId)).toBe(
        "そのテーマは見つからない",
      );
      expect(await deleteThemeStock(themeId, id)).toBe(
        "その銘柄は見つからない",
      );
    }
    expect(await db.select().from(themeStock)).toHaveLength(1);
  });
});

/**
 * 画面から来る値はすべて文字列で、Number() が数字でない文字列を NaN に、
 * 桁数の多い文字列をそのままの数にする。どちらも integer 列には入らない（Issue #46）。
 * <select> からはこの値が出ないが、Server Action は画面を通さず直接POSTできる
 */
const UNUSABLE = [Number("abc"), 9999999999];
const UNUSABLE_MESSAGE = "入力に使えない値がある";

describe("問い合わせに渡せない値", () => {
  it("イベントの対象IDに入れるとエラー文が返る", async () => {
    for (const value of UNUSABLE) {
      expect(await createEvent({ ...BASE, themeId: value })).toBe(
        UNUSABLE_MESSAGE,
      );
      expect(await createEvent({ ...BASE, stockId: value })).toBe(
        UNUSABLE_MESSAGE,
      );
    }
    expect(await db.select().from(event)).toHaveLength(0);
  });

  it("銘柄の決算月に入れるとエラー文が返る", async () => {
    for (const value of UNUSABLE) {
      expect(await createStock({ ...TOYOTA, fiscalMonth: value })).toBe(
        UNUSABLE_MESSAGE,
      );
    }
    expect(await db.select().from(stock)).toHaveLength(0);
  });

  it("テーマ所属のテーマID・銘柄IDに入れるとエラー文が返る", async () => {
    for (const value of UNUSABLE) {
      expect(await createThemeStock(value, 1)).toBe(UNUSABLE_MESSAGE);
      expect(await createThemeStock(1, value)).toBe(UNUSABLE_MESSAGE);
    }
    expect(await db.select().from(themeStock)).toHaveLength(0);
  });

  it("イベントの更新でもエラー文が返る", async () => {
    // 更新も登録と同じ経路（run()）を通ることを固定する
    await createEvent({ ...BASE, market: "JP" });
    const { id } = await onlyEvent();

    expect(await updateEvent(id, { ...BASE, themeId: Number("abc") })).toBe(
      UNUSABLE_MESSAGE,
    );
    expect((await onlyEvent()).market).toBe("JP");
  });

  it("日付・時刻に入れるとエラー文が返る", async () => {
    // 日付は Number() を通らないが、日付として読めない文字列を date 列に渡すと
    // 同じく制約違反ではないエラーになる（イベント登録フォーム設計書 §7）。
    // 形が違う（"" や "abc"）ときと、形は日付だが値が範囲外（"2026-13-45"）の
    // ときで pg のエラーコードが分かれるため、両方を確かめる
    for (const startDate of ["", "abc", "2026-13-45"]) {
      expect(await createEvent({ ...BASE, market: "JP", startDate })).toBe(
        UNUSABLE_MESSAGE,
      );
    }
    for (const endDate of ["abc", "2026-13-45"]) {
      expect(await createEvent({ ...BASE, market: "JP", endDate })).toBe(
        UNUSABLE_MESSAGE,
      );
    }
    for (const time of ["zz", "25:99"]) {
      expect(await createEvent({ ...BASE, market: "JP", time })).toBe(
        UNUSABLE_MESSAGE,
      );
    }
    expect(await db.select().from(event)).toHaveLength(0);
  });
});

/**
 * 存在しないIDを指した外部キー違反。画面の選択肢はDBから出しているため、
 * 画面を通した操作では起きない。Server Action への直接POSTでだけ届く（Issue #49）
 */
describe("存在しないID", () => {
  it("イベントの対象に入れるとエラー文が返る", async () => {
    expect(await createEvent({ ...BASE, themeId: 999999 })).toBe(
      "そのテーマは無い",
    );
    expect(await createEvent({ ...BASE, stockId: 999999 })).toBe(
      "その銘柄は無い",
    );
    expect(await db.select().from(event)).toHaveLength(0);
  });

  it("テーマ所属のテーマID・銘柄IDに入れるとエラー文が返る", async () => {
    await createTheme("半導体");
    await createStock({ ...TOYOTA });
    const [{ themeId }] = await db.select({ themeId: theme.id }).from(theme);
    const [{ stockId }] = await db.select({ stockId: stock.id }).from(stock);

    expect(await createThemeStock(999999, stockId)).toBe("そのテーマは無い");
    expect(await createThemeStock(themeId, 999999)).toBe("その銘柄は無い");
    expect(await db.select().from(themeStock)).toHaveLength(0);
  });

  it("イベントの更新でもエラー文が返る", async () => {
    // 更新も登録と同じ経路（run()）を通ることを固定する
    await createEvent({ ...BASE, market: "JP" });
    const { id } = await onlyEvent();

    expect(await updateEvent(id, { ...BASE, themeId: 999999 })).toBe(
      "そのテーマは無い",
    );
    expect((await onlyEvent()).market).toBe("JP");
  });
});

describe("createEvents", () => {
  /** 市場イベントの入力を作る。対象は market の1列だけ */
  function marketEvent(overrides: Partial<EventInput> = {}): EventInput {
    return {
      title: "米消費者物価指数（2026年7月分）",
      shortLabel: "米CPI",
      startDate: "2026-08-12",
      endDate: null,
      time: "21:30",
      importance: 2,
      note: null,
      sourceUrl: "https://www.bls.gov/schedule/news_release/cpi.htm",
      sourceName: "U.S. Bureau of Labor Statistics",
      market: "GLOBAL",
      themeId: null,
      stockId: null,
      ...overrides,
    };
  }

  it("複数のイベントをまとめて登録できる", async () => {
    expect(
      await createEvents([
        marketEvent(),
        marketEvent({
          title: "米雇用統計（2026年8月分）",
          startDate: "2026-09-04",
        }),
      ]),
    ).toEqual(succeeded);

    expect(await db.select().from(event)).toHaveLength(2);
  });

  it("1行でも制約に反すると1件も入らない", async () => {
    // 2件目の重要度が範囲外。1件目は正しいが、取り引きごと戻る（設計書 §4）
    expect(
      await createEvents([marketEvent(), marketEvent({ importance: 9 })]),
    ).toBe("2行目: 重要度は1〜3");

    expect(await db.select().from(event)).toHaveLength(0);
  });

  it("短縮ラベルが長すぎる行があると1件も入らない", async () => {
    // DB の制約ではなくアプリ側で判定するものでも取り引きが戻る
    expect(
      await createEvents([
        marketEvent(),
        marketEvent({ shortLabel: "長すぎる短縮ラベル" }),
      ]),
    ).toBe("2行目: 短縮ラベルは全角5文字まで");

    expect(await db.select().from(event)).toHaveLength(0);
  });

  it("存在しない銘柄を指した行があると1件も入らない", async () => {
    expect(
      await createEvents([
        marketEvent(),
        marketEvent({ market: null, stockId: 999 }),
      ]),
    ).toBe("2行目: その銘柄は無い");

    expect(await db.select().from(event)).toHaveLength(0);
  });
});

describe("upsertMarketEvents", () => {
  /** 公表予定から作られる1件。名称に対象期が入るのが前提（設計書 §4） */
  function statEvent(overrides: Partial<EventInput> = {}): EventInput {
    return {
      title: "消費者物価指数（2026年1月分）",
      shortLabel: "日本CPI",
      startDate: "2026-02-20",
      endDate: null,
      time: "08:30",
      importance: 2,
      note: null,
      sourceUrl: "https://www.stat.go.jp/data/cpi/",
      sourceName: "総務省統計局",
      market: "JP",
      themeId: null,
      stockId: null,
      ...overrides,
    };
  }

  it("無い名称は登録される", async () => {
    expect(await upsertMarketEvents([statEvent()], STAT_TITLE_PATTERN)).toEqual(
      {
        created: ["消費者物価指数（2026年1月分）"],
        changed: [],
        deactivated: [],
        entries: [expect.objectContaining({ action: "create" })],
      },
    );

    const rows = await db.select().from(event);
    expect(rows).toHaveLength(1);
    expect(rows[0].startDate).toBe("2026-02-20");
    expect(rows[0].time).toBe("08:30:00");
  });

  it("同じ取り込みを2回実行しても2件に増えない", async () => {
    await upsertMarketEvents([statEvent()], STAT_TITLE_PATTERN);

    // time 列は '08:30' を入れると '08:30:00' で返る。文字列のまま比べていると
    // ここが changed 1件になり、値は同じなのに毎回「変わった」と出る
    expect(await upsertMarketEvents([statEvent()], STAT_TITLE_PATTERN)).toEqual(
      {
        created: [],
        changed: [],
        deactivated: [],
        entries: [],
      },
    );
    expect(await db.select().from(event)).toHaveLength(1);
  });

  it("公表日が変わると開始日が更新され、変更が返る", async () => {
    await upsertMarketEvents([statEvent()], STAT_TITLE_PATTERN);

    expect(
      await upsertMarketEvents(
        [statEvent({ startDate: "2026-02-24" })],
        STAT_TITLE_PATTERN,
      ),
    ).toEqual({
      created: [],
      changed: [
        {
          title: "消費者物価指数（2026年1月分）",
          // 前後ともDBから受け取った値。時刻の書き方が揃う
          from: { startDate: "2026-02-20", time: "08:30:00" },
          to: { startDate: "2026-02-24", time: "08:30:00" },
        },
      ],
      deactivated: [],
      entries: [expect.objectContaining({ action: "update" })],
    });

    const rows = await db.select().from(event);
    expect(rows).toHaveLength(1);
    expect(rows[0].startDate).toBe("2026-02-24");
  });

  it("公表時刻が変わると時刻が更新される", async () => {
    await upsertMarketEvents([statEvent()], STAT_TITLE_PATTERN);

    await upsertMarketEvents(
      [statEvent({ time: "14:00" })],
      STAT_TITLE_PATTERN,
    );

    const rows = await db.select().from(event);
    expect(rows[0].time).toBe("14:00:00");
  });

  it("運用者が直した短縮ラベル・重要度・備考は上書きされない", async () => {
    await upsertMarketEvents([statEvent()], STAT_TITLE_PATTERN);
    await db
      .update(event)
      .set({ shortLabel: "CPI", importance: 3, note: "手で直した備考" });

    // 公表日が変わった取り込みでも、更新するのは開始日と時刻の2列だけ（設計書 §1 #6）
    await upsertMarketEvents(
      [statEvent({ startDate: "2026-02-24" })],
      STAT_TITLE_PATTERN,
    );

    const rows = await db.select().from(event);
    expect(rows[0].shortLabel).toBe("CPI");
    expect(rows[0].importance).toBe(3);
    expect(rows[0].note).toBe("手で直した備考");
    expect(rows[0].startDate).toBe("2026-02-24");
  });

  it("登録と更新が混ざっても両方が返る", async () => {
    await upsertMarketEvents([statEvent()], STAT_TITLE_PATTERN);

    expect(
      await upsertMarketEvents(
        [
          statEvent({ startDate: "2026-02-24" }),
          statEvent({
            title: "消費者物価指数（2026年2月分）",
            startDate: "2026-03-24",
          }),
        ],
        STAT_TITLE_PATTERN,
      ),
    ).toMatchObject({
      created: ["消費者物価指数（2026年2月分）"],
      changed: [{ title: "消費者物価指数（2026年1月分）" }],
    });
    expect(await db.select().from(event)).toHaveLength(2);
  });

  it("同じ名称が1回の入力に2つあっても1件しか入らない", async () => {
    await upsertMarketEvents([statEvent(), statEvent()], STAT_TITLE_PATTERN);

    expect(await db.select().from(event)).toHaveLength(1);
  });

  it("途中で失敗すると1件も入らない", async () => {
    // 2件目の重要度が範囲外。1件目は正しいが、取り引きごと戻る
    await expect(
      upsertMarketEvents(
        [
          statEvent(),
          statEvent({
            title: "消費者物価指数（2026年2月分）",
            importance: 9,
          }),
        ],
        STAT_TITLE_PATTERN,
      ),
    ).rejects.toThrow();

    expect(await db.select().from(event)).toHaveLength(0);
  });

  it("空の並びを渡すと何もしない", async () => {
    // 区分の名前が変わって月次が0件になったときにここへ来る。ここで
    // 非アクティブ化まで走ると、取り込んだこれからの回が全部消える
    await upsertMarketEvents(
      [
        statEvent({
          title: "消費者物価指数（2099年1月分）",
          startDate: "2099-02-20",
        }),
      ],
      STAT_TITLE_PATTERN,
    );

    expect(await upsertMarketEvents([], STAT_TITLE_PATTERN)).toEqual({
      created: [],
      changed: [],
      deactivated: [],
      entries: [],
    });

    const rows = await db.select().from(event);
    expect(rows).toHaveLength(1);
    expect(rows[0].active).toBe(true);
  });

  /**
   * 非アクティブ化のテスト（非アクティブ化 設計書 §3）。
   * 2099年＝これからの回、1999年＝公表済みの回。今日を跨がない年にしてある
   */
  const FUTURE = statEvent({
    title: "消費者物価指数（2099年1月分）",
    startDate: "2099-02-20",
  });
  const PAST = statEvent({
    title: "消費者物価指数（1999年1月分）",
    startDate: "1999-02-20",
  });

  it("公表予定から消えたこれからの回は非アクティブになり、行は残る", async () => {
    await upsertMarketEvents([FUTURE], STAT_TITLE_PATTERN);

    // 別の回だけが載っている公表予定。2099年1月分は載らなくなった
    expect(
      await upsertMarketEvents([statEvent()], STAT_TITLE_PATTERN),
    ).toMatchObject({ deactivated: ["消費者物価指数（2099年1月分）"] });

    const rows = await db.select().from(event).orderBy(event.startDate);
    expect(rows).toHaveLength(2);
    expect(rows[1].title).toBe("消費者物価指数（2099年1月分）");
    expect(rows[1].active).toBe(false);
  });

  it("公表予定から消えても公表済みの回はアクティブのまま残る", async () => {
    // 窓から落ちただけで、その日に発表はあった。過去のカレンダーの記録になる
    await upsertMarketEvents([PAST], STAT_TITLE_PATTERN);

    expect(
      await upsertMarketEvents([statEvent()], STAT_TITLE_PATTERN),
    ).toMatchObject({ deactivated: [] });

    const [row] = await db
      .select()
      .from(event)
      .where(eq(event.title, "消費者物価指数（1999年1月分）"));
    expect(row.active).toBe(true);
  });

  it("また公表予定に載ればアクティブに戻る", async () => {
    await upsertMarketEvents([FUTURE], STAT_TITLE_PATTERN);
    await upsertMarketEvents([statEvent()], STAT_TITLE_PATTERN);

    // 公表日が変わっていなくても戻す。開始日と時刻の比較で更新を止めていると、
    // 中止されて戻った回が非アクティブのまま残る
    await upsertMarketEvents([FUTURE], STAT_TITLE_PATTERN);

    const [row] = await db
      .select()
      .from(event)
      .where(eq(event.title, "消費者物価指数（2099年1月分）"));
    expect(row.active).toBe(true);
  });

  it("取り込みが名づけない名称の行は触らない", async () => {
    // 公表予定に載っているのに取り込みが落とす回（東京都区部・年平均）を
    // 運用者が手で登録した場合。出典URLは取り込みと同じものしか無い。
    // 出典URLで所有を見分けると、載っているのにここが非アクティブになる
    await db.insert(event).values([
      {
        title: "東京都区部消費者物価指数（2099年1月分）",
        shortLabel: "都区部CPI",
        startDate: "2099-01-30",
        importance: 2,
        market: "JP",
        sourceName: "総務省統計局",
        sourceUrl: "https://www.stat.go.jp/data/cpi/",
      },
      {
        title: "消費者物価指数（2099年平均）",
        shortLabel: "日本CPI年",
        startDate: "2099-01-22",
        importance: 2,
        market: "JP",
        sourceName: "総務省統計局",
        sourceUrl: "https://www.stat.go.jp/data/cpi/",
      },
    ]);

    expect(
      await upsertMarketEvents([statEvent()], STAT_TITLE_PATTERN),
    ).toMatchObject({ deactivated: [] });

    const rows = await db.select().from(event);
    expect(rows.filter((row) => row.active)).toHaveLength(3);
  });
});
