import { JSDOM } from "jsdom";

/**
 * 画面に出た要素の中身を、出た順にHTMLで取り出す。
 *
 * 一覧や選択肢の並び順を見るために使う。`toContain` を並べる形では順不同になり、
 * 問い合わせから `orderBy` が落ちても緑のまま通る（Issue #128・#130）。
 *
 * 使う側は見たい一覧をセレクタで絞る。`app/page.tsx` のようにページに一覧が
 * 2つ以上あったり、`<ul>` が入れ子になっていたりしても、見たい1つだけを取れる
 * （`"ul ul li"` で内側の一覧、`'select[name="stockId"] option'` で選択肢）。
 *
 * 入れ子のある画面で `"li"` とだけ書くと、外側の `<li>` が内側の `<ul>` を
 * 丸ごと飲んだ文字列が返る。深さを指定すること
 *
 * 返すのは `textContent` ではなく `innerHTML`。`textContent` はタグを落とすため、
 * 行から編集ページへのリンクが消えて、一覧の検出力が1段落ちる。
 *
 * `jsdom` はここでしか読み込まない。多くのテストが読む `test/helpers.ts` に
 * 置くと、DOMを見ないテストまで jsdom を読むことになる
 * （21ファイルに読ませた実測で、読み込みが 9.6秒 → 20.4秒）
 */
export function htmlOf(html: string, selector: string): string[] {
  return [...new JSDOM(html).window.document.querySelectorAll(selector)].map(
    (element) => element.innerHTML,
  );
}
