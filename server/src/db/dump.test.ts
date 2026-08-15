import { describe, expect, it } from "vitest";
import { dbSizeLine, dumpFileName, hasEventRows, splitPassword } from "./dump";

/** pg_dump の出力のうち、event の COPY だけを取り出した形（実物から写した） */
const copyHeader =
  'COPY public.event (id, title, short_label, start_date, end_date, "time", importance, note, source_url, market, theme_id, stock_id, created_at, source_name, active) FROM stdin;';

describe("dumpFileName", () => {
  it("接続先のホストとデータベース名がファイル名に入る", () => {
    expect(
      dumpFileName(
        "postgres://postgres:postgres@localhost:5434/ichikabu",
        new Date("2026-08-14T12:00:00+09:00"),
      ),
    ).toBe("2026-08-14-localhost-ichikabu.sql");
  });

  it("開発用と本番でファイル名が別になる", () => {
    const date = new Date("2026-08-14T12:00:00+09:00");
    const dev = dumpFileName(
      "postgres://postgres:postgres@localhost:5434/ichikabu",
      date,
    );
    const prod = dumpFileName(
      "postgres://postgres.abc:pw@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres",
      date,
    );

    expect(dev).toBe("2026-08-14-localhost-ichikabu.sql");
    expect(prod).toBe(
      "2026-08-14-aws-0-ap-northeast-1.pooler.supabase.com-postgres.sql",
    );
  });

  it("日付は日本時間で付く", () => {
    // UTC で切ると、朝に取ったバックアップに前日の日付が付く
    expect(
      dumpFileName(
        "postgres://postgres:postgres@localhost:5434/ichikabu",
        new Date("2026-08-15T08:00:00+09:00"),
      ),
    ).toBe("2026-08-15-localhost-ichikabu.sql");
  });
});

describe("splitPassword", () => {
  it("接続先からパスワードが外れる", () => {
    expect(
      splitPassword("postgres://postgres:secret@localhost:5434/ichikabu").url,
    ).toBe("postgres://postgres@localhost:5434/ichikabu");
  });

  it("記号入りのパスワードが元の形で取り出せる", () => {
    // URL の中では %40 と書かれている。この形のまま PGPASSWORD に渡すと
    // 認証に落ちる。Supabase が作るパスワードは記号を含む
    expect(
      splitPassword(
        "postgres://postgres:p%40ss%3Aword@db.example.com:5432/postgres",
      ).password,
    ).toBe("p@ss:word");
  });

  it("クエリ文字列は残る", () => {
    // Supabase の接続URLには sslmode が付く
    expect(
      splitPassword(
        "postgres://postgres:pw@db.example.com:5432/postgres?sslmode=require",
      ).url,
    ).toBe("postgres://postgres@db.example.com:5432/postgres?sslmode=require");
  });
});

describe("dbSizeLine", () => {
  const supabase =
    "postgres://postgres.abc@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres";
  const local = "postgres://postgres@localhost:5434/ichikabu";
  const mb = (n: number) => n * 1024 * 1024;

  it("開発用DBには上限を出さない", () => {
    // 500MB の線は Supabase の話で、Docker の PostgreSQL には無い
    expect(dbSizeLine(mb(9), local)).toBe("DBのサイズ: 9 MB");
  });

  it("Supabase なら上限までの余裕が分かる", () => {
    expect(dbSizeLine(mb(9), supabase)).toBe("DBのサイズ: 9 MB / 500 MB");
  });

  it("直つなぎの接続先も Supabase と分かる", () => {
    // pooler は supabase.com、直つなぎは supabase.co で末尾が違う
    expect(
      dbSizeLine(mb(9), "postgres://postgres@db.abc.supabase.co:5432/postgres"),
    ).toContain("/ 500 MB");
  });

  it("399MB では手を打つよう促さない", () => {
    expect(dbSizeLine(mb(399), supabase)).not.toContain("Pro に上げる");
  });

  it("ちょうど400MBで手を打つよう促す", () => {
    // 線そのもの。ここを含めないと、400MB に着いた週を1回見送る
    expect(dbSizeLine(mb(400), supabase)).toContain("Pro に上げる");
  });

  it("上限を超えていても手を打つよう促す", () => {
    expect(dbSizeLine(mb(520), supabase)).toContain("Pro に上げる");
  });
});

describe("hasEventRows", () => {
  it("データ行があるダンプを通す", () => {
    expect(
      hasEventRows(
        `${copyHeader}\n6\tトヨタ自動車 決算\t7203決算\t2026-08-04\n\\.\n`,
      ),
    ).toBe(true);
  });

  it("event テーブルはあるが0行のダンプを落とす", () => {
    // 接続先を間違えて空のDBを取ったときの形。COPY 行は出るが、次がすぐ `\.`
    // になる。受け入れ条件の `grep -c '^COPY public.event '` はこれでも 1 を返す
    expect(hasEventRows(`${copyHeader}\n\\.\n`)).toBe(false);
  });

  it("event テーブルが無いダンプを落とす", () => {
    expect(
      hasEventRows("COPY public.stock (id) FROM stdin;\n1\tトヨタ\n\\.\n"),
    ).toBe(false);
  });

  it("データ行の途中にある同じ文字列を COPY 行と読み違えない", () => {
    // イベント名やテーマ名に COPY 行と同じ文字列が入っていても、それは
    // 行の途中にあるので COPY 行ではない
    const dump = `COPY public.theme (id, name) FROM stdin;\n1\t${copyHeader}\n2\t決算\n\\.\n${copyHeader}\n\\.\n`;

    expect(hasEventRows(dump)).toBe(false);
  });

  it("event_target のような別テーブルの COPY を event と読み違えない", () => {
    expect(
      hasEventRows("COPY public.event_target (id) FROM stdin;\n1\t2\n\\.\n"),
    ).toBe(false);
  });
});
