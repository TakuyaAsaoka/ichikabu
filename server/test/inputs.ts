import type { EventInput, StockInput } from "../src/db/write";

/**
 * テストが書き込みに渡す入力の作り置き（Issue #139）。
 *
 * `EventInput` は12列すべてを埋めないと渡せないため、7本のテストが同じ12行を
 * 書き写していた。銘柄のほうも同じ1件が11本に散っていた。
 *
 * **既定値に隠してよいのは、そのテストが見ていない列だけ。** 見ている列は
 * 呼ぶ側に書かせる。既定値の中に隠すと、そのテストが何を確かめているのかが
 * 読めなくなる（並び順を見るテストのティッカー、幅の判定を見るテストの
 * 短縮ラベルなど）。
 *
 * **守れているかは、下の既定値を1つずつ書き換えて `pnpm test:run` を流せば分かる。**
 * 1本でも赤くなったら、そのテストは見ている列をここに隠している。全列で緑に
 * なることを確かめてある（2026-09-03 実測。7列を1つずつ回して 373件すべて緑。
 * 最初に回したときは `importance` で1本、`shortLabel` で1本、`ticker` で5本、
 * `name` で8本、`fiscalMonth` で1本が赤くなり、全部を呼ぶ側に出した）。
 *
 * **`{ ticker: undefined }` のように `undefined` を渡さないこと。** 展開が既定値を
 * `undefined` で上書きするため、NOT NULL 違反になる（この直しの最中に実際に踏んで
 * 7件落ちた）。省きたい欄は渡さない。省けるようにしたい引数は、
 * `src/db/schema.test.ts` の `createStock` のように既定値をここから取る。
 *
 * このファイルは型しか読み込まない。多くのテストが読むため、重いものを
 * 足さないこと（`test/dom.ts` の冒頭に、`jsdom` を `test/helpers.ts` に
 * 置いたら読み込みが 9.6秒 → 20.4秒 になった実測がある）。
 */

/**
 * イベントの入力。**対象の3列はすべて null**で、埋めるのは呼ぶ側。
 *
 * 3列のうちちょうど1つだけが非NULLであることは DB の
 * `event_target_exclusive_check` が判定する（全体設計書 §5）。既定でどれかを
 * 埋めておくと、「対象を1つも選ばない」を確かめるテストが書けなくなる。
 *
 * 短縮ラベル「日銀会合」は全角4文字（幅8）で、幅の上限10には引っかからない。
 */
export function eventInput(overrides: Partial<EventInput> = {}): EventInput {
  return {
    title: "日本銀行 金融政策決定会合",
    shortLabel: "日銀会合",
    startDate: "2026-09-18",
    endDate: null,
    time: null,
    importance: 3,
    note: null,
    sourceUrl: null,
    sourceName: null,
    market: null,
    themeId: null,
    stockId: null,
    ...overrides,
  };
}

/**
 * 銘柄の列に入れる値。**`market` を `"JP" | "US"` に狭めてある。**
 *
 * `StockInput` の `market` は `string`。画面から来た値を絞り込まずDBの
 * `stock_market_check` に判定させるためで、あれは正しい（`src/db/write.ts`）。
 * だがそのままだと `db.insert(stock).values()` に渡せない。Drizzle 側は
 * 列の型どおり `"JP" | "US"` を求めるためである。
 *
 * 狭いほうは広いほうに渡せるので、この型にしておくと
 * `createStock()` と `db.insert(stock)` の**両方**に渡せる。
 *
 * 列を書き写さず `StockInput` から作る。写すと、列が1本増えたときに直す場所が
 * 2つになり、このファイルを置いた意味が無くなる
 */
type StockValues = StockInput & { market: "JP" | "US" };

/**
 * 銘柄の入力。既定はJPのトヨタ自動車で、決算月あり。
 *
 * 決算月は JP 銘柄にしか入らない（CHECK 制約 `stock_fiscal_month_market_check`）。
 * US 銘柄を作るときは `market` と一緒に `fiscalMonth: null` も渡すこと
 */
export function stockInput(overrides: Partial<StockValues> = {}): StockValues {
  return {
    market: "JP",
    ticker: "7203",
    name: "トヨタ自動車",
    fiscalMonth: 3,
    ...overrides,
  };
}
