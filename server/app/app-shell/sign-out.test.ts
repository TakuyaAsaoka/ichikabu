import { beforeEach, describe, expect, it } from "vitest";
import { seedUser } from "../../src/db/seed-user";
import { resetDatabase } from "../../test/helpers";
import { PASSWORD, redirectedTo, signInAs } from "../../test/render-page";
import { requestHeaders } from "../../test/setup";
import { requireSession } from "../guard";
import { signOut } from "./sign-out";

const EDITOR = "editor@example.com";

beforeEach(async () => {
  await resetDatabase();
  await seedUser(EDITOR, PASSWORD);
});

describe("サインアウト", () => {
  it("サインインの画面へ送られ、セッションが消える", async () => {
    await signInAs(EDITOR);
    // 送る前にセッションが本当にあることを見る。無いまま通ると、
    // 下の「消えた」が最初から消えていただけになる
    expect((await requireSession()).user.email).toBe(EDITOR);

    expect(await redirectedTo(signOut)).toBe("/signin");

    // Cookie は手元の Headers に残ったままだが、DBのセッションの行が消えているので
    // もう通らない。`requireSession` はサインインの画面へ追い返す
    expect(await redirectedTo(requireSession)).toBe("/signin");
  });

  it("サインインしていない人が呼んでも、サインインの画面へ送られる", async () => {
    // Server Action は宛先へ直に送れる。画面から入口を消すだけでは塞がらない
    requestHeaders.current = new Headers();

    expect(await redirectedTo(signOut)).toBe("/signin");
  });
});
