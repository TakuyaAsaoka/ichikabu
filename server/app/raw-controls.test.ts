import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 画面が操作部品を `@/components/ui` の部品で描いていることを、機械で守る（#161）。
 *
 * #161 で生の操作部品を 27 か所から 0 にした。**文章で書いた決まりは守られない**ので、
 * 戻ったらここで赤にする。同じ役目のものに `app/globals-css.test.ts`（色と形の決まり）がある。
 *
 * novel-system の `scripts/check-layers.sh` は写さない。あちらは shell で書いて
 * 品質ゲートのコマンドを1本増やしているが、ここの `server/scripts` は3つとも
 * TypeScript で、ゲートも `pnpm` の1本鎖（ルート CLAUDE.md「品質ゲート」）。
 * vitest に載せればゲートは1本のままで足りる。
 *
 * **この検査が守るのは「生の要素が戻らないこと」だけ。**
 * `<Button>` に `className` で枠を描き直す形は素通りする（Issue #161「検証時の罠」）。
 * 見た目がそろっているかは #156 の撮影で見る
 */

/** 部品を通すべき操作部品。`option`・`optgroup` は中身なので数えない */
const CONTROLS = ["button", "select", "textarea", "input"];

const appDir = path.resolve(import.meta.dirname);

/**
 * 生のまま書かれた操作部品を、開始タグごと取り出す。
 *
 * **1行ずつではなくタグ単位で見る。** 属性が次の行に来る書き方
 * （`<input\n  type="hidden"`）があるため、行で切ると `type="hidden"` の
 * 除外が効かず、隠しの欄が違反として並ぶ。
 *
 * 大文字で始まる部品（`<Button>`）は当たらない。JSX は大文字始まりを
 * コンポーネント、小文字始まりを素のHTML要素として扱うため、この区別がそのまま効く
 */
function rawControlsIn(source: string): string[] {
  const tags = source.match(
    new RegExp(`<(?:${CONTROLS.join("|")})\\b[^>]*>`, "g"),
  );
  return (tags ?? []).filter(
    // 隠しの欄だけは許す。更新先のIDを送るためのもので、見た目が無い
    (tag) => !tag.includes('type="hidden"'),
  );
}

describe("生の操作部品を書かない", () => {
  // 見張りが効いていること。ここが無いと、取り出しの正規表現が
  // 1件も拾わない形に壊れても、下の本体は空の配列どうしで緑になる
  it.each([
    ["生のボタン", '<button type="submit">送る</button>'],
    ["生の入力欄", '<input type="text" name="ticker" />'],
    ["生の選択欄", '<select name="market">'],
    ["生の複数行の入力欄", '<textarea name="rows" rows={6} />'],
    // 属性が次の行に来る書き方。行で切る見張りだと取りこぼす
    ["行をまたぐ生の入力欄", '<input\n  type="text"\n  name="name"\n/>'],
  ])("%s を見つける", (_name, source) => {
    expect(rawControlsIn(source)).toHaveLength(1);
  });

  // 見張りが広すぎないこと。正しいコードを赤くする見張りは、外される理由になる
  it.each([
    ["部品のボタン", '<Button type="submit">送る</Button>'],
    ["部品の入力欄", '<Input type="text" name="ticker" />'],
    ["隠しの欄", '<input type="hidden" name="id" value={row.id} />'],
    ["行をまたぐ隠しの欄", '<input\n  type="hidden"\n  name="id"\n/>'],
    ["選択肢", '<option value="JP">JP</option>'],
    ["選択肢のまとまり", '<optgroup label="市場">'],
  ])("%s は見つけない", (_name, source) => {
    expect(rawControlsIn(source)).toEqual([]);
  });

  it("app の画面に生の操作部品が無い", () => {
    const offenders = readdirSync(appDir, {
      recursive: true,
      encoding: "utf8",
    })
      .filter((file) => file.endsWith(".tsx") && !file.endsWith(".test.tsx"))
      .flatMap((file) =>
        rawControlsIn(readFileSync(path.join(appDir, file), "utf8")).map(
          (tag) => `${file}: ${tag}`,
        ),
      );

    expect(offenders).toEqual([]);
  });

  it("見張る先の画面がある", () => {
    // `app` の読み取りが空になると、上の検査は空の配列どうしで黙って緑になる
    const screens = readdirSync(appDir, {
      recursive: true,
      encoding: "utf8",
    }).filter((file) => file.endsWith(".tsx") && !file.endsWith(".test.tsx"));

    expect(screens.length).toBeGreaterThan(10);
  });
});
