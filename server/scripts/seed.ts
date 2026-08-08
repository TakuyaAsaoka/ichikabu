import { seedEvents } from "../src/db/seed-event";
import { seedUser } from "../src/db/seed-user";

const email = process.env.SEED_USER_EMAIL;
const password = process.env.SEED_USER_PASSWORD;

if (!email || !password) {
  throw new Error(
    "SEED_USER_EMAIL と SEED_USER_PASSWORD が設定されていない。.env.example を参照",
  );
}

const { created } = await seedUser(email, password);
console.log(
  created ? `ユーザーを作成した: ${email}` : `ユーザーは既に存在する: ${email}`,
);

const { created: eventCount } = await seedEvents();
console.log(`イベントを ${eventCount} 件作成した`);

// pg の接続プールが開いたままだと終了しないため明示的に落とす
process.exit(0);
