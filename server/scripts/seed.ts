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
const created: string[] = [];
for (const { email, password } of users) {
  const result = await seedUser(email, password);
  console.log(
    result.created
      ? `ユーザーを作成した: ${email}`
      : `ユーザーは既に存在する: ${email}`,
  );
  created.push(result.userId);
}

// 開発用データの保有は1人目にだけ作る。イベントは全員で共有するもので、
// 保有はカレンダーの動作確認に使うだけなので、全員ぶん作る必要がない
const { created: eventCount } = await seedEvents(created[0]);
console.log(`イベントを ${eventCount} 件作成した`);

// pg の接続プールが開いたままだと終了しないため明示的に閉じる。
// process.exit(0) にすると、パイプにつないだときに書きかけの出力が落ちる
// （scripts/import-stat-schedule.ts と揃えてある）
await db.$client.end();
