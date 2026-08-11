import { addTheme } from "./actions";
import { ActionForm, field, fieldLabel } from "./form";

/**
 * テーマの登録フォーム。
 * name は notNull だが空文字を弾く CHECK が無いため、required で塞ぐ（設計書 §3）
 */
export function ThemeForm() {
  return (
    <ActionForm action={addTheme} submitLabel="テーマを登録">
      <label className={fieldLabel}>
        テーマ名
        <input type="text" name="name" required className={field} />
      </label>
    </ActionForm>
  );
}
