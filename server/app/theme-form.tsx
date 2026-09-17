import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ActionForm, fieldLabel } from "./form";
import type { Action } from "./notice";

/** 編集のときの初期値。登録では渡さない */
type ThemeRow = { id: number; name: string };

/**
 * テーマのフォーム。登録と編集の両方で使う（#67）。
 * theme を渡すと入力欄に初期値が入り、更新先を表す隠しの id が付く。
 *
 * name は notNull だが空文字を弾く CHECK が無いため、required で塞ぐ。
 * required は "   " を通すため、空白だけの判定は src/db/write.ts が持つ
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
      <Label className={fieldLabel}>
        テーマ名
        <Input type="text" name="name" required defaultValue={theme?.name} />
      </Label>
    </ActionForm>
  );
}
