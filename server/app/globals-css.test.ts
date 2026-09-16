import { existsSync, readdirSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { compile } from "tailwindcss";
import { describe, expect, it } from "vitest";
import { stripComments } from "../test/source";

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
    // 指を乗せたときの面も見る。部品の既定（`primary` を 80% に薄めた面）は
    // 白の文字との差が 3.65 で、押す直前＝文字を読む瞬間だけ目安を割る（#161）
    ["primary-foreground", "primary-hover"],
    // 登録フォームを開く操作の文字と面（`app/register-details.tsx`。#165）
    ["secondary-foreground", "secondary"],
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
   * どちらも実測で `app/form.tsx` を違反として挙げてしまった。
   * コメントは `stripComments` が先に落とすので、ここは中括弧の深さだけを数え、
   * 中括弧の外にある `>` を終わりとみなす
   */
  function openingTagsIn(raw: string, component: string): string[] {
    const source = stripComments(raw);
    const open = `<${component}`;
    const tags: string[] = [];
    for (
      let start = source.indexOf(open);
      start !== -1;
      start = source.indexOf(open, start + 1)
    ) {
      let depth = 0;
      for (let i = start; i < source.length; i++) {
        const char = source[i];
        if (char === "{") depth += 1;
        else if (char === "}") depth -= 1;
        else if (char === ">" && depth === 0) {
          tags.push(source.slice(start, i + 1));
          break;
        }
      }
    }
    return tags;
  }

  /** 画面のファイルから、その部品の開始タグを集める */
  const tagsOf = (component: string): { file: string; tag: string }[] =>
    readdirSync(import.meta.dirname, { recursive: true, encoding: "utf8" })
      .filter((file) => file.endsWith(".tsx") && !file.endsWith(".test.tsx"))
      .flatMap((file) =>
        openingTagsIn(
          readFileSync(path.join(import.meta.dirname, file), "utf8"),
          component,
        ).map((tag) => ({ file, tag })),
      );

  const buttonTags = () => tagsOf("Button");

  /**
   * `buttonVariants(` の呼び出しを、閉じ括弧まで1つずつ取り出す。
   *
   * 部品の `<Button>` を使えない要素（開閉の `<summary>` など）は、ボタンの見た目を
   * この関数で借りる（`app/register-details.tsx`。#165）。開始タグだけを見ると、
   * こちらで枠だけのボタンにしたときに見張りが素通りする
   */
  function variantCallsIn(raw: string): string[] {
    const source = stripComments(raw);
    const open = "buttonVariants(";
    const calls: string[] = [];
    for (
      let start = source.indexOf(open);
      start !== -1;
      start = source.indexOf(open, start + 1)
    ) {
      let depth = 0;
      for (let i = start + open.length - 1; i < source.length; i++) {
        const char = source[i];
        if (char === "(") depth += 1;
        else if (char === ")") depth -= 1;
        if (depth === 0) {
          calls.push(source.slice(start, i + 1));
          break;
        }
      }
    }
    return calls;
  }

  /** 画面のファイルから `buttonVariants(` の呼び出しを集める */
  const variantCalls = (): { file: string; call: string }[] =>
    readdirSync(import.meta.dirname, { recursive: true, encoding: "utf8" })
      .filter((file) => file.endsWith(".tsx") && !file.endsWith(".test.tsx"))
      .flatMap((file) =>
        variantCallsIn(
          readFileSync(path.join(import.meta.dirname, file), "utf8"),
        ).map((call) => ({ file, call })),
      );

  it("入れ子の括弧を含む buttonVariants の呼び出しも、最後まで取り出せる", () => {
    const calls = variantCallsIn(
      'className={buttonVariants({ variant: "outline", className: cn("a", f(1)) })}',
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]).toBe(
      'buttonVariants({ variant: "outline", className: cn("a", f(1)) })',
    );
  });

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
    const tags = openingTagsIn(source, "Button");

    expect(tags).toHaveLength(1);
    expect(tags[0]).toContain("self-start");
  });

  // 下の2件は「このクラスを渡しているか」を見る。渡す理由をコメントに書くと
  // クラス名がそこにも現れるため、コメントを数に入れると歯が無くなる
  it.each([
    [
      "行まるごと",
      '<Button\n  // border-input を渡す理由\n  className="self-start"\n>',
    ],
    // 行末のコメント。落とさないと `className` から消しても緑のまま通る
    ["行末", '<Button className="self-start" // border-input は要らない\n>'],
  ])(
    "%s のコメントに書いたクラス名は、渡したものと数えない",
    (_name, source) => {
      const tags = openingTagsIn(source, "Button");

      expect(tags[0]).toContain("self-start");
      expect(tags[0]).not.toContain("border-input");
    },
  );

  it("枠だけのボタンには input の色の枠を渡している", () => {
    // 部品の既定は `border-border` で、背景との差が 1.22 しかなく形が見えない。
    // 部品は書き換えないので、呼ぶ側で `border-input`（3.63）を渡す
    const offenders = buttonTags().filter(
      ({ tag }) =>
        tag.includes('variant="outline"') && !tag.includes("border-input"),
    );
    const callOffenders = variantCalls().filter(
      ({ call }) =>
        /variant:\s*"outline"/.test(call) && !call.includes("border-input"),
    );

    expect([...offenders, ...callOffenders].map(({ file }) => file)).toEqual(
      [],
    );
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
    expect(variantCalls().length).toBeGreaterThan(0);
  });

  /**
   * 骨組み（#162）の、外すと静かに壊れるクラス。
   * どれも見た目が崩れるだけでエラーにならず、テストも他に赤くならない。
   *
   * 見るのはファイル全体の文字列。いま両方とも1か所にしか無いので足りるが、
   * 同じクラスが増えたら、タグ単位で見る上の `tagsOf` の形へ寄せる
   */
  it.each([
    {
      klass: "whitespace-nowrap",
      file: "app-shell/nav.tsx",
      breaks:
        "管理者の下のタブ5つが2行になり、64px の帯から溢れる（390px では名前が 71.6px、枠は 70px）",
    },
    {
      klass: "pb-24",
      file: "app-shell/app-shell.tsx",
      breaks: "画面の最後の行が下のタブに隠れて押せなくなる（タブは 64px）",
    },
  ])("$klass を外すと「$breaks」", ({ file, klass }) => {
    const source = stripComments(
      readFileSync(path.join(import.meta.dirname, file), "utf8"),
    );

    expect(source).toContain(klass);
  });

  it("ネイビーの面2つの両方で、フォーカスの輪の色を差し替えている", () => {
    // サイドバー（PC）とヘッダー（スマホ）の2か所。外すと輪と面の差が 1.54 になり、
    // キーボードの現在地が見えない。
    // **数まで見る。** 「1か所でもある」だと、片方だけ直した状態を緑で通す
    // （#162 のレビューで実際に片方が抜けていた）
    const source = stripComments(
      readFileSync(
        path.join(import.meta.dirname, "app-shell/app-shell.tsx"),
        "utf8",
      ),
    );

    expect(source.split("[--ring:var(--sidebar-ring)]")).toHaveLength(3);
  });

  /** 消す・外す操作のフォーム。送信ボタンの名前で見分ける */
  const removalForms = () =>
    tagsOf("ActionForm").filter(({ tag }) =>
      /submitLabel=\{?[^}]*?(削除|外す)/.test(tag),
    );

  // #161 の Scenario「登録と削除が見分けられる」の本体。
  // 派生の決まり（枠の色・薄くしない指定）だけを見て、本体を文章のままにしない
  it("消す・外す操作のフォームは消す色のボタンを出す", () => {
    const offenders = removalForms().filter(
      ({ tag }) => !tag.includes('variant="destructive"'),
    );

    expect(offenders.map(({ file }) => file)).toEqual([]);
  });

  it("見張る先の消す操作がある", () => {
    // 消す操作は銘柄・テーマ・イベント・テーマ所属の4画面にある。
    // 取り出しが壊れると、上の検査は空の配列どうしで黙って緑になる
    expect(removalForms()).toHaveLength(4);
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

  // 部品を通さない素の要素（リンクなど）に、見える輪を出す。
  // outline-ring/50（半分透かした ring）だけだと背景との差が 3 を割る。
  // 部品は `outline-none` を持ち、この規則は層の優先順位で負ける（#176。下の検査）
  //
  // **読む変数は `--ring` で、`--color-ring` ではない**（#162）。後者は
  // `@theme inline` が `:root` に出すもので、宣言した所で値に解決されてから
  // 下へ伝わるため、ネイビーの面の上の打ち消しが届かない（理由は globals.css）
  it("フォーカスした要素に ring の色の輪を透かさずに出す", async () => {
    const css = await buildWith([]);
    expect(css).toMatch(
      /:focus-visible\s*\{\s*outline:\s*2px solid var\(--ring\)/,
    );
  });

  // 部品（ボタン・入力欄・選択欄）は `outline-none` で上の outline を消し、
  // `focus-visible:ring-3 focus-visible:ring-ring/50` の半分透かした輪だけを出す（#176）。
  // 部品のコードは書き換えないので、輪の色の変数を透かさない色で上書きする。
  // 消す操作のボタンは部品が `ring-destructive/20` で役割の色を付けているので、その色のまま透かさない。
  // ハイコントラスト表示（forced-colors）では輪（box-shadow）が描かれず、印が0になるので outline を戻す
  it("部品のフォーカスの輪を透かさない色で上書きし、ハイコントラスト表示では outline を出す", async () => {
    const css = await buildWith([]);
    expect(css).toMatch(
      /:focus-visible\s*\{\s*--tw-ring-color:\s*var\(--ring\)/,
    );
    expect(css).toMatch(
      /\[data-variant="destructive"\]:focus-visible\s*\{\s*--tw-ring-color:\s*var\(--destructive\)/,
    );
    expect(css).toMatch(
      /@media \(forced-colors: active\)\s*\{\s*:focus-visible\s*\{\s*outline:\s*2px solid/,
    );
  });

  // 上の上書きは Tailwind が輪の色を入れる変数の名前に頼っている。
  // 名前が変わると、エラーも出ずに輪が半分透かした色へ戻るので、組んだ CSS で結び付きを見る。
  // 名前は globals.css の上書きから取る（どちらの側で名前がずれても赤くなる）
  it("上書きする変数は、部品の輪の色が入り、輪の描画が読む変数と同じ名前", async () => {
    const source = stripComments(readFileSync(globalsCss, "utf8"));
    const name = source.match(/:focus-visible\s*\{\s*(--[\w-]+):\s*var\(--ring\);/)?.[1];
    expect(name).toBeDefined();

    const color = await buildWith(["focus-visible:ring-ring/50"]);
    const width = await buildWith(["focus-visible:ring-3"]);
    expect(color).toContain(`${name}:`);
    expect(width).toContain(`var(${name}`);
  });

  // 既定のボタンに指を乗せたときの面の上書き（#161）。上の「明るさの差」は
  // `--primary-hover` の値だけを見るので、その値がボタンに当たっているかはここで見る
  it("既定のボタンの指を乗せた面を primary-hover で上書きしている", async () => {
    const css = await buildWith([]);
    expect(css).toMatch(
      /\[data-slot="button"\]\[data-variant="default"\]:hover\s*\{\s*background-color:\s*var\(--primary-hover\)/,
    );
  });

  // **`@layer` の外に置く決まりを見る。** 中に入れると部品のクラスに負けて
  // 色が戻るが、規則そのものは生成されるので上の検査は緑のまま通る。
  //
  // 組んだ結果の並び順では見分けられない（`@layer base` に入れても、出てくる
  // 位置は部品のクラスより後ろのままだった。実測）。勝ち負けを決めているのは
  // 並び順ではなく層なので、**書いてある場所**を見る。
  // 規則の手前で中括弧が開きっぱなしなら、何かの中に入っている
  it.each([
    '[data-slot="button"][data-variant="default"]:hover',
    // 知らせのトースト（#164）。sonner が層の外に差し込む影に勝つには、層の外に要る
    '[data-sonner-toaster] [data-sonner-toast][data-styled="true"]',
    "[data-sonner-toaster] [data-sonner-toast]:focus-visible",
    // 部品のフォーカスの輪（#176）。`@layer base` の `:focus-visible` と見分けるため、
    // 選び方に続く宣言まで含めて探す（位置は選び方の頭）
    /(?<![\]\w-]):focus-visible\s*\{\s*--tw-ring-color:\s*var\(--ring\)/,
    /\[data-variant="destructive"\]:focus-visible\s*\{\s*--tw-ring-color/,
    "@media (forced-colors: active)",
  ])("%s の上書きは、@layer の外に置いてある", (selector) => {
    const css = stripComments(readFileSync(globalsCss, "utf8"));
    const at =
      typeof selector === "string"
        ? css.indexOf(selector)
        : (css.match(selector)?.index ?? -1);
    expect(at).toBeGreaterThan(-1);

    const before = css.slice(0, at);
    const depth =
      (before.match(/\{/g) ?? []).length - (before.match(/\}/g) ?? []).length;

    expect(depth).toBe(0);
  });

  // sonner のトーストは既定で影を持ち、フォーカスの輪も影で描いて outline を消している
  // （dist/index.mjs の `__insertCSS`）。部品の中の CSS なので、上の `shadow-*` の見張りは届かない。
  // 効いているかどうかは強さ（属性の数）でも決まるので、選び方ごと見る
  it("知らせのトーストの影を消し、フォーカスの輪を ring の色で出す", async () => {
    const css = await buildWith([]);
    expect(css).toMatch(
      /\[data-sonner-toaster\] \[data-sonner-toast\]\[data-styled="true"\]\s*\{\s*box-shadow:\s*none/,
    );
    expect(css).toMatch(
      /\[data-sonner-toaster\] \[data-sonner-toast\]:focus-visible\s*\{\s*box-shadow:\s*none;\s*outline:\s*2px solid var\(--ring\)/,
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
