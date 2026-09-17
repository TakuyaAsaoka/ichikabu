import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { addThemeStock } from "./actions";
import { ActionForm, fieldLabel, fieldSelect } from "./form";

type ThemeChoice = { id: number; name: string };
type StockChoice = { id: number; market: string; ticker: string; name: string };

/**
 * テーマ所属の登録フォーム。
 * テーマか銘柄が0件のときはフォームを出さない。選択肢が空の選択欄を出すと、
 * 送信しても外部キー違反になり、制約違反の日本語化を通らず 500 になる
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
      <p className="text-muted-foreground">
        先にテーマと銘柄をどちらも登録すると選べるようになる。
      </p>
    );
  }

  return (
    <ActionForm action={addThemeStock} submitLabel="テーマ所属を登録">
      <Label className={fieldLabel}>
        テーマ
        <NativeSelect name="themeId" className={fieldSelect}>
          {themes.map((theme) => (
            <option key={theme.id} value={theme.id}>
              {theme.name}
            </option>
          ))}
        </NativeSelect>
      </Label>
      <Label className={fieldLabel}>
        銘柄
        <NativeSelect name="stockId" className={fieldSelect}>
          {stocks.map((stock) => (
            <option key={stock.id} value={stock.id}>
              {stock.market} {stock.ticker} {stock.name}
            </option>
          ))}
        </NativeSelect>
      </Label>
    </ActionForm>
  );
}
