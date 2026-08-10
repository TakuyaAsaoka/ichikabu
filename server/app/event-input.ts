import type { EventInput } from "../src/db/register";

// "use server" を付けない素のモジュールにしてある。app/actions.ts は next/headers を
// 使うため Vitest から読み込めず、ここに置いた変換だけがテストできる（設計書 §5）

/**
 * 空欄を null に読み替える。終了日・時刻・補足・出典は空にできるが、
 * FormData の "" を date・time 列にそのまま入れると、制約違反ではない
 * 型変換エラーで 500 になる（設計書 §5。決算月と同じ穴）。
 *
 * 前後の空白を落としてから空かどうかを見る。空白だけの出典の表示名を通すと、
 * `source_name` が非NULLになって CHECK も抜け、アプリに中身の見えないリンクが
 * 出る。出典が見えないのは出典を出していないのと同じで、条件を満たさない
 */
function toNullable(value: FormDataEntryValue | null): string | null {
  const text = String(value ?? "").trim();
  return text === "" ? null : text;
}

/**
 * 対象の <select> の値（"market:JP" / "theme:12" / "stock:3"）を event の3列に振り分ける。
 * 未選択は3列とも null になり、DB の event_target_exclusive_check が弾く（設計書 §4）
 */
function toTarget(value: FormDataEntryValue | null) {
  const [kind, id = ""] = String(value ?? "").split(":");
  return {
    market: kind === "market" ? id : null,
    themeId: kind === "theme" ? Number(id) : null,
    stockId: kind === "stock" ? Number(id) : null,
  };
}

/** イベント登録フォームの FormData を createEvent の入力にする */
export function toEventInput(formData: FormData): EventInput {
  return {
    title: String(formData.get("title") ?? ""),
    shortLabel: String(formData.get("shortLabel") ?? ""),
    startDate: String(formData.get("startDate") ?? ""),
    endDate: toNullable(formData.get("endDate")),
    time: toNullable(formData.get("time")),
    importance: Number(formData.get("importance")),
    note: toNullable(formData.get("note")),
    sourceUrl: toNullable(formData.get("sourceUrl")),
    sourceName: toNullable(formData.get("sourceName")),
    ...toTarget(formData.get("target")),
  };
}
