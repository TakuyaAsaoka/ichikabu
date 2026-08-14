import { describe, expect, it } from "vitest";
import { toSeedUsers } from "./seed-users-input";

describe("toSeedUsers", () => {
  it("複数人ぶんの利用者を読める", () => {
    const text = JSON.stringify([
      { email: "a@example.com", password: "pw-a" },
      { email: "b@example.com", password: "pw-b" },
    ]);

    expect(toSeedUsers(text)).toEqual([
      { email: "a@example.com", password: "pw-a" },
      { email: "b@example.com", password: "pw-b" },
    ]);
  });

  it("区切り文字が入ったパスワードでもそのまま読める", () => {
    // JSON にしたのはこのため。カンマ区切りやコロン区切りだと壊れる
    const text = JSON.stringify([
      { email: "a@example.com", password: "a:b,c" },
    ]);

    expect(toSeedUsers(text)).toEqual([
      { email: "a@example.com", password: "a:b,c" },
    ]);
  });

  it("JSON として読めない値はエラー文を返す", () => {
    expect(toSeedUsers("a@example.com:pw")).toBe(
      "SEED_USERS が JSON として読めない",
    );
  });

  it("配列でない値はエラー文を返す", () => {
    expect(toSeedUsers(JSON.stringify({ email: "a@example.com" }))).toBe(
      "SEED_USERS は配列にする",
    );
  });

  it("1人も入っていないときはエラー文を返す", () => {
    expect(toSeedUsers("[]")).toBe("SEED_USERS に利用者が1人も入っていない");
  });

  it("メールアドレスが空の要素は何人目かを添えて返す", () => {
    const text = JSON.stringify([
      { email: "a@example.com", password: "pw-a" },
      { email: "  ", password: "pw-b" },
    ]);

    expect(toSeedUsers(text)).toBe("2人目: メールアドレスを入れる");
  });

  it("同じメールアドレスが2件あるときは何人目かを添えて返す", () => {
    // seedUser はメールアドレスで既存を判定するため、弾かないと2件目が
    // 「既に存在する」で終わり、書き間違いに気づけない
    const text = JSON.stringify([
      { email: "a@example.com", password: "pw-a" },
      { email: "A@example.com", password: "pw-b" },
    ]);

    expect(toSeedUsers(text)).toBe("2人目: a@example.com が重なっている");
  });

  it("パスワードが空の要素は何人目かを添えて返す", () => {
    const text = JSON.stringify([{ email: "a@example.com", password: "" }]);

    expect(toSeedUsers(text)).toBe("1人目: パスワードを入れる");
  });
});
