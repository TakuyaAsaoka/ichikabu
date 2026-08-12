import { type Action, ActionForm, field, fieldLabel } from "./form";

/** 編集のときの初期値。登録では渡さない（設計書 §3） */
type ThemeRow = { id: number; name: string };

/**
 * テーマのフォーム。登録と編集の両方で使う（設計書 §3）。
 * theme を渡すと入力欄に初期値が入り、更新先を表す隠しの id が付く。
 *
 * name は notNull だが空文字を弾く CHECK が無いため、required で塞ぐ。
 * required は "   " を通すため、空白だけの判定は src/db/write.ts が持つ（設計書 §5）
 */
export function ThemeForm({
  action,
  submitLabel,
  theme,
}: {
  action: Action;
  submitLabel: string;
  theme?: ThemeRow;
}) {
  return (
    <ActionForm action={action} submitLabel={submitLabel}>
      {theme && <input type="hidden" name="id" value={theme.id} />}
      <label className={fieldLabel}>
        テーマ名
        <input
          type="text"
          name="name"
          required
          defaultValue={theme?.name}
          className={field}
        />
      </label>
    </ActionForm>
  );
}
