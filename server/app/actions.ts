"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isAdmin } from "../src/admin";
import { db } from "../src/db";
import { record } from "../src/db/audit";
import { stock, theme } from "../src/db/schema";
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
  type StockInput,
  updateEvent,
  updateStock,
  updateTheme,
  type WriteResult,
} from "../src/db/write";
import { toEventInputs } from "./bulk-event-input";
import { toEventInput } from "./event-input";
import { requireSession, requireUserId, type Session } from "./guard";

// サインインはここに置かない。ブラウザから Better Auth の HTTP エンドポイントを
// 叩く（app/signin/signin-form.tsx）。auth.api の直接呼び出しは回数制限を通らないため（設計書 §6）

/**
 * 管理者かどうかを確かめる。管理者なら null、そうでなければ拒む理由を返す。
 * 削除は取り返せないため、管理者だけができる（設計書 §9）。
 *
 * 拒み方を `redirect()` にしない。削除は成功しても `redirect("/")` するため、
 * 拒否と成功が同じ `NEXT_REDIRECT` になり、拒まれたことを画面でもテストでも
 * 見分けられなくなる（実測。→ 入力者を3人にする設計書 §4）。
 * 戻り値のエラー文は、他の Server Action と同じく ActionForm が表示する。
 *
 * セッションを自分で読まずに受け取る。読むと、記録に残す利用者IDを取るために
 * 同じセッションをもう1度読むことになる
 */
function requireAdmin(session: Session): string | null {
  return isAdmin(session.user.email) ? null : "削除できるのは管理者だけ";
}

/**
 * 書き込みを実行し、成功したら監査ログに記録する（設計書 §5.2）。
 * 成功で null、書き込みか記録の失敗で画面に出す日本語のエラー文を返す。
 *
 * **12の Server Action がすべてこれを通る。** 個々の関数が記録を自分で呼ぶ形に
 * しないのは、呼び忘れがそのまま記録の漏れになるため。3つ目の書き込みの経路が
 * 増えたときは `src/db/write-boundary.test.ts` が落ちる
 */
async function audited(
  userId: string | null,
  write: Promise<WriteResult>,
): Promise<string | null> {
  const result = await write;
  return typeof result === "string" ? result : record(userId, result);
}

/**
 * FormData を受け取って書き込みを実行する部分。Server Action ごとに違うのはここだけ。
 *
 * 失敗を投げずに戻す。`WriteResult` は失敗のとき画面に出す日本語のエラー文
 * （`src/db/write.ts`）なので、書き込みの前に弾いた入力の誤りも同じ形で返せる
 * （→ `addEvents`）
 */
type Write = (formData: FormData) => Promise<WriteResult>;

/** Server Action の形。`useActionState` が前の状態と FormData を渡す */
type Action = (
  previous: string | null,
  formData: FormData,
) => Promise<string | null>;

/**
 * Server Action の外枠を作る。**12本すべてがこれを通る。**
 *
 * 寄せる前は12本が同じ外枠を書き写しており、合わせて235行あった（Issue #141）。
 * 書き写す形だと、新しい Server Action を1本足すときに `audited` や
 * `revalidatePath` を書き忘れてもエラーにならず、記録の残らない書き込みや
 * 画面に出ない更新が黙って1本増える。
 *
 * **`app/guard.ts` へは出せない。** ここは書き込み関数を呼ぶ場所で、
 * `src/db/write-boundary.test.ts` が「書き込み関数を呼べるのは記録を差し込んだ
 * 2つだけ」を見ている。外へ出すと3つ目の経路として落ちる。あの検査は
 * うっかり増えた経路を鳴らすためのもので、緩めない。
 *
 * @param write 書き込みの中身。Server Action ごとに違うのはここだけ
 * @param options.adminOnly 管理者だけができる操作（削除）に付ける
 * @param options.redirectTo 成功したときの行き先。省くとその画面に留まる
 */
function action(
  write: Write,
  options: { adminOnly?: boolean; redirectTo?: string } = {},
): Action {
  return async (_previous, formData) => {
    // 管理者の判定が要るときだけセッションを丸ごと読む。要らないときに読むと、
    // 記録に残す利用者IDを取るためだけにメールアドレスまで持ち回ることになる
    let userId: string;
    if (options.adminOnly) {
      const session = await requireSession();
      const denied = requireAdmin(session);
      if (denied) {
        return denied;
      }
      userId = session.user.id;
    } else {
      userId = await requireUserId();
    }

    const message = await audited(userId, write(formData));
    if (message) {
      return message;
    }

    // 更新・削除は成功したら一覧に戻す（設計書 §5.3）。編集ページに留まらせると
    // 「更新した」を出すための状態を別に持つことになる。
    // redirect() は例外を投げて動くため、revalidatePath() を先に呼ぶ
    revalidatePath("/");
    if (options.redirectTo) {
      redirect(options.redirectTo);
    }
    return null;
  };
}

/**
 * 決算月の入力を読む。
 * フォームの空欄は FormData で "" になり、そのまま smallint に入れると
 * 制約違反ではない型変換エラーで 500 になる（設計書 §7 A）
 */
function toFiscalMonth(value: FormDataEntryValue | null): number | null {
  const text = String(value ?? "");
  return text === "" ? null : Number(text);
}

/** 銘柄フォームの FormData を createStock / updateStock の入力にする */
function toStockInput(formData: FormData): StockInput {
  return {
    // <select> の選択肢は JP と US だけだが、値の妥当性はここで絞り込まず
    // そのまま渡し、DB の stock_market_check 制約に弾かせる（設計書 §5）
    market: String(formData.get("market") ?? ""),
    ticker: String(formData.get("ticker") ?? ""),
    name: String(formData.get("name") ?? ""),
    fiscalMonth: toFiscalMonth(formData.get("fiscalMonth")),
  };
}

/** URL やフォームの隠し欄から来るID。値の妥当性は `src/db/write.ts` の `isId` が見る */
const idOf = (formData: FormData, name: string): number =>
  Number(formData.get(name));

// 以下が12本の Server Action。戻り値はどれも失敗したときのエラー文で、
// `useActionState` の状態になる（画面に出すのは `app/form.tsx` の ActionForm）

/** 銘柄を登録する */
export const addStock = action((formData) =>
  createStock(toStockInput(formData)),
);

/** テーマを登録する */
export const addTheme = action((formData) =>
  createTheme(String(formData.get("name") ?? "")),
);

/** テーマ所属を登録する */
export const addThemeStock = action((formData) =>
  createThemeStock(idOf(formData, "themeId"), idOf(formData, "stockId")),
);

/** イベントを登録する */
export const addEvent = action((formData) =>
  createEvent(toEventInput(formData)),
);

/**
 * イベントをまとめて登録する。
 *
 * 対象はティッカーとテーマ名で書くため、IDを引くための対応表をここで読む（設計書 §3）。
 * 行ごとに問い合わせず、2回の読み出しで済ませる。
 *
 * 貼り付けた行が読めなかったときの文言も、書き込みの失敗と同じ形で返す
 * （`WriteResult` は失敗のとき日本語のエラー文なので、そのまま戻せる）
 */
export const addEvents = action(async (formData) => {
  const [stocks, themes] = await Promise.all([
    db
      .select({ id: stock.id, market: stock.market, ticker: stock.ticker })
      .from(stock),
    db.select({ id: theme.id, name: theme.name }).from(theme),
  ]);

  const inputs = toEventInputs(String(formData.get("rows") ?? ""), {
    stocks,
    themes,
  });
  return typeof inputs === "string" ? inputs : createEvents(inputs);
});

/** 銘柄を更新する */
export const editStock = action(
  (formData) => updateStock(idOf(formData, "id"), toStockInput(formData)),
  { redirectTo: "/" },
);

/** テーマを更新する */
export const editTheme = action(
  (formData) =>
    updateTheme(idOf(formData, "id"), String(formData.get("name") ?? "")),
  { redirectTo: "/" },
);

/**
 * イベントを更新する。
 * 戻す先が `/` ではないのは、イベントの一覧が `/events` にあるため（Issue #112）。
 * `/` へ戻すと、今直したイベントが出ていない画面に着く
 */
export const editEvent = action(
  (formData) => updateEvent(idOf(formData, "id"), toEventInput(formData)),
  { redirectTo: "/events" },
);

/** 銘柄を削除する */
export const removeStock = action(
  (formData) => deleteStock(idOf(formData, "id")),
  { adminOnly: true, redirectTo: "/" },
);

/** テーマを削除する */
export const removeTheme = action(
  (formData) => deleteTheme(idOf(formData, "id")),
  { adminOnly: true, redirectTo: "/" },
);

/** テーマ所属を外す */
export const removeThemeStock = action(
  (formData) =>
    deleteThemeStock(idOf(formData, "themeId"), idOf(formData, "stockId")),
  { adminOnly: true, redirectTo: "/" },
);

/**
 * イベントを削除する。
 * 戻す先が `/events` なのは、消したイベントが消えたことをそこでしか確かめられないため
 */
export const removeEvent = action(
  (formData) => deleteEvent(idOf(formData, "id")),
  { adminOnly: true, redirectTo: "/events" },
);
