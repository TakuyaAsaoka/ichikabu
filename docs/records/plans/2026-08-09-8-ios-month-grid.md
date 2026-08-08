# iOS 月グリッドカレンダー 実装計画

> **エージェントへ**: 必須のサブスキル — `superpowers:subagent-driven-development`（推奨）または `superpowers:executing-plans` でタスクごとに実装すること。手順はチェックボックス（`- [ ]`）で進捗を管理する。

**ゴール**: Issue #5 の素朴な `List` を、横スワイプで月を送る等高の月グリッドに置き換える。

**方針**: 日付計算とイベントの割り当ては `EventLayout` の純関数に集め、画面（`CalendarView`）から切り離してテストする。イベントの日付は `"2026-08-04"` 形式のゼロ埋め文字列なので、辞書順がそのまま日付順になる性質を使い、`Date` への変換を一切しない。確認用データは `server` の seed に入れる。

**技術**: Swift 6 / SwiftUI（iOS 18）/ Swift Testing（`@Test`）/ Next.js / Drizzle ORM / PostgreSQL

**根拠**: [設計書](../specs/2026-08-09-8-ios-month-grid-design.md)（以下「設計書」）、[全体設計書](../specs/2026-08-02-1-ichikabu-design.md)

## 全体の制約

- コードコメント・テストケース名・コミットメッセージは**日本語**。ファイル名・ディレクトリ名は英語
- カレンダーの日付計算はすべて **JST・グレゴリオ暦・日曜始まり**。`Calendar.current` を使わない（設計書 判断4）
- 種別の色は**銘柄＝琥珀／市場＝藍／テーマ＝紫**。色に重要度を持たせない（全体設計書 §10.2）
- 重要度は**★3かそれ以外かの2値**でのみセルに出す。★1と★2に差をつけない（全体設計書 §10.2）
- セルに出すイベントは**2件まで**。3件目以降は `+N`（全体設計書 §10.2）
- 月の範囲は**起動月の前後12ヶ月（25ページ）**（設計書 判断5）
- グリッドは**常に6週42セル**（設計書 判断6）
- seed に入れるイベントの日付は**各社IRページで確認した実在のもの**だけ（全体設計書 §5.1）
- `as` キャストや `!`（強制アンラップ）で型を通さない。値が無い場合は分岐するか例外を投げる
- 品質ゲート（マージ前に必ず両方）:
  - `cd server && pnpm install && pnpm gen && pnpm build && pnpm test:run && pnpm typecheck && pnpm lint`
  - `cd ios && xcodebuild build test -scheme Ichikabu -destination 'platform=iOS Simulator,name=iPhone 17' -skipPackagePluginValidation`

---

## ファイル構成

| ファイル | 役割 | タスク |
|---|---|---|
| `server/src/db/seed-user.ts` | **変更**。戻り値に `userId` を足す | 1 |
| `server/src/db/seed-event.ts` | **変更**。銘柄・保有・決算イベントを入れる。既存の市場イベント3件を消す | 1 |
| `server/scripts/seed.ts` | **変更**。`userId` を `seedEvents` に渡す | 1 |
| `ios/Ichikabu/EventLayout.swift` | **新規**。純関数のみ（カレンダー・日付キー・週配列・その日のイベント・種別の色） | 2 |
| `ios/IchikabuTests/EventLayoutTests.swift` | **新規**。`EventLayout` のテスト | 2 |
| `ios/Ichikabu/CalendarView.swift` | **新規**（`EventListView.swift` をリネーム）。取得と401処理は据え置き、`List` を月グリッドに差し替え | 3 |
| `ios/Ichikabu/EventListView.swift` | **削除** | 3 |
| `ios/Ichikabu/IchikabuApp.swift` | **変更**。`EventListView` の参照を `CalendarView` に変える | 3 |
| `docs/records/specs/2026-08-09-8-ios-month-grid-design.md` | **変更**。§7 の確認手順を実測に合わせる | 4 |

Xcode プロジェクトは `PBXFileSystemSynchronizedRootGroup` なので、ファイルの追加・リネーム・削除に `project.pbxproj` の編集は要らない。

---

## Task 1: seed に銘柄・保有・決算イベントを入れる

**ファイル:**
- 変更: `server/src/db/seed-user.ts`
- 変更: `server/src/db/seed-event.ts`（全面書き換え）
- 変更: `server/scripts/seed.ts`

**インターフェース:**
- 提供: `seedUser(email: string, password: string): Promise<{ created: boolean; userId: string }>`
- 提供: `seedEvents(userId: string): Promise<{ created: number }>`

**前提**: 開発用DBが起動していること。この worktree で未実施なら先に `server/` で `cp .env.example .env.local`（`BETTER_AUTH_SECRET` に `openssl rand -base64 32` の出力、`SEED_USER_EMAIL` / `SEED_USER_PASSWORD` を記入）→ `docker compose up -d --wait` → `pnpm install && pnpm db:migrate`。

- [ ] **手順1: DBを作り直して、既存の市場イベント3件を消す**

既にDBに入っている FOMC・米CPI・米雇用統計は、`EVENTS` から消しても seed では削除されない（seed は不足分を足すだけ）。作り直す。

```bash
cd server && docker compose down -v && docker compose up -d --wait && pnpm db:migrate
```

- [ ] **手順2: `seedUser` の戻り値に `userId` を足す**

`server/src/db/seed-user.ts` の戻り値の型と2箇所の `return` を変える。両分岐とも user オブジェクトを既に持っているので、値を足すだけで済む。

```ts
export async function seedUser(
  email: string,
  password: string,
): Promise<{ created: boolean; userId: string }> {
  const ctx = await auth.$context;

  const found = await ctx.internalAdapter.findUserByEmail(email, {
    includeAccounts: true,
  });
  if (found?.accounts.some((a) => a.providerId === CREDENTIAL)) {
    return { created: false, userId: found.user.id };
  }

  const user =
    found?.user ??
    (await ctx.internalAdapter.createUser({
      email,
      name: email,
      // 運用者本人を手で入れるため、メール確認の経路は用意しない
      emailVerified: true,
    }));

  await ctx.internalAdapter.createAccount({
    userId: user.id,
    providerId: CREDENTIAL,
    accountId: user.id,
    password: await ctx.password.hash(password),
  });

  return { created: true, userId: user.id };
}
```

- [ ] **手順3: `seed-event.ts` を書き換える**

`server/src/db/seed-event.ts` の中身をすべて次に置き換える。

```ts
import { and, eq, inArray } from "drizzle-orm";
import { db } from ".";
import { event, holding, stock } from "./schema";

/**
 * 開発中の表示確認に使うデータ（Issue #8 設計書 §3）。
 *
 * 日付の出典は各社のIRページだけを使う（全体設計書 §5.1）ため、
 * 入れられるのは銘柄イベント（決算発表日）だけになる。市場イベント・
 * テーマイベントは、使ってよい出典が増えるまで入れられない。
 */
const STOCKS = [
  { market: "JP", ticker: "7203", name: "トヨタ自動車", fiscalMonth: 3 },
  { market: "JP", ticker: "9434", name: "ソフトバンク", fiscalMonth: 3 },
  { market: "JP", ticker: "6367", name: "ダイキン工業", fiscalMonth: 3 },
] as const;

/**
 * 2026年8月4日に決算発表が集中しているため、同じ日に3件を置く。
 * これで「1日3件のセルが2件＋ +1 になる」「★3だけ強調される」を
 * 起動月のページで目視できる。重要度は運用者の主観の設定値なので、
 * 出典で確認する対象ではない（設計書 §3）。
 */
const EVENTS = [
  {
    ticker: "7203",
    title: "トヨタ自動車 2027年3月期 第1四半期決算",
    shortLabel: "7203決算",
    startDate: "2026-08-04",
    importance: 3,
    sourceUrl: "https://global.toyota/jp/ir/financial-results/index.html",
  },
  {
    ticker: "9434",
    title: "ソフトバンク 2027年3月期 第1四半期決算",
    shortLabel: "9434決算",
    startDate: "2026-08-04",
    importance: 2,
    sourceUrl:
      "https://www.softbank.jp/corp/news/press/sbkk/2026/20260804_01/",
  },
  {
    ticker: "6367",
    title: "ダイキン工業 2027年3月期 第1四半期決算",
    shortLabel: "6367決算",
    startDate: "2026-08-04",
    importance: 1,
    sourceUrl: "https://www.daikin.co.jp/investor/calendar",
  },
] as const;

/**
 * 銘柄・保有・イベントを投入する。何度実行しても増えない。
 * 銘柄と保有は一意の制約があるので衝突を無視し、
 * イベントには一意の制約が無いため、見出しで既にあるかを判定する。
 */
export async function seedEvents(userId: string): Promise<{ created: number }> {
  await db.insert(stock).values([...STOCKS]).onConflictDoNothing();

  const stocks = await db
    .select({ id: stock.id, ticker: stock.ticker })
    .from(stock)
    .where(
      and(
        eq(stock.market, "JP"),
        inArray(
          stock.ticker,
          STOCKS.map((s) => s.ticker),
        ),
      ),
    );
  const stockIdOf = new Map(stocks.map((s) => [s.ticker, s.id]));

  await db
    .insert(holding)
    .values(stocks.map((s) => ({ userId, stockId: s.id })))
    .onConflictDoNothing();

  const existing = await db
    .select({ title: event.title })
    .from(event)
    .where(
      inArray(
        event.title,
        EVENTS.map((e) => e.title),
      ),
    );
  const have = new Set(existing.map((row) => row.title));

  const missing = EVENTS.filter((e) => !have.has(e.title)).map(
    ({ ticker, ...rest }) => {
      const stockId = stockIdOf.get(ticker);
      // 直前に投入しているので通常は起きない。握りつぶすと
      // 「イベントが入らないのに成功する」状態になるため落とす
      if (stockId === undefined) {
        throw new Error(`銘柄が見つからない: ${ticker}`);
      }
      return { ...rest, stockId };
    },
  );
  if (missing.length > 0) await db.insert(event).values(missing);
  return { created: missing.length };
}
```

- [ ] **手順4: `scripts/seed.ts` で `userId` を渡す**

`server/scripts/seed.ts` の2箇所を変える。

```ts
const { created, userId } = await seedUser(email, password);
console.log(
  created ? `ユーザーを作成した: ${email}` : `ユーザーは既に存在する: ${email}`,
);

const { created: eventCount } = await seedEvents(userId);
console.log(`イベントを ${eventCount} 件作成した`);
```

- [ ] **手順5: 初回の投入を確認する**

Run: `cd server && pnpm db:seed`

期待する出力:

```
ユーザーを作成した: <SEED_USER_EMAIL の値>
イベントを 3 件作成した
```

- [ ] **手順6: 2回目で増えないことを確認する（冪等性の確認）**

Run: `cd server && pnpm db:seed`

期待する出力:

```
ユーザーは既に存在する: <SEED_USER_EMAIL の値>
イベントを 0 件作成した
```

- [ ] **手順7: 行数がちょうど3件ずつであることを確認する**

2回実行しても `stock`・`holding`・`event` が増えていないことを、件数で確かめる。

Run:

```bash
docker exec server-db-1 psql -U postgres -d ichikabu -t -c \
  "SELECT 'stock', count(*) FROM stock UNION ALL SELECT 'holding', count(*) FROM holding UNION ALL SELECT 'event', count(*) FROM event;"
```

期待する出力（順不同）:

```
 stock   |     3
 holding |     3
 event   |     3
```

- [ ] **手順8: server 側の品質ゲートを通す**

Run: `cd server && pnpm install && pnpm gen && pnpm build && pnpm test:run && pnpm typecheck && pnpm lint`

期待: すべて成功し、エラーも警告も0件。

- [ ] **手順9: コミット**

```bash
git add server/src/db/seed-user.ts server/src/db/seed-event.ts server/scripts/seed.ts
git commit -m "[feat] 表示確認用の銘柄と決算イベントを seed に入れる"
```

---

## Task 2: EventLayout の純関数とテスト

**ファイル:**
- 新規: `ios/Ichikabu/EventLayout.swift`
- 新規: `ios/IchikabuTests/EventLayoutTests.swift`

**インターフェース:**
- 提供: `EventLayout.calendar: Calendar`
- 提供: `EventLayout.key(for date: Date) -> String`
- 提供: `EventLayout.title(for monthStart: Date) -> String`（`2026年9月`。Task 3 の月の表題で使う）
- 提供: `EventLayout.month(offset: Int, from base: Date) -> Date`
- 提供: `EventLayout.weeks(inMonthOf monthStart: Date) -> [[Date]]`（6行×7列）
- 提供: `EventLayout.events(on key: String, from events: [Event]) -> [Event]`
- 提供: `EventLayout.color(for kind: Event.kindPayload) -> Color`

生成された `Event` の初期化子の引数順は `id, kind, title, shortLabel, startDate, endDate, time, importance, note` で、`endDate`・`time`・`note` は既定値 `nil` を持つ。`Event.kindPayload` は `.market` / `.theme` / `.stock` の3値で `CaseIterable`。

- [ ] **手順1: 失敗するテストを書く**

`ios/IchikabuTests/EventLayoutTests.swift` を新規作成する。

```swift
import Foundation
import IchikabuAPI
import SwiftUI
import Testing

@testable import Ichikabu

@Suite("月グリッドの日付計算とイベントの割り当て")
struct EventLayoutTests {
	/// テスト用のイベントを1件作る。日付以外は表示に影響しないので固定値でよい
	private func event(
		id: Int,
		startDate: String,
		endDate: String? = nil,
		kind: Event.kindPayload = .stock,
		importance: Int = 1
	) -> Event {
		Event(
			id: id,
			kind: kind,
			title: "テスト",
			shortLabel: "テスト",
			startDate: startDate,
			endDate: endDate,
			time: nil,
			importance: importance,
			note: nil
		)
	}

	/// JST の指定日の正午を作る。正午にするのは、
	/// タイムゾーンが多少ずれても日付が変わらないようにするため
	private func jstNoon(_ key: String) -> Date {
		let formatter = DateFormatter()
		formatter.calendar = EventLayout.calendar
		formatter.timeZone = EventLayout.calendar.timeZone
		formatter.locale = Locale(identifier: "en_US_POSIX")
		formatter.dateFormat = "yyyy-MM-dd HH:mm"
		guard let date = formatter.date(from: "\(key) 12:00") else {
			fatalError("テスト用の日付を作れない: \(key)")
		}
		return date
	}

	@Test("単日のイベントはその日だけに出る")
	func singleDay() {
		let events = [event(id: 1, startDate: "2026-08-04")]
		#expect(EventLayout.events(on: "2026-08-04", from: events).count == 1)
		#expect(EventLayout.events(on: "2026-08-03", from: events).isEmpty)
		#expect(EventLayout.events(on: "2026-08-05", from: events).isEmpty)
	}

	@Test("期間のイベントは開始日から終了日までの各日に出る")
	func period() {
		let events = [event(id: 1, startDate: "2026-09-16", endDate: "2026-09-17")]
		#expect(EventLayout.events(on: "2026-09-15", from: events).isEmpty)
		#expect(EventLayout.events(on: "2026-09-16", from: events).count == 1)
		#expect(EventLayout.events(on: "2026-09-17", from: events).count == 1)
		#expect(EventLayout.events(on: "2026-09-18", from: events).isEmpty)
	}

	@Test("月をまたぐ期間は両方の月に出る")
	func acrossMonths() {
		let events = [event(id: 1, startDate: "2026-08-31", endDate: "2026-09-01")]
		#expect(EventLayout.events(on: "2026-08-31", from: events).count == 1)
		#expect(EventLayout.events(on: "2026-09-01", from: events).count == 1)
	}

	@Test("その日のイベントは渡された並び順のまま返る")
	func keepsOrder() {
		let events = [
			event(id: 10, startDate: "2026-08-04"),
			event(id: 20, startDate: "2026-08-04"),
			event(id: 30, startDate: "2026-08-04"),
		]
		#expect(EventLayout.events(on: "2026-08-04", from: events).map(\.id) == [10, 20, 30])
	}

	@Test("種別ごとに違う色になる")
	func colorsDiffer() {
		let colors = Event.kindPayload.allCases.map(EventLayout.color(for:))
		#expect(Set(colors).count == Event.kindPayload.allCases.count)
	}

	@Test("週の配列は常に6週42日になる")
	func alwaysSixWeeks() {
		// 2026年2月は28日ちょうどで日曜始まり。最も短くなる月でも6週にする
		for key in ["2026-02-01", "2026-08-01", "2026-09-01"] {
			let weeks = EventLayout.weeks(inMonthOf: jstNoon(key))
			#expect(weeks.count == 6)
			#expect(weeks.allSatisfy { $0.count == 7 })
		}
	}

	@Test("グリッドの先頭は月初の直前の日曜になる")
	func startsOnSunday() {
		// 2026年9月1日は火曜。日曜始まりなので8月30日から始まる
		let weeks = EventLayout.weeks(inMonthOf: jstNoon("2026-09-01"))
		#expect(EventLayout.key(for: weeks[0][0]) == "2026-08-30")
		#expect(EventLayout.key(for: weeks[0][2]) == "2026-09-01")
	}

	@Test("月のオフセットで前後の月に移動できる")
	func monthOffset() {
		let base = jstNoon("2026-08-09")
		#expect(EventLayout.key(for: EventLayout.month(offset: 0, from: base)) == "2026-08-01")
		#expect(EventLayout.key(for: EventLayout.month(offset: 1, from: base)) == "2026-09-01")
		#expect(EventLayout.key(for: EventLayout.month(offset: -1, from: base)) == "2026-07-01")
		#expect(EventLayout.key(for: EventLayout.month(offset: 12, from: base)) == "2027-08-01")
	}

	@Test("日付キーが端末のタイムゾーンに依存しない")
	func keyIsJST() {
		// JST 2026-08-05 00:30 は UTC では 2026-08-04 15:30。
		// 端末が UTC でもキーは JST の日付になる
		// （`TZ=UTC date -r 1785857400` と `TZ=Asia/Tokyo date -r 1785857400` で検算済み）
		let date = Date(timeIntervalSince1970: 1_785_857_400)
		#expect(EventLayout.key(for: date) == "2026-08-05")
	}
}
```

- [ ] **手順2: テストが失敗することを確認する**

Run:

```bash
cd ios && xcodebuild build test -scheme Ichikabu \
  -destination 'platform=iOS Simulator,name=iPhone 17' -skipPackagePluginValidation
```

期待: コンパイルエラー `cannot find 'EventLayout' in scope` で失敗する。

- [ ] **手順3: `EventLayout.swift` を書く**

`ios/Ichikabu/EventLayout.swift` を新規作成する。

```swift
import Foundation
import IchikabuAPI
import SwiftUI

/// 月グリッドの日付計算とイベントの割り当て。
/// 画面から切り離してテストできるように、状態を持たない関数だけを置く
enum EventLayout {
	/// 日付の計算はすべてJST・グレゴリオ暦・日曜始まりで行う。
	/// 端末のタイムゾーンや暦の設定でセルの日付がずれてはならない（設計書 §2 判断4）
	static let calendar: Calendar = {
		var calendar = Calendar(identifier: .gregorian)
		if let jst = TimeZone(identifier: "Asia/Tokyo") {
			calendar.timeZone = jst
		}
		calendar.firstWeekday = 1  // 日曜
		return calendar
	}()

	/// ロケールを固定しないと、端末の暦設定（和暦等）で yyyy が別の年号になる
	private static let keyFormatter: DateFormatter = {
		let formatter = DateFormatter()
		formatter.calendar = calendar
		formatter.timeZone = calendar.timeZone
		formatter.locale = Locale(identifier: "en_US_POSIX")
		formatter.dateFormat = "yyyy-MM-dd"
		return formatter
	}()

	/// 月の表題（`2026年9月`）
	private static let titleFormatter: DateFormatter = {
		let formatter = DateFormatter()
		formatter.calendar = calendar
		formatter.timeZone = calendar.timeZone
		formatter.locale = Locale(identifier: "ja_JP")
		formatter.dateFormat = "y年M月"
		return formatter
	}()

	/// イベントの `startDate` と突き合わせるための日付キー（`2026-08-04`）
	static func key(for date: Date) -> String {
		keyFormatter.string(from: date)
	}

	/// グリッド上部に出す月の表題
	static func title(for monthStart: Date) -> String {
		titleFormatter.string(from: monthStart)
	}

	/// 基準日の属する月から offset ヶ月ずらした月の1日
	static func month(offset: Int, from base: Date) -> Date {
		let components = calendar.dateComponents([.year, .month], from: base)
		guard let firstOfBaseMonth = calendar.date(from: components),
			let shifted = calendar.date(byAdding: .month, value: offset, to: firstOfBaseMonth)
		else {
			return base
		}
		return shifted
	}

	/// 月グリッドに描く6週×7日。月の実際の週数によらず常に42日を返すので、
	/// どの月も同じ高さになる（設計書 §2 判断6）
	static func weeks(inMonthOf monthStart: Date) -> [[Date]] {
		let weekday = calendar.component(.weekday, from: monthStart)  // 日曜=1
		guard
			let gridStart = calendar.date(
				byAdding: .day, value: -(weekday - calendar.firstWeekday), to: monthStart)
		else {
			return []
		}
		let days = (0..<42).compactMap { calendar.date(byAdding: .day, value: $0, to: gridStart) }
		return stride(from: 0, to: days.count, by: 7).map { Array(days[$0..<min($0 + 7, days.count)]) }
	}

	/// その日のセルに出すイベント。
	/// 日付は `2026-08-04` 形式のゼロ埋め文字列なので、文字列の大小がそのまま日付の前後になる。
	/// 単日（`endDate` が nil）は `startDate` に縮退させ、期間と同じ式で扱う（設計書 §2 判断3）
	static func events(on key: String, from events: [Event]) -> [Event] {
		events.filter { $0.startDate <= key && ($0.endDate ?? $0.startDate) >= key }
	}

	/// 種別ごとの色。色に重要度を持たせない（全体設計書 §10.2）。
	/// 琥珀・藍は SwiftUI 標準に無いため、3色とも明示的に定義して彩度・明度を揃える
	static func color(for kind: Event.kindPayload) -> Color {
		switch kind {
		case .stock: Color(red: 0.72, green: 0.47, blue: 0.05)  // 琥珀
		case .market: Color(red: 0.15, green: 0.28, blue: 0.60)  // 藍
		case .theme: Color(red: 0.45, green: 0.22, blue: 0.62)  // 紫
		}
	}
}
```

- [ ] **手順4: テストが通ることを確認する**

Run:

```bash
cd ios && xcodebuild build test -scheme Ichikabu \
  -destination 'platform=iOS Simulator,name=iPhone 17' -skipPackagePluginValidation
```

期待: `** TEST SUCCEEDED **`。`EventLayoutTests` の9件がすべて通る。

`keyIsJST` が落ちる場合は、`TZ=Asia/Tokyo date -r 1785857400` が `2026-08-05 00:30` を返すことを確かめてから `EventLayout.calendar` の `timeZone` を見る。

- [ ] **手順5: コミット**

```bash
git add ios/Ichikabu/EventLayout.swift ios/IchikabuTests/EventLayoutTests.swift
git commit -m "[feat] 月グリッドの日付計算とイベントの割り当てを純関数で書く"
```

---

## Task 3: 画面を月グリッドに差し替える

**ファイル:**
- 新規: `ios/Ichikabu/CalendarView.swift`
- 削除: `ios/Ichikabu/EventListView.swift`
- 変更: `ios/Ichikabu/IchikabuApp.swift`

**インターフェース:**
- 消費: Task 2 の `EventLayout` 全体
- 提供: `CalendarView(token: String, onUnauthorized: () -> Void)`

- [ ] **手順1: `EventListView.swift` を `CalendarView.swift` にリネームする**

```bash
git mv ios/Ichikabu/EventListView.swift ios/Ichikabu/CalendarView.swift
```

- [ ] **手順2: `CalendarView.swift` の中身を書き換える**

イベント取得・401処理・エラーメッセージは現行のまま使い、`List` を月グリッドに差し替える。

```swift
import IchikabuAPI
import SwiftUI

/// メイン画面。等高の月グリッドを横スワイプで送る（全体設計書 §10）
struct CalendarView: View {
	let token: String
	/// 401 が返ったときに呼ぶ
	let onUnauthorized: () -> Void

	@State private var events: [Event] = []
	@State private var message: String?
	/// 起動月を0として、何ヶ月ずれた月を見ているか
	@State private var monthOffset = 0

	/// ページの基準になる日。描き直しのたびに変わらないよう、画面を作った時刻で固定する
	private let today = Date()

	/// 起動月の前後12ヶ月（設計書 §2 判断5）
	private static let monthRange = -12...12

	var body: some View {
		TabView(selection: $monthOffset) {
			ForEach(Self.monthRange, id: \.self) { offset in
				MonthPage(
					monthStart: EventLayout.month(offset: offset, from: today),
					today: today,
					events: events
				)
				.tag(offset)
			}
		}
		.tabViewStyle(.page(indexDisplayMode: .never))
		.overlay {
			if let message {
				Text(message).foregroundStyle(.secondary)
			}
		}
		.task {
			await load()
		}
	}

	private func load() async {
		do {
			events = try await APIClient().events(token: token)
		} catch APIError.unauthorized {
			onUnauthorized()
		} catch {
			message = "イベントを取得できませんでした"
		}
	}
}

/// 1か月ぶんのページ。月の表題・曜日ヘッダ・6週×7列のグリッド
private struct MonthPage: View {
	let monthStart: Date
	let today: Date
	let events: [Event]

	private static let weekdayNames = ["日", "月", "火", "水", "木", "金", "土"]

	var body: some View {
		VStack(spacing: 4) {
			Text(EventLayout.title(for: monthStart))
				.font(.headline)

			HStack(spacing: 0) {
				ForEach(Self.weekdayNames, id: \.self) { name in
					Text(name)
						.font(.caption2)
						.foregroundStyle(.secondary)
						.frame(maxWidth: .infinity)
				}
			}

			// 6週を等分するので、どの月も同じ高さになる（設計書 §2 判断6）
			ForEach(Array(EventLayout.weeks(inMonthOf: monthStart).enumerated()), id: \.offset) {
				_, week in
				HStack(spacing: 0) {
					ForEach(week, id: \.self) { day in
						DayCell(
							day: day,
							isInMonth: EventLayout.calendar.isDate(
								day, equalTo: monthStart, toGranularity: .month),
							isToday: EventLayout.key(for: day) == EventLayout.key(for: today),
							events: EventLayout.events(on: EventLayout.key(for: day), from: events)
						)
					}
				}
				.frame(maxHeight: .infinity)
			}
		}
		.padding(.horizontal, 4)
		.padding(.bottom, 8)
	}
}

/// 1日ぶんのセル
private struct DayCell: View {
	let day: Date
	/// 表示中の月の日か。42セルの前後の埋め草は日番号だけ出す（設計書 §2 判断9）
	let isInMonth: Bool
	let isToday: Bool
	let events: [Event]

	/// セルに出すのは2件まで（全体設計書 §10.2）
	private static let visibleCount = 2

	var body: some View {
		VStack(alignment: .leading, spacing: 1) {
			dayNumber
			if isInMonth {
				ForEach(events.prefix(Self.visibleCount), id: \.id) { event in
					label(for: event)
				}
				if events.count > Self.visibleCount {
					Text("+\(events.count - Self.visibleCount)")
						.font(.system(size: 9))
						.foregroundStyle(.secondary)
				}
			}
			Spacer(minLength: 0)
		}
		.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
		.accessibilityElement(children: .combine)
	}

	private var dayNumber: some View {
		Text("\(EventLayout.calendar.component(.day, from: day))")
			.font(.caption2)
			.foregroundStyle(isInMonth ? Color.primary : Color.secondary)
			.frame(width: 16, height: 16)
			.background {
				if isToday {
					Circle().fill(Color.accentColor.opacity(0.25))
				}
			}
	}

	/// ★3のラベルだけ左端に赤の細線と太字。★1・★2に差はつけない（全体設計書 §10.2）
	private func label(for event: Event) -> some View {
		HStack(spacing: 1) {
			if event.importance == 3 {
				Rectangle().fill(Color.red).frame(width: 2)
			}
			Text(event.shortLabel)
				.font(.system(size: 9))
				.fontWeight(event.importance == 3 ? .bold : .regular)
				.foregroundStyle(EventLayout.color(for: event.kind))
				.lineLimit(1)
		}
		.frame(height: 12)
	}
}
```

- [ ] **手順3: `IchikabuApp.swift` の参照を差し替える**

`ios/Ichikabu/IchikabuApp.swift` の `EventListView(token:onUnauthorized:)` を `CalendarView(token:onUnauthorized:)` に変える。他は変えない。

```swift
			if let token {
				CalendarView(token: token, onUnauthorized: signOut)
			} else {
				SignInView(onSignedIn: signIn)
			}
```

- [ ] **手順4: ビルドとテストを通す**

Run:

```bash
cd ios && xcodebuild build test -scheme Ichikabu \
  -destination 'platform=iOS Simulator,name=iPhone 17' -skipPackagePluginValidation
```

期待: `** TEST SUCCEEDED **`。警告も0件にする。

- [ ] **手順5: コミット**

```bash
# git mv による EventListView.swift の削除も含めるため、ディレクトリごと足す
git add -A ios/Ichikabu/
git commit -m "[feat] イベント一覧を月グリッドに置き換える"
```

---

## Task 4: 目視で確認し、設計書の確認手順を実測に合わせる

**ファイル:**
- 変更: `docs/records/specs/2026-08-09-8-ios-month-grid-design.md`（§7）

- [ ] **手順1: サーバーを起動する**

```bash
cd server && pnpm dev
```

- [ ] **手順2: シミュレータで画面を出す**

Xcode で `Ichikabu` を iPhone 17 のシミュレータに実行し、`.env.local` の `SEED_USER_EMAIL` / `SEED_USER_PASSWORD` でサインインする。

- [ ] **手順3: 完了条件を目視で確認する**

| 見るもの | 期待 |
|---|---|
| 起動時のページの表題 | `2026年8月` |
| 8/4 のセル | `7203決算`（琥珀・左端に赤の細線・太字）＋ `9434決算`（琥珀・線なし・太字でない）＋ `+1` |
| 8/4 以外の日 | イベントが無い |
| 今日（8/9）の日番号 | 丸い背景が付いている |
| 7月末・9月頭のセル（42セルの埋め草） | 日番号がグレーで、イベントは出ない |
| 左スワイプ | `2026年9月` になる |
| 右スワイプを13回 | `2025年8月` で止まり、それ以上戻らない |

うまく出ない場合の切り分け:

| 症状 | 見るところ |
|---|---|
| セルが全部空 | `pnpm db:seed` を実行したか。`curl -H "authorization: Bearer <トークン>" http://localhost:3000/api/events` で3件返るか |
| 月の表題が和暦 | `EventLayout.titleFormatter` の `locale` |
| 日付が1日ずれる | シミュレータのタイムゾーン設定。ずれるなら `EventLayout.calendar` の `timeZone` |

- [ ] **手順4: 設計書 §7 を実測に合わせて書き換える**

`docs/records/specs/2026-08-09-8-ios-month-grid-design.md` の §7 で、実施済みになった項目のラベルを「未実施」から実測に変える。

- 手順1: `イベントを 3 件作成した` と `イベントを 0 件作成した` の実際の出力を貼る
- 手順3: server 側ゲートの結果を「実測済み」にする
- 手順4: 目視の結果を「実施済み（YYYY-MM-DD）」にし、見えなかったものがあれば書く

推測で書かない。実行していない項目は「未実施」のまま残す。

- [ ] **手順5: 両方の品質ゲートを通す**

```bash
cd server && pnpm install && pnpm gen && pnpm build && pnpm test:run && pnpm typecheck && pnpm lint
cd ios && xcodebuild build test -scheme Ichikabu \
  -destination 'platform=iOS Simulator,name=iPhone 17' -skipPackagePluginValidation
```

期待: 両方ともエラー・警告とも0件で成功する。

- [ ] **手順6: コミット**

```bash
git add docs/records/specs/2026-08-09-8-ios-month-grid-design.md
git commit -m "[docs] 月グリッドの確認手順を実測に合わせる"
```

---

## 完了の判定

Issue #8 の完了条件との対応:

| 完了条件 | どこで満たすか |
|---|---|
| seed イベントが該当日のセルに短縮ラベルで表示される | Task 4 手順3（8/4 のセル） |
| 3件以上の日は2件＋`+N` | Task 4 手順3（`+1`） |
| ★3だけ赤の細線と太字、★1・★2には付かない | Task 4 手順3 |
| 種別ごとに色が異なることがユニットテストで固定されている | Task 2（`colorsDiffer`） |
| 期間イベントが各日のセルに出ることがユニットテストで固定されている | Task 2（`period`・`acrossMonths`） |
| 横スワイプで前月・翌月に移動できる | Task 4 手順3 |
| iOS 側ゲートが成功する | Task 4 手順5 |
