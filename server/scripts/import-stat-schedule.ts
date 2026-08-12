import { fetchStatSchedule, toStatEvents } from "../app/stat-schedule";
import { db } from "../src/db";
import { upsertMarketEvents } from "../src/db/write";

/**
 * 総務省統計局の消費者物価指数の公表予定を取り込む（設計書 §1）。
 *
 * 決まった間隔での自動実行は作っていない。XML は16ヶ月先まで載っているので
 * 月1回この手で叩けば足りる。何を入れて何が変わったかはここに出す
 */
const events = toStatEvents(await fetchStatSchedule());
if (events.length === 0) {
  // 区分やタグの名前が変わるとここへ来る。黙って成功させると、
  // 取り込めていないことに気づけない
  throw new Error(
    "公表予定から月次の予定が1件も取れなかった（XML の形が変わった可能性）",
  );
}
console.log(`公表予定から ${events.length} 件を読んだ`);

const { created, changed } = await upsertMarketEvents(events);

console.log(`登録した: ${created.length} 件`);
for (const title of created) {
  console.log(`  + ${title}`);
}

console.log(`公表日時が変わった: ${changed.length} 件`);
for (const { title, from, to } of changed) {
  console.log(
    `  * ${title}: ${from.startDate} ${from.time} → ${to.startDate} ${to.time}`,
  );
}

// pg の接続プールが開いたままだと終了しない。process.exit(0) では、パイプに
// つないだときに書きかけの出力が落ちる。このスクリプトは何が変わったかを
// 出すのが目的なので、プールを閉じて自然に終わらせる
await db.$client.end();
