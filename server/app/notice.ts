/**
 * 登録・更新・削除が済んだあとに出す知らせの文言（Issue #164）。
 *
 * **文言はここ1か所に置く。** 知らせを出す所は2つある。登録は Server Action の
 * 戻り値を受けた `app/form.tsx` の ActionForm、更新・削除は移った先の URL の印
 * （`?done=`）を読む `app/app-shell/done-notice.tsx`。どちらもこの表から引く。
 * 別々に書くと、#165 で登録が別ページへ移って経路が変わったときに文言がずれる。
 *
 * URL の値を言葉としてそのまま出さない。この表にあるキーだけを出す
 */
export const NOTICES = {
  "stock-added": "銘柄を登録しました",
  "theme-added": "テーマを登録しました",
  "theme-stock-added": "テーマ所属を登録しました",
  "event-added": "イベントを登録しました",
  "events-added": "イベントをまとめて登録しました",
  "stock-updated": "銘柄を更新しました",
  "theme-updated": "テーマを更新しました",
  "event-updated": "イベントを更新しました",
  "stock-removed": "銘柄を削除しました",
  "theme-removed": "テーマを削除しました",
  "theme-stock-removed": "テーマ所属を外しました",
  "event-removed": "イベントを削除しました",
} as const;

export type NoticeKey = keyof typeof NOTICES;

/** 移った先の URL で、済んだことを渡す印の名前 */
export const DONE_PARAM = "done";

/** URL から読んだ値が表のキーかどうか */
export function isNoticeKey(value: string | null): value is NoticeKey {
  return value !== null && Object.hasOwn(NOTICES, value);
}

/**
 * Server Action の戻り値。失敗なら画面に出す断りの文、成功なら知らせのキー。
 *
 * 成功を `null` にしない。`null` だと ActionForm が「済んだ」と「何も起きていない」を
 * 見分けられず、知らせを出す手がかりが無い
 */
export type ActionResult = { error: string } | { notice: NoticeKey };

/** Server Action の形。ActionForm が FormData を渡す */
export type Action = (formData: FormData) => Promise<ActionResult>;
