import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from ".";
import { pgError } from "./pg-error";
import { event, holding, stock, theme, themeStock } from "./schema";

/**
 * 制約違反を画面に出す日本語にする（設計書 §5）。
 * 制約名は server/drizzle/ のマイグレーションの実物
 */
const MESSAGES: Record<string, string> = {
  stock_market_ticker_unique: "その市場のティッカーは登録済み",
  stock_market_check: "市場は JP か US",
  stock_ticker_check:
    "ティッカーは半角の数字・英大文字・ピリオド・ハイフンだけ使える",
  stock_fiscal_month_market_check: "決算月はJP銘柄にだけ入れられる",
  stock_fiscal_month_check: "決算月は1〜12",
  holding_user_id_stock_id_pk: "その銘柄はすでに保有に登録済み",
  theme_name_unique: "そのテーマ名は登録済み",
  theme_stock_theme_id_stock_id_pk: "その銘柄はすでにこのテーマに登録済み",
  event_target_exclusive_check: "対象は市場・テーマ・銘柄のどれか1つを選ぶ",
  event_period_check: "終了日は開始日より後にする（単日は空のまま）",
  event_importance_check: "重要度は1〜3",
  event_source_name_check: "出典の名前を入れるならURLも入れる",
  event_market_check: "市場は JP・US・GLOBAL のどれか",
  // 存在しないIDを指した外部キー違反。選択肢は画面がDBから出しているため、
  // 画面を通した操作では起きない。Server Action への直接POSTでだけ届く。
  // holding_user_id_user_id_fk は入れない。利用者IDはセッションから来るため
  // 画面からは届かず、サインイン中に利用者が消えた場合にしか出ない（Issue #49）。
  //
  // この文は INSERT と UPDATE のときの意味。削除では同じ制約名が正反対の意味で
  // 返るため、下の DELETE_MESSAGES で分ける（銘柄・テーマの編集 設計書 §2）
  event_theme_id_theme_id_fk: "そのテーマは無い",
  event_stock_id_stock_id_fk: "その銘柄は無い",
  holding_stock_id_stock_id_fk: "その銘柄は無い",
  theme_stock_theme_id_theme_id_fk: "そのテーマは無い",
  theme_stock_stock_id_stock_id_fk: "その銘柄は無い",
};

/**
 * 参照されている行を消そうとしたときの日本語（銘柄・テーマの編集 設計書 §2）。
 *
 * 制約名は MESSAGES と同じものが返る。同じ名前で意味が正反対になるため、
 * 上の表とは別に持つ。ここに載るのは ON DELETE restrict の3本だけで、
 * theme_stock の2本は cascade のため削除では返らない
 */
const DELETE_MESSAGES: Record<string, string> = {
  event_stock_id_stock_id_fk: "その銘柄はイベントに使われていて消せない",
  holding_stock_id_stock_id_fk: "その銘柄は保有に登録されていて消せない",
  event_theme_id_theme_id_fk: "そのテーマはイベントに使われていて消せない",
};

/**
 * ON DELETE restrict に阻まれたときの pg のエラーコード。
 * 外部キー違反（23503）とは別の専用のコードを持つ。
 *
 * このコードが返る経路は削除だけである。restrict が付いているのは ON DELETE の
 * 側だけで、外部キー8本の ON UPDATE はすべて no action（drizzle/0000_simple_blacklash.sql）。
 * 参照先の id は generatedAlwaysAsIdentity で更新されず、実測でも参照されている
 * 銘柄のティッカーは更新できる（銘柄・テーマの編集 設計書 §2）。
 *
 * **stock か theme を参照する外部キーを足すときは onDelete を必ず書く。**
 * 省くと既定の no action になり、削除を弾いたときのコードが 23503 になって
 * この分岐に入らない。DELETE_MESSAGES ではなく MESSAGES 側に落ち、
 * 「その銘柄は無い」という正反対の文が戻る。schema.test.ts がこれを判定する
 */
const RESTRICT_VIOLATION = "23001";

/**
 * 渡した値が列に入らないときの pg のエラーコードの先頭2桁。
 * 数の範囲外（22003）・形式違い（22P02）・日付や時刻の形式違い（22007）と
 * 範囲外（22008）が、すべてこの1つのまとまりに入る。
 * 制約違反は 23、接続断は 08 で、どちらもここには当たらず投げ直す。
 *
 * 画面から来る値はすべて文字列のまま、または Number() を通して DB に渡している。
 * Number() は数字でない文字列を NaN に、桁数の多い文字列をそのままの数にするが、
 * どちらも integer 列には入らない。制約違反ではないため MESSAGES を通らない。
 * <input> や <select> からはこの値が出ないが、Server Action は画面を通さず直接POSTできる。
 *
 * 今のスキーマの列は数値・日付・文字列だけで、このまとまりのエラーは画面から来た値が
 * 列に入らないときにしか出ない。ただし 2200H（id の採番が 2147483647 を超えた）だけは
 * このまとまりに入るのに入力の話ではない。手で登録するイベントでは届かないため分けない。
 * uuid や json の列を足すと、実装側のバグも同じコードで出るようになるため、
 * そのときは列ごとの判定が要る
 */
const INVALID_VALUE_CLASS = "22";

/**
 * 書き込みを実行し、上の表にある制約違反なら日本語のエラー文を返す。
 * 列に入らない値も日本語のエラー文にする。それ以外のエラーは投げ直す。
 * 握りつぶすと、理由が出ないまま失敗する画面になる
 */
async function run(operation: Promise<unknown>): Promise<string | null> {
  try {
    await operation;
  } catch (error) {
    const { code, constraint } = pgError(error);
    // 削除で参照が残っているときだけ別の表を引く。制約名は登録・更新と同じものが
    // 返るため、名前ではなくコードで振り分ける（銘柄・テーマの編集 設計書 §2）
    const message = (code === RESTRICT_VIOLATION ? DELETE_MESSAGES : MESSAGES)[
      constraint ?? ""
    ];
    if (message) {
      return message;
    }
    if (code?.startsWith(INVALID_VALUE_CLASS)) {
      // どの列かは pg のエラーから取れないため、文言は列ごとに分けない
      return "入力に使えない値がある";
    }
    throw error;
  }
  return null;
}

/**
 * 名前の前後の空白を落とす。空白だけなら null を返す。
 *
 * stock.name と theme.name は notNull だが空文字を弾く CHECK が無く、
 * <input required> は "" しか弾かないため "   " が素通りする。
 * テーマ名では「半導体」と「半導体 」が別のテーマとして UNIQUE も素通りし、
 * 画面には見分けの付かない選択肢が2つ並ぶ（テーマ登録 設計書 §3.1）。
 *
 * CHECK 制約にはしない。空を弾くことはできても「半導体 」を「半導体」に
 * そろえる正規化はできず、この関数の置き換えにならない（銘柄・テーマの編集 設計書 §5）
 */
function trimmedName(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export type StockInput = {
  /** DB の stock_market_check 制約が正。ここでは絞り込まない */
  market: string;
  ticker: string;
  name: string;
  /** 決算月（1〜12）。JP銘柄のみ。US銘柄では null（全体設計書 §4.1） */
  fiscalMonth: number | null;
};

/**
 * 銘柄の列に入れる値。market は Drizzle 上 "JP" | "US" の型だが、
 * StockInput.market は string。as で型を偽らず、生の値のまま渡して
 * DB の stock_market_check に判定させる
 */
function stockValues(input: StockInput, name: string) {
  return { ...input, name, market: sql`${input.market}` };
}

/** 銘柄を登録する。成功で null、制約違反で日本語のエラー文を返す */
export async function createStock(input: StockInput): Promise<string | null> {
  const name = trimmedName(input.name);
  return name === null
    ? "銘柄名を入れる"
    : run(db.insert(stock).values(stockValues(input, name)));
}

/**
 * 保有を登録する。成功で null、制約違反で日本語のエラー文を返す。
 * userId はセッションから渡す。この関数はセッションを読まない（設計書 §4）
 */
export function createHolding(
  userId: string,
  stockId: number,
): Promise<string | null> {
  return run(db.insert(holding).values({ userId, stockId }));
}

/** テーマを登録する。成功で null、失敗で日本語のエラー文を返す */
export async function createTheme(name: string): Promise<string | null> {
  const trimmed = trimmedName(name);
  return trimmed === null
    ? "テーマ名を入れる"
    : run(db.insert(theme).values({ name: trimmed }));
}

/** テーマ所属を登録する。成功で null、制約違反で日本語のエラー文を返す */
export function createThemeStock(
  themeId: number,
  stockId: number,
): Promise<string | null> {
  return run(db.insert(themeStock).values({ themeId, stockId }));
}

export type EventInput = {
  title: string;
  /** カレンダーのセルに出す略号。幅の上限はここで判定する（全体設計書 §14 #10） */
  shortLabel: string;
  startDate: string;
  /** null は単日を表す（全体設計書 §4.2） */
  endDate: string | null;
  /** JST。null は時刻なし */
  time: string | null;
  importance: number;
  note: string | null;
  sourceUrl: string | null;
  /** 画面に出す出典の名前。入れるなら sourceUrl も要る（出典表示設計書 §3.1） */
  sourceName: string | null;
  // 以下3列が対象。ちょうど1つだけ非NULLであることは DB の
  // event_target_exclusive_check が判定する。ここでは絞り込まない（設計書 §4）
  market: string | null;
  themeId: number | null;
  stockId: number | null;
};

/** 短縮ラベルの上限。半角を1・全角を2として数えた幅で、10 は全角5文字ぶん（設計書 §3） */
const SHORT_LABEL_MAX_WIDTH = 10;

/**
 * 短縮ラベルの表示幅を数える。半角が1、全角が2。
 * 半角とみなすのは ASCII の表示文字（空白〜チルダ）と半角カナ
 */
function labelWidth(text: string): number {
  return [...text].reduce((w, c) => w + (/[ -~｡-ﾟ]/.test(c) ? 1 : 2), 0);
}

/**
 * 短縮ラベルの幅を判定し、長すぎれば日本語のエラー文を返す。
 * 短縮ラベルの幅だけは DB に制約が無いためここで判定する（設計書 §3）
 */
function tooLongLabel(shortLabel: string): string | null {
  return labelWidth(shortLabel) > SHORT_LABEL_MAX_WIDTH
    ? "短縮ラベルは全角5文字まで"
    : null;
}

/**
 * イベントの列に入れる値。market は Drizzle 上 "JP" | "US" | "GLOBAL" の型だが、
 * EventInput.market は string | null。as で型を偽らず、生の値のまま渡して
 * DB の event_market_check に判定させる
 */
function eventValues(input: EventInput) {
  return { ...input, market: sql`${input.market}` };
}

/** イベントを登録する。成功で null、失敗で日本語のエラー文を返す */
export async function createEvent(input: EventInput): Promise<string | null> {
  return (
    tooLongLabel(input.shortLabel) ??
    run(db.insert(event).values(eventValues(input)))
  );
}

/** integer 列に入る最大値。これを超える値を渡すと型変換エラーになる */
const MAX_ID = 2147483647;

/**
 * 問い合わせに渡してよいIDかを判定する。
 *
 * 画面やURLから来る id は文字列で、Number() が NaN や integer の範囲外の数を
 * 返すことがある。それをそのまま integer 列に渡すと、制約違反ではない
 * 型変換エラーになり、日本語化を通らず 500 になる（イベントの編集・削除 設計書 §6）。
 *
 * event.id・stock.id・theme.id で1つを使う。3列とも
 * integer().primaryKey().generatedAlwaysAsIdentity() で判定に差が入る余地が無い
 */
export function isId(id: number): boolean {
  return Number.isInteger(id) && id >= 1 && id <= MAX_ID;
}

/** 問い合わせに渡せないIDなら日本語のエラー文を返す。label は「銘柄」等 */
function invalidId(id: number, label: string): string | null {
  return isId(id) ? null : `その${label}は見つからない`;
}

/**
 * 銘柄を更新する。成功で null、失敗で日本語のエラー文を返す。
 * 該当するIDが無ければ0件更新になり、成功として null を返す。
 *
 * 市場とティッカーも変えられる。参照しているイベント・保有・テーマ所属は
 * stock.id で紐づいているため、変えても参照は外れない（設計書 §4）
 */
export async function updateStock(
  id: number,
  input: StockInput,
): Promise<string | null> {
  const name = trimmedName(input.name);
  return (
    invalidId(id, "銘柄") ??
    (name === null
      ? "銘柄名を入れる"
      : run(
          db
            .update(stock)
            .set(stockValues(input, name))
            .where(eq(stock.id, id)),
        ))
  );
}

/**
 * 銘柄を削除する。成功で null、失敗で日本語のエラー文を返す。
 * 該当するIDが無ければ0件削除になり、成功として null を返す。
 * イベント・保有から参照されていると消せず、テーマ所属は一緒に消える（設計書 §2）
 */
export async function deleteStock(id: number): Promise<string | null> {
  return invalidId(id, "銘柄") ?? run(db.delete(stock).where(eq(stock.id, id)));
}

/**
 * テーマを更新する。成功で null、失敗で日本語のエラー文を返す。
 * 該当するIDが無ければ0件更新になり、成功として null を返す
 */
export async function updateTheme(
  id: number,
  name: string,
): Promise<string | null> {
  const trimmed = trimmedName(name);
  return (
    invalidId(id, "テーマ") ??
    (trimmed === null
      ? "テーマ名を入れる"
      : run(db.update(theme).set({ name: trimmed }).where(eq(theme.id, id))))
  );
}

/**
 * テーマを削除する。成功で null、失敗で日本語のエラー文を返す。
 * 該当するIDが無ければ0件削除になり、成功として null を返す。
 * イベントから参照されていると消せず、テーマ所属は一緒に消える（設計書 §2）
 */
export async function deleteTheme(id: number): Promise<string | null> {
  return (
    invalidId(id, "テーマ") ?? run(db.delete(theme).where(eq(theme.id, id)))
  );
}

/**
 * イベントを更新する。成功で null、失敗で日本語のエラー文を返す。
 * 該当するIDが無ければ0件更新になり、成功として null を返す
 */
export async function updateEvent(
  id: number,
  input: EventInput,
): Promise<string | null> {
  return (
    invalidId(id, "イベント") ??
    tooLongLabel(input.shortLabel) ??
    run(db.update(event).set(eventValues(input)).where(eq(event.id, id)))
  );
}

/**
 * イベントを削除する。成功で null、失敗で日本語のエラー文を返す。
 * event は他のテーブルから参照されないため、外部キー違反は起きない（設計書 §3.2）
 */
export async function deleteEvent(id: number): Promise<string | null> {
  return (
    invalidId(id, "イベント") ?? run(db.delete(event).where(eq(event.id, id)))
  );
}

/** 取り込みで公表日時が変わった1件。何が変わったかを実行時に出すために返す */
export type ScheduleChange = {
  title: string;
  from: { startDate: string; time: string | null };
  to: { startDate: string; time: string | null };
};

/** 取り込みの結果。入れた名称の並びと、公表日時が変わった行の一覧 */
export type UpsertResult = {
  created: string[];
  changed: ScheduleChange[];
};

/**
 * 公表予定の取り込み用に、市場イベントを登録または更新する
 * （公表予定の取り込み設計書 §4）。
 *
 * 名称が無ければ登録し、あれば**開始日と時刻だけ**を更新する。短縮ラベル・
 * 重要度・備考は運用者が手で直す列なので上書きしない。
 *
 * 名称で引けるのは、名称に対象期が入っていて公表回ごとに1つに定まるため。
 * ただし `event` に一意の制約は無く、同じ名称の行が手で2件入っていると、
 * 更新が当たるのは1件だけでもう1件は古い公表日のまま残る。運用者が1人で
 * この経路しか使わない前提で制約は足さない。
 *
 * 失敗はエラー文にせず投げる。呼び出すのは画面ではなくスクリプトで、
 * 表示するエラー文が要らない
 */
export async function upsertMarketEvents(
  inputs: EventInput[],
): Promise<UpsertResult> {
  const created: string[] = [];
  const changed: ScheduleChange[] = [];
  if (inputs.length === 0) {
    return { created, changed };
  }

  await db.transaction(async (tx) => {
    const existing = await tx
      .select({
        id: event.id,
        title: event.title,
        startDate: event.startDate,
        time: event.time,
      })
      .from(event)
      .where(
        inArray(
          event.title,
          inputs.map((input) => input.title),
        ),
      );
    const found = new Map(existing.map((row) => [row.title, row]));

    for (const input of inputs) {
      const row = found.get(input.title);
      if (!row) {
        const [inserted] = await tx
          .insert(event)
          .values(eventValues(input))
          .returning({
            id: event.id,
            title: event.title,
            startDate: event.startDate,
            time: event.time,
          });
        // 入れた行を控える。同じ名称が1回の入力に2つあると、控えないと2件入る
        found.set(inserted.title, inserted);
        created.push(input.title);
        continue;
      }
      // 違うかどうかの判定はDBに任せる。time 列は '08:30' を入れると '08:30:00' で
      // 返るため、文字列のまま比べると毎回「変わった」になる
      const updated = await tx
        .update(event)
        .set({ startDate: input.startDate, time: input.time })
        .where(
          and(
            eq(event.id, row.id),
            sql`(${event.startDate}, ${event.time}) IS DISTINCT FROM (${input.startDate}::date, ${input.time}::time)`,
          ),
        )
        .returning({ startDate: event.startDate, time: event.time });
      // 更新後の値もDBから受け取る。入力の '08:30' をそのまま使うと、
      // 前後で時刻の書き方が変わって「08:30:00 → 08:30」と出る
      const [after] = updated;
      if (after) {
        changed.push({
          title: input.title,
          from: { startDate: row.startDate, time: row.time },
          to: after,
        });
      }
    }
  });
  return { created, changed };
}

/**
 * まとめて登録の途中で失敗したことを表す。
 * 取り引きの中から投げると Drizzle が ROLLBACK する
 */
class BulkFailure extends Error {}

/**
 * イベントをまとめて登録する。成功で null、失敗で行番号付きの日本語のエラー文を返す。
 *
 * **1行でも失敗したら1件も入れない**（設計書 §4）。一部だけ入った状態は、
 * 何が入って何が入らなかったのかを運用者が確かめられず、貼り直すと二重に入る。
 *
 * 1行ずつ INSERT する。まとめて1回の INSERT にすると、どの行が失敗したかが
 * 分からず行番号を出せない。貼り付ける行数はせいぜい数十で、1行ずつでも問題にならない
 */
export async function createEvents(
  inputs: EventInput[],
): Promise<string | null> {
  try {
    await db.transaction(async (tx) => {
      for (const [index, input] of inputs.entries()) {
        const message =
          tooLongLabel(input.shortLabel) ??
          (await run(tx.insert(event).values(eventValues(input))));
        if (message) {
          throw new BulkFailure(`${index + 1}行目: ${message}`);
        }
      }
    });
  } catch (error) {
    // 途中で失敗したときの文言はここで取り出す。それ以外の例外は投げ直す
    if (error instanceof BulkFailure) {
      return error.message;
    }
    throw error;
  }
  return null;
}
