import { describe, expect, it } from "vitest";
import { dumpFileName, hasEventRows } from "./dump";

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

  it("event_target のような別テーブルの COPY を event と読み違えない", () => {
    expect(
      hasEventRows("COPY public.event_target (id) FROM stdin;\n1\t2\n\\.\n"),
    ).toBe(false);
  });
});
