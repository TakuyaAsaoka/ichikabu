import { addHolding } from "./actions";
import { ActionForm, field, fieldLabel } from "./form";

type Choice = { id: number; market: string; ticker: string; name: string };

/**
 * 保有の登録フォーム。
 * user_id はセッションから取るため入力欄を出さない（設計書 §3）
 */
export function HoldingForm({ choices }: { choices: Choice[] }) {
  if (choices.length === 0) {
    return <p className="text-muted">先に銘柄を登録すると選べるようになる。</p>;
  }

  return (
    <ActionForm action={addHolding} submitLabel="保有を登録">
      <label className={fieldLabel}>
        銘柄
        <select name="stockId" className={field}>
          {choices.map((choice) => (
            <option key={choice.id} value={choice.id}>
              {choice.market} {choice.ticker} {choice.name}
            </option>
          ))}
        </select>
      </label>
    </ActionForm>
  );
}
