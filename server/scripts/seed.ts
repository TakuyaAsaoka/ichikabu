import { db } from "../src/db";
import { seedEvents } from "../src/db/seed-event";
import { seedUser } from "../src/db/seed-user";
import { toSeedUsers } from "../src/db/seed-users-input";

const raw = process.env.SEED_USERS;

if (!raw) {
  throw new Error("SEED_USERS が設定されていない。.env.example を参照");
}

const users = toSeedUsers(raw);

if (typeof users === "string") {
  throw new Error(users);
}

// 何度実行しても増えない。判定は seedUser がアカウントの有無で行う
const userIds: string[] = [];
for (const { email, password } of users) {
  const result = await seedUser(email, password);
  console.log(
    result.created
      ? `ユーザーを作成した: ${email}`
      : `ユーザーは既に存在する: ${email}`,
  );
  userIds.push(result.userId);
}

// 開発用データの保有は1人目にだけ作る。保有はカレンダーの動作確認に使うだけで、
// 全員ぶんは要らない。**2人目からは保有が0件なので、アプリに出るのは市場が
// GLOBAL のイベントだけになる**（app/api/events/route.ts が保有で絞るため）。
// 自分の保有が要るときは管理UIから足す
const { created: eventCount } = await seedEvents(userIds[0]);
console.log(`イベントを ${eventCount} 件作成した`);

// pg の接続プールが開いたままだと終了しないため明示的に閉じる。
// process.exit(0) にすると、パイプにつないだときに書きかけの出力が落ちる
// （scripts/import-stat-schedule.ts と揃えてある）
await db.$client.end();
