import { existsSync, readdirSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { compile } from "tailwindcss";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
const globalsCss = path.join(import.meta.dirname, "globals.css");

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** `{ style: "..." }` か `{ ".": { style: "..." } }` の形から、CSS の置き場を取り出す */
function styleField(value: unknown): string | undefined {
  if (!isObject(value)) return undefined;
  if (typeof value.style === "string") return value.style;
  const dot = value["."];
  return isObject(dot) && typeof dot.style === "string" ? dot.style : undefined;
}

/**
 * `@import` の行き先を、ビルドと同じ場所に解く。
 * 包みの名前だけのもの（`tailwindcss`・`tw-animate-css`）は package.json の `style` を読む。
 * `require.resolve` に任せると、`tailwindcss` は JavaScript の本体に解けてしまう
 */
function resolveStylesheet(id: string, base: string): string {
  if (id.startsWith(".")) return path.resolve(base, id);
  const pkgJson = path.join(root, "node_modules", id, "package.json");
  if (!existsSync(pkgJson)) return require.resolve(id);
  const pkg: unknown = JSON.parse(readFileSync(pkgJson, "utf8"));
  const style =
    styleField(pkg) ?? (isObject(pkg) ? styleField(pkg.exports) : undefined);
  if (!style) throw new Error(`CSS の置き場が分からない: ${id}`);
  return path.join(path.dirname(pkgJson), style);
}

/** globals.css を Tailwind で組み、渡したクラスの分だけ CSS を出す */
async function buildWith(classes: string[]): Promise<string> {
  const compiler = await compile(await readFile(globalsCss, "utf8"), {
    base: import.meta.dirname,
    loadStylesheet: async (id, base) => {
      const resolved = resolveStylesheet(id, base);
      return {
        path: resolved,
        base: path.dirname(resolved),
        content: await readFile(resolved, "utf8"),
      };
    },
  });
  return compiler.build(classes);
}

/** globals.css の `:root` にある16進の値を読む */
function colorOf(name: string): string {
  const css = readFileSync(globalsCss, "utf8");
  const found = css.match(new RegExp(`[^-]--${name}:\\s*(#[0-9a-fA-F]{6});`));
  if (!found) throw new Error(`--${name} の16進の値が無い`);
  return found[1];
}

/** 明るさの差（WCAG 2 の式） */
function contrast(a: string, b: string): number {
  const luminance = (hex: string) => {
    const [r, g, bl] = [1, 3, 5]
      .map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * 画面の文字と入力欄が読めること（#160）。
 * 値を選び直したときに、読めない組み合わせを入れないための見張り。
 * 目安は WCAG: 文字 4.5 以上、形を示す線 3 以上
 */
describe("色の明るさの差", () => {
  it.each([
    ["foreground", "background"],
    ["muted-foreground", "background"],
    ["muted-foreground", "muted"],
    ["destructive", "background"],
    ["primary-foreground", "primary"],
  ])("文字 %s は面 %s の上で 4.5 以上ある", (text, surface) => {
    expect(contrast(colorOf(text), colorOf(surface))).toBeGreaterThanOrEqual(
      4.5,
    );
  });

  // 入力欄は背景と同じ色の面なので、欄の場所を示すのは枠だけ。
  // border（面の区切り #e0e0ec）と同じにすると差が 1.22 で欄が見えない（novel-system #49）
  it("入力欄の枠 input は背景の上で 3 以上ある", () => {
    expect(
      contrast(colorOf("input"), colorOf("background")),
    ).toBeGreaterThanOrEqual(3);
  });

  // 入力欄の見た目は `app/form.tsx` の `field` から `@/components/ui` の部品へ移った（#161）。
  // 部品のコードは書き換えない決まりなので、部品が持っている色をここで見る。
  // `shadcn add --overwrite` で入れ直したときに既定が変わっていれば赤くなる
  it.each(["input", "textarea", "native-select"])(
    "%s の枠は input の色を使う",
    (name) => {
      const source = readFileSync(
        path.join(root, "components", "ui", `${name}.tsx`),
        "utf8",
      );
      expect(source).toContain("border-input");
    },
  );

  /**
   * `<Button` から、その開始タグの終わりまでを1つずつ取り出す。
   *
   * **最初の `>` で切ってはいけない。** タグの中に `>` が2通りで現れる。
   *
   * - 矢印の関数（`onClick={(e) => ...}`）
   * - 属性の間に書いた `//` のコメント（`app/form.tsx` の「確認は <form onSubmit> …」）
   *
   * どちらも実測で `app/form.tsx` を違反として挙げてしまった。中括弧の深さを数え、
   * 素のまま置かれた `>` だけを終わりとみなす。
   *
   * **コメントは読み飛ばすだけでなく、返す文字列から取り除く。** 下の2件は
   * 「このクラスを渡しているか」を見るが、渡す理由をコメントに書くと
   * クラス名がそこにも現れる。読み飛ばすだけだと、`className` から消しても
   * コメントの側が残って緑のままになる（実測で2件とも歯が無かった）
   */
  function buttonTagsIn(source: string): string[] {
    const tags: string[] = [];
    for (
      let start = source.indexOf("<Button");
      start !== -1;
      start = source.indexOf("<Button", start + 1)
    ) {
      let depth = 0;
      let tag = "";
      for (let i = start; i < source.length; i++) {
        if (source.startsWith("//", i)) {
          const lineEnd = source.indexOf("\n", i);
          if (lineEnd === -1) break;
          // for が i++ するので、次の回で改行そのものから読み直す
          i = lineEnd - 1;
          continue;
        }
        const char = source[i];
        tag += char;
        if (char === "{") depth += 1;
        else if (char === "}") depth -= 1;
        else if (char === ">" && depth === 0) {
          tags.push(tag);
          break;
        }
      }
    }
    return tags;
  }

  /** 画面のファイルから `<Button ...>` の開始タグを集める */
  const buttonTags = (): { file: string; tag: string }[] =>
    readdirSync(import.meta.dirname, { recursive: true, encoding: "utf8" })
      .filter((file) => file.endsWith(".tsx") && !file.endsWith(".test.tsx"))
      .flatMap((file) =>
        buttonTagsIn(
          readFileSync(path.join(import.meta.dirname, file), "utf8"),
        ).map((tag) => ({ file, tag })),
      );

  // 取り出しが途中で切れていないこと。切れると className を読み落とし、
  // 正しいコードを違反として挙げる
  it.each([
    [
      "矢印の関数",
      '<Button onClick={(e) => { e.preventDefault(); }} className="self-start">',
    ],
    [
      "属性の間のコメント",
      '<Button\n  // <form onSubmit> ではなくここに置く\n  className="self-start"\n>',
    ],
  ])("%s を渡したボタンも、最後まで取り出せる", (_name, source) => {
    const tags = buttonTagsIn(source);

    expect(tags).toHaveLength(1);
    expect(tags[0]).toContain("self-start");
  });

  // 下の2件は「このクラスを渡しているか」を見る。渡す理由をコメントに書くと
  // クラス名がそこにも現れるため、コメントを数に入れると歯が無くなる
  it("コメントに書いたクラス名は、渡したものと数えない", () => {
    const tags = buttonTagsIn(
      '<Button\n  // border-input を渡す理由\n  className="self-start"\n>',
    );

    expect(tags[0]).toContain("self-start");
    expect(tags[0]).not.toContain("border-input");
  });

  it("枠だけのボタンには input の色の枠を渡している", () => {
    // 部品の既定は `border-border` で、背景との差が 1.22 しかなく形が見えない。
    // 部品は書き換えないので、呼ぶ側で `border-input`（3.63）を渡す
    const offenders = buttonTags().filter(
      ({ tag }) =>
        tag.includes('variant="outline"') && !tag.includes("border-input"),
    );

    expect(offenders.map(({ file }) => file)).toEqual([]);
  });

  it("押せなくするボタンは、押せない間も文字を薄くしない", () => {
    // 部品は既定で、押せない間だけ半分透かす。そうすると文字と背景の明るさの差が
    // 読める目安を割る（#161 の Scenario「文字は読める明るさのまま」）。
    // 押せないことは、文字が変わることと指が乗らないことで示す
    const offenders = buttonTags().filter(
      ({ tag }) =>
        tag.includes("disabled=") && !tag.includes("disabled:opacity-100"),
    );

    expect(offenders.map(({ file }) => file)).toEqual([]);
  });

  it("見張る先のボタンがある", () => {
    // 取り出しが1つも拾わない形に壊れると、上の2件は空の配列どうしで黙って緑になる
    expect(buttonTags().length).toBeGreaterThan(0);
  });

  // 枠だけで形を示す操作部品（入力欄・枠だけのボタン）を border の色で描くと、
  // 背景との差が 1.22 で形が見えない。field を通らない所（サインイン）も含めて見る。
  // 四方の枠（`border`）と border の色が同じ className にあるものを探す。
  // 一覧の区切り線（`border-b border-border`）は四方の枠ではないので当たらない
  it("画面の四方の枠に border の色を使っていない", () => {
    const offenders = readdirSync(import.meta.dirname, {
      recursive: true,
      encoding: "utf8",
    })
      .filter((file) => file.endsWith(".tsx") && !file.endsWith(".test.tsx"))
      .flatMap((file) =>
        [
          ...readFileSync(
            path.join(import.meta.dirname, file),
            "utf8",
          ).matchAll(/className="([^"]*)"/g),
        ]
          .map((found) => found[1].split(/\s+/))
          .filter(
            (classes) =>
              classes.includes("border") && classes.includes("border-border"),
          )
          .map((classes) => `${file}: ${classes.join(" ")}`),
      );
    expect(offenders).toEqual([]);
  });
});

/**
 * 影を使わない決まりを、CSS の側で守る（#160）。
 * shadcn の部品は既定で `shadow-xs` などを持つ。部品のコードは書き換えないので、
 * テーマから影の値を消し、クラスを書いても何も生成されない形にしてある。
 * 画面に部品がまだ無いうちは、ここで生成物を見るしかない
 */
describe("影を使わない", () => {
  it.each([
    // 値の名前なしと inner は、Tailwind が前の版の書き方として持っている
    "shadow",
    "shadow-inner",
    "shadow-2xs",
    "shadow-xs",
    "shadow-sm",
    "shadow-md",
    "shadow-lg",
    "shadow-xl",
    "shadow-2xl",
    "inset-shadow-xs",
    "inset-shadow-sm",
    "drop-shadow-sm",
    "drop-shadow-md",
    "text-shadow-sm",
  ])("%s を書いても影が生成されない", async (name) => {
    const css = await buildWith([name]);
    expect(css).not.toContain(`.${name}`);
  });

  // 見張りが広すぎないこと。フォーカスの輪も box-shadow で描かれるので、
  // 影と一緒に消すとキーボードで操作している人が現在地を見失う
  it("フォーカスの輪（ring）は生成される", async () => {
    const css = await buildWith(["focus-visible:ring-3"]);
    expect(css).toContain("--tw-ring-shadow");
  });

  // 部品を通さない素の入力欄とボタンにも、見える輪を出す。
  // outline-ring/50（半分透かした ring）だけだと背景との差が 3 を割る
  it("フォーカスした要素に ring の色の輪を透かさずに出す", async () => {
    const css = await buildWith([]);
    expect(css).toMatch(
      /:focus-visible\s*\{\s*outline:\s*2px solid var\(--color-ring\)/,
    );
  });
});

/**
 * 暗い画面の値は持たないので、部品の `dark:` を OS の設定で効かせない（#160）。
 * `@custom-variant dark` を消すと Tailwind の既定に戻り、
 * `@media (prefers-color-scheme: dark)` で効く
 */
describe("暗い画面の指定", () => {
  it("dark: は .dark の class の下でだけ効き、OS の暗い設定では効かない", async () => {
    const css = await buildWith(["dark:underline"]);
    expect(css).toContain(":is(.dark *)");
    expect(css).not.toContain("prefers-color-scheme");
  });
});

/**
 * 開閉する部品（シート・メニュー・吹き出し）の見た目が効くこと（#160）。
 * Radix は開いた要素に `data-state="open"` を付ける。`shadcn/tailwind.css` を
 * 取り込まないと `data-open:` は `[data-open]` にしか当たらず、エラーも出ない。
 * `shadcn add` はこの取り込みを足さない
 */
describe("部品の変形の取り込み", () => {
  it('data-open: は Radix の data-state="open" に当たる', async () => {
    const css = await buildWith(["data-open:underline"]);
    expect(css).toContain('[data-state="open"]');
  });

  it("tw-animate-css の動きのクラスが生成される", async () => {
    const css = await buildWith(["animate-in"]);
    expect(css).toContain(".animate-in");
  });
});
