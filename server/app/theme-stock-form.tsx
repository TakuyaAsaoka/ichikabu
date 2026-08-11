import { addThemeStock } from "./actions";
import { ActionForm, field, fieldLabel } from "./form";

type ThemeChoice = { id: number; name: string };
type StockChoice = { id: number; market: string; ticker: string; name: string };

/**
 * テーマ所属の登録フォーム。
 * テーマか銘柄が0件のときはフォームを出さない。選択肢が空の <select> を出すと、
 * 送信しても外部キー違反になり、制約違反の日本語化を通らず 500 になる（設計書 §4.3）
 */
export function ThemeStockForm({
  themes,
  stocks,
}: {
  themes: ThemeChoice[];
  stocks: StockChoice[];
}) {
  if (themes.length === 0 || stocks.length === 0) {
    return (
      <p className="text-muted">
        先にテーマと銘柄をどちらも登録すると選べるようになる。
      </p>
    );
  }

  return (
    <ActionForm action={addThemeStock} submitLabel="テーマ所属を登録">
      <label className={fieldLabel}>
        テーマ
        <select name="themeId" className={field}>
          {themes.map((theme) => (
            <option key={theme.id} value={theme.id}>
              {theme.name}
            </option>
          ))}
        </select>
      </label>
      <label className={fieldLabel}>
        銘柄
        <select name="stockId" className={field}>
          {stocks.map((stock) => (
            <option key={stock.id} value={stock.id}>
              {stock.market} {stock.ticker} {stock.name}
            </option>
          ))}
        </select>
      </label>
    </ActionForm>
  );
}
