import Foundation
import IchikabuAPI
import Testing
import os

@testable import Ichikabu

/// 取得の成否と回数を、テストの側から切り替える・数えるための入れ物
private actor Probe {
	var failsEvents = false
	var failsStocks = false
	var failsThemes = false
	private(set) var eventCalls = 0
	/// 何回目の取得か。成功した側が返す値を回ごとに変えて、上書きを見つけられるようにする
	private(set) var round = 1

	func nextRound() {
		round += 1
	}

	func set(events: Bool = false, stocks: Bool = false, themes: Bool = false) {
		failsEvents = events
		failsStocks = stocks
		failsThemes = themes
	}

	/// 呼ばれた回数を1つ増やし、増やしたあとの回数を返す
	func countEventCall() -> Int {
		eventCalls += 1
		return eventCalls
	}
}

private struct Failure: Error {}

/// テストから進められる時計。決まった時間は待たず、時刻を直接書き換える
private final class TestClock: Sendable {
	private let time: OSAllocatedUnfairLock<Date>

	init(_ iso: String) {
		time = OSAllocatedUnfairLock(initialState: Self.date(iso))
	}

	/// 日本時間の時刻を書く（例: "2026-11-10T23:59:00+09:00"）
	static func date(_ iso: String) -> Date {
		ISO8601DateFormatter().date(from: iso)!
	}

	var now: Date { time.withLock { $0 } }

	func set(_ iso: String) {
		time.withLock { $0 = Self.date(iso) }
	}

	func advance(by seconds: TimeInterval) {
		time.withLock { $0 = $0.addingTimeInterval(seconds) }
	}
}

@MainActor
@Suite("アプリのデータ（取得と保存）")
struct AppDataTests {
	private let stock = Stock(id: 1, market: .JP, ticker: "7203", name: "トヨタ自動車", themeIds: [20])
	private let otherStock = Stock(id: 2, market: .JP, ticker: "6758", name: "ソニーグループ", themeIds: [])

	/// 銘柄のイベントを1件作る。日付以外は表示に影響しないので固定値でよい
	private nonisolated func event(id: Int, stockId: Int) -> Event {
		Event(
			id: String(id),
			kind: .stock,
			title: "決算",
			shortLabel: "決算",
			startDate: "2026-08-04",
			endDate: nil,
			time: nil,
			importance: 1,
			note: nil,
			target: .stock(.init(_type: .stock, stockId: stockId))
		)
	}

	private func defaults(_ suiteName: String) throws -> UserDefaults {
		let defaults = try #require(UserDefaults(suiteName: suiteName))
		defaults.removePersistentDomain(forName: suiteName)
		return defaults
	}

	/// `Probe` の指示どおりに成功・失敗する通信
	private func fetch(_ probe: Probe, events: [Event] = [], stocks: [Stock] = [], themes: [Theme] = [])
		-> AppData.Fetch
	{
		AppData.Fetch(
			events: {
				_ = await probe.countEventCall()
				if await probe.failsEvents { throw Failure() }
				return events
			},
			stocks: {
				if await probe.failsStocks { throw Failure() }
				return stocks
			},
			themes: {
				if await probe.failsThemes { throw Failure() }
				return themes
			})
	}

	@Test("3本とも成功すると、3つが入り、受け取れた状態になる")
	func loadsAll() async throws {
		let suiteName = "app-data-loads-all"
		let defaults = try defaults(suiteName)
		defer { defaults.removePersistentDomain(forName: suiteName) }
		let theme = Theme(id: 20, name: "自動車")
		let data = AppData(
			fetch: fetch(Probe(), events: [event(id: 1, stockId: 1)], stocks: [stock], themes: [theme]),
			store: RegistrationStore(defaults: defaults))

		await data.load()

		#expect(data.events.map(\.id) == ["1"])
		#expect(data.stocks.map(\.id) == [1])
		#expect(data.themes.map(\.id) == [20])
		#expect(data.loaded)
		#expect(!data.failed)
		#expect(!data.isLoading)
	}

	/// 落とす取得。`#expect` の文と、テスト用の入れ物の名前に使う
	enum Target: String, CaseIterable, Sendable {
		case events = "イベント"
		case stocks = "銘柄"
	}

	@Test("一度受け取ったあと、イベントか銘柄の取り直しが落ちても、失敗にせず前の値を残す", arguments: Target.allCases)
	func refetchFailureKeepsValues(target: Target) async throws {
		let suiteName = "app-data-refetch-failure-\(target)"
		let defaults = try defaults(suiteName)
		defer { defaults.removePersistentDomain(forName: suiteName) }
		let probe = Probe()
		// 2回目は、落ちない側が別の値（id 2）を返す。上書きされれば id 2 に変わって見つかる
		let data = AppData(
			fetch: AppData.Fetch(
				events: {
					if await probe.failsEvents { throw Failure() }
					let id = await probe.round
					return [event(id: id, stockId: id)]
				},
				stocks: {
					if await probe.failsStocks { throw Failure() }
					let id = await probe.round
					return [Stock(id: id, market: .JP, ticker: "000\(id)", name: "銘柄\(id)", themeIds: [])]
				},
				themes: {
					let id = await probe.round
					return [Theme(id: id, name: "テーマ\(id)")]
				}),
			store: RegistrationStore(defaults: defaults))
		await data.load()

		await probe.nextRound()
		await probe.set(events: target == .events, stocks: target == .stocks)
		await data.load()

		#expect(!data.failed, "\(target.rawValue)の取り直しが落ちたのに失敗の画面になる")
		#expect(data.loaded)
		#expect(data.events.map(\.id) == ["1"], "\(target.rawValue)が落ちたとき、イベントを上書きした")
		#expect(data.stocks.map(\.id) == [1], "\(target.rawValue)が落ちたとき、銘柄を上書きした")
		#expect(data.themes.map(\.id) == [1], "\(target.rawValue)が落ちたとき、テーマを上書きした")
	}

	@Test("まだ受け取れていないときの取得の失敗は、失敗になり、受け取れた状態にならない", arguments: Target.allCases)
	func firstFailure(target: Target) async throws {
		let suiteName = "app-data-first-failure-\(target)"
		let defaults = try defaults(suiteName)
		defer { defaults.removePersistentDomain(forName: suiteName) }
		let probe = Probe()
		await probe.set(events: target == .events, stocks: target == .stocks)
		let data = AppData(
			fetch: fetch(probe, events: [event(id: 1, stockId: 1)], stocks: [stock]),
			store: RegistrationStore(defaults: defaults))

		await data.load()

		#expect(data.failed, "\(target.rawValue)の取得が落ちたのに失敗になっていない")
		#expect(!data.loaded)
		#expect(data.events.isEmpty)
	}

	@Test("一度受け取ったあと、テーマだけ取り直しが落ちても、前のテーマを残す")
	func refetchThemesFailureKeepsThemes() async throws {
		let suiteName = "app-data-refetch-themes-failure"
		let defaults = try defaults(suiteName)
		defer { defaults.removePersistentDomain(forName: suiteName) }
		let probe = Probe()
		let data = AppData(
			fetch: fetch(
				probe, events: [event(id: 1, stockId: 1)], stocks: [stock],
				themes: [Theme(id: 20, name: "自動車")]),
			store: RegistrationStore(defaults: defaults))
		await data.load()

		await probe.set(themes: true)
		await data.load()

		#expect(!data.failed)
		#expect(data.themes.map(\.id) == [20], "取り直しでテーマだけ落ちたのに、テーマが消えた")
	}

	@Test("失敗したあとにもう一度読んで成功すると、失敗の状態が消えて値が入る")
	func recoversAfterFailure() async throws {
		let suiteName = "app-data-recovers"
		let defaults = try defaults(suiteName)
		defer { defaults.removePersistentDomain(forName: suiteName) }
		let probe = Probe()
		await probe.set(events: true)
		let data = AppData(
			fetch: fetch(probe, events: [event(id: 1, stockId: 1)], stocks: [stock]),
			store: RegistrationStore(defaults: defaults))
		await data.load()
		#expect(data.failed)

		await probe.set()
		await data.load()

		#expect(!data.failed)
		#expect(data.loaded)
		#expect(data.events.map(\.id) == ["1"])
		#expect(data.stocks.map(\.id) == [1])
	}

	@Test("テーマの取得だけが落ちたときは、失敗にせずテーマを空にする")
	func themesFailure() async throws {
		let suiteName = "app-data-themes-failure"
		let defaults = try defaults(suiteName)
		defer { defaults.removePersistentDomain(forName: suiteName) }
		let probe = Probe()
		await probe.set(themes: true)
		let data = AppData(
			fetch: fetch(
				probe, events: [event(id: 1, stockId: 1)], stocks: [stock],
				themes: [Theme(id: 20, name: "自動車")]),
			store: RegistrationStore(defaults: defaults))

		await data.load()

		#expect(!data.failed)
		#expect(data.loaded)
		#expect(data.themes.isEmpty)
		#expect(data.events.map(\.id) == ["1"])
	}

	@Test("取得の途中にもう一度呼んでも、取得は1回しか走らない", .timeLimit(.minutes(1)))
	func doesNotLoadTwice() async throws {
		let suiteName = "app-data-no-double-load"
		let defaults = try defaults(suiteName)
		defer { defaults.removePersistentDomain(forName: suiteName) }
		let probe = Probe()
		// 決まった時間は待たない。取得が始まったら知らせ、こちらが許すまで返さない
		let (started, startedSignal) = AsyncStream.makeStream(of: Void.self)
		let (release, releaseSignal) = AsyncStream.makeStream(of: Void.self)
		let data = AppData(
			fetch: AppData.Fetch(
				events: {
					// 待たせるのは1回目だけ。2本目が走っても止まらず、回数の違いで落ちるようにする
					guard await probe.countEventCall() == 1 else { return [] }
					startedSignal.yield()
					for await _ in release { break }
					return []
				},
				stocks: { [] },
				themes: { [] }),
			store: RegistrationStore(defaults: defaults))

		let first = Task { await data.load() }
		for await _ in started { break }
		#expect(data.isLoading)

		await data.load()
		releaseSignal.yield()
		await first.value

		#expect(await probe.eventCalls == 1)
		#expect(!data.isLoading)
	}

	// MARK: - 今日と取り直し

	private func makeTimed(_ suiteName: String, clock: TestClock, probe: Probe = Probe()) throws -> (AppData, Probe, UserDefaults) {
		let defaults = try defaults(suiteName)
		let data = AppData(
			fetch: fetch(probe, events: [event(id: 1, stockId: 1)], stocks: [stock]),
			store: RegistrationStore(defaults: defaults),
			now: { clock.now })
		return (data, probe, defaults)
	}

	@Test("日本時間で日付が変わると、today が進む。UTC では同じ日でも進む")
	func refreshTodayAdvancesAtJSTMidnight() throws {
		// 23:59 JST = 14:59 UTC、0:01 JST = 15:01 UTC。UTC では同じ日の中。
		// 限界: 走らせる端末の時間帯が日本だと、暦を端末の設定に替える壊し方は見つけられない（UTC に替える壊し方は見つける）
		let clock = TestClock("2026-11-10T23:59:00+09:00")
		let (data, _, defaults) = try makeTimed("app-data-today-advances", clock: clock)
		defer { defaults.removePersistentDomain(forName: "app-data-today-advances") }
		#expect(data.today == TestClock.date("2026-11-10T23:59:00+09:00"))

		clock.set("2026-11-11T00:01:00+09:00")
		data.refreshToday()

		#expect(data.today == TestClock.date("2026-11-11T00:01:00+09:00"))
	}

	@Test("同じ日のうちは、時刻が進んでも today を替えない")
	func refreshTodayKeepsWithinSameDay() throws {
		let clock = TestClock("2026-11-10T00:01:00+09:00")
		let (data, _, defaults) = try makeTimed("app-data-today-same-day", clock: clock)
		defer { defaults.removePersistentDomain(forName: "app-data-today-same-day") }

		clock.set("2026-11-10T23:59:00+09:00")
		data.refreshToday()

		#expect(data.today == TestClock.date("2026-11-10T00:01:00+09:00"))
	}

	@Test("受け取れていて5分以上たっていれば、前に戻したときに取り直す")
	func activatedRefetchesAfterFiveMinutes() async throws {
		let clock = TestClock("2026-11-10T12:00:00+09:00")
		let (data, probe, defaults) = try makeTimed("app-data-activated-refetch", clock: clock)
		defer { defaults.removePersistentDomain(forName: "app-data-activated-refetch") }
		await data.load()
		#expect(await probe.eventCalls == 1)

		clock.advance(by: 5 * 60)
		await data.activated()

		#expect(await probe.eventCalls == 2)
	}

	@Test("最後に受け取ってから5分たっていなければ、取り直さない")
	func activatedSkipsWithinFiveMinutes() async throws {
		let clock = TestClock("2026-11-10T12:00:00+09:00")
		let (data, probe, defaults) = try makeTimed("app-data-activated-skip", clock: clock)
		defer { defaults.removePersistentDomain(forName: "app-data-activated-skip") }
		await data.load()

		clock.advance(by: 5 * 60 - 1)
		await data.activated()

		#expect(await probe.eventCalls == 1)
	}

	@Test("取り直して受け取れたら、5分の数え直しは新しい受け取りからになる")
	func activatedCountsFromLastReceived() async throws {
		let clock = TestClock("2026-11-10T12:00:00+09:00")
		let (data, probe, defaults) = try makeTimed("app-data-activated-recount", clock: clock)
		defer { defaults.removePersistentDomain(forName: "app-data-activated-recount") }
		await data.load()
		clock.advance(by: 6 * 60)
		await data.activated()
		#expect(await probe.eventCalls == 2)

		clock.advance(by: 4 * 60)
		await data.activated()

		#expect(await probe.eventCalls == 2)
	}

	@Test("時計が最後に受け取った時刻より戻っていたら、取り直す")
	func activatedRefetchesWhenClockWentBack() async throws {
		let clock = TestClock("2026-11-10T12:00:00+09:00")
		let (data, probe, defaults) = try makeTimed("app-data-activated-clock-back", clock: clock)
		defer { defaults.removePersistentDomain(forName: "app-data-activated-clock-back") }
		await data.load()

		clock.advance(by: -60 * 60)
		await data.activated()

		#expect(await probe.eventCalls == 2)
	}

	@Test("取り直しが失敗したあと、次に前に戻したときにまた取り直す")
	func activatedRetriesAfterRefetchFailure() async throws {
		let clock = TestClock("2026-11-10T12:00:00+09:00")
		let (data, probe, defaults) = try makeTimed("app-data-activated-retry", clock: clock)
		defer { defaults.removePersistentDomain(forName: "app-data-activated-retry") }
		await data.load()

		await probe.set(events: true)
		clock.advance(by: 6 * 60)
		await data.activated()
		#expect(await probe.eventCalls == 2)

		// 失敗は受け取った時刻を進めないので、1分後でも前の受け取りから5分以上たっている
		clock.advance(by: 60)
		await data.activated()

		#expect(await probe.eventCalls == 3)
	}

	@Test("一度受け取ったあと、取り直しが全部落ちても、失敗にせず、テーマは空のまま残る（テーマを一度も受け取れていない場合）")
	func refetchAllFailKeepsEmptyThemes() async throws {
		let suiteName = "app-data-refetch-all-fail"
		let defaults = try defaults(suiteName)
		defer { defaults.removePersistentDomain(forName: suiteName) }
		let probe = Probe()
		await probe.set(themes: true)
		let data = AppData(
			fetch: fetch(probe, events: [event(id: 1, stockId: 1)], stocks: [stock]),
			store: RegistrationStore(defaults: defaults))
		await data.load()

		await probe.set(events: true, stocks: true, themes: true)
		await data.load()

		#expect(!data.failed)
		#expect(data.loaded)
		#expect(data.themes.isEmpty)
		#expect(data.events.map(\.id) == ["1"])
	}

	@Test("まだ一度も受け取れていないときは、前に戻しても取り直さない（最初の読み込みと再試行が担う）")
	func activatedSkipsBeforeFirstReceive() async throws {
		let clock = TestClock("2026-11-10T12:00:00+09:00")
		let (data, probe, defaults) = try makeTimed("app-data-activated-not-loaded", clock: clock)
		defer { defaults.removePersistentDomain(forName: "app-data-activated-not-loaded") }

		clock.advance(by: 60 * 60)
		await data.activated()

		#expect(await probe.eventCalls == 0)
	}

	@Test("最初の取得に失敗したあとも、前に戻したときに取り直さない")
	func activatedSkipsAfterFirstFailure() async throws {
		let clock = TestClock("2026-11-10T12:00:00+09:00")
		let probe = Probe()
		await probe.set(events: true)
		let (data, _, defaults) = try makeTimed("app-data-activated-first-failed", clock: clock, probe: probe)
		defer { defaults.removePersistentDomain(forName: "app-data-activated-first-failed") }
		await data.load()

		clock.advance(by: 60 * 60)
		await data.activated()

		#expect(await probe.eventCalls == 1)
		#expect(data.failed)
	}

	@Test("日付が変わっていれば、取り直さなくても today は進む")
	func activatedAdvancesTodayWithoutRefetch() async throws {
		let clock = TestClock("2026-11-10T23:59:00+09:00")
		let (data, probe, defaults) = try makeTimed("app-data-activated-today", clock: clock)
		defer { defaults.removePersistentDomain(forName: "app-data-activated-today") }
		await data.load()

		clock.set("2026-11-11T00:01:00+09:00")
		await data.activated()

		#expect(await probe.eventCalls == 1)
		#expect(data.today == TestClock.date("2026-11-11T00:01:00+09:00"))
	}

	// MARK: - 登録

	private func makeData(_ suiteName: String, events: [Event] = [], stocks: [Stock] = []) throws -> (AppData, UserDefaults) {
		let defaults = try defaults(suiteName)
		let data = AppData(fetch: fetch(Probe(), events: events, stocks: stocks), store: RegistrationStore(defaults: defaults))
		return (data, defaults)
	}

	@Test("持ち株にすると持ち株に入り、気になる銘柄には入らない")
	func registerHeld() throws {
		let (data, defaults) = try makeData("app-data-register-held")
		defer { defaults.removePersistentDomain(forName: "app-data-register-held") }

		data.register(1, as: .held)

		#expect(data.holdings == [1])
		#expect(data.watching.isEmpty)
		#expect(data.registration(of: 1) == .held)
	}

	@Test("気になる銘柄にすると気になる銘柄に入り、持ち株には入らない")
	func registerWatching() throws {
		let (data, defaults) = try makeData("app-data-register-watching")
		defer { defaults.removePersistentDomain(forName: "app-data-register-watching") }

		data.register(1, as: .watching)

		#expect(data.watching == [1])
		#expect(data.holdings.isEmpty)
		#expect(data.registration(of: 1) == .watching)
	}

	@Test("nil を指定すると登録が外れる。登録していない銘柄の registration は nil")
	func unregister() throws {
		let (data, defaults) = try makeData("app-data-unregister")
		defer { defaults.removePersistentDomain(forName: "app-data-unregister") }
		data.register(1, as: .held)
		data.register(2, as: .watching)

		data.register(1, as: nil)
		data.register(2, as: nil)

		#expect(data.holdings.isEmpty)
		#expect(data.watching.isEmpty)
		#expect(data.registration(of: 1) == nil)
		#expect(data.registration(of: 3) == nil)
	}

	@Test("持ち株から気になる銘柄に替えると、持ち株から消える。逆も同じ")
	func switchRegistration() throws {
		let (data, defaults) = try makeData("app-data-switch")
		defer { defaults.removePersistentDomain(forName: "app-data-switch") }
		data.register(1, as: .held)

		data.register(1, as: .watching)
		#expect(data.holdings.isEmpty)
		#expect(data.watching == [1])

		data.register(1, as: .held)
		#expect(data.holdings == [1])
		#expect(data.watching.isEmpty)
	}

	@Test("同じ指定を2回しても、増えない")
	func registerTwice() throws {
		let (data, defaults) = try makeData("app-data-register-twice")
		defer { defaults.removePersistentDomain(forName: "app-data-register-twice") }

		data.register(1, as: .held)
		data.register(1, as: .held)
		data.register(2, as: .watching)
		data.register(2, as: .watching)

		#expect(data.holdings == [1])
		#expect(data.watching == [2])
	}

	@Test("登録すると端末に保存され、作り直しても読み直される")
	func savesRegistrations() throws {
		let (data, defaults) = try makeData("app-data-saves-registrations")
		defer { defaults.removePersistentDomain(forName: "app-data-saves-registrations") }

		data.register(1, as: .held)
		data.register(2, as: .watching)

		let reopened = AppData(fetch: fetch(Probe()), store: RegistrationStore(defaults: defaults))
		#expect(reopened.holdings == [1])
		#expect(reopened.watching == [2])
	}

	@Test("保存の中身で同じ銘柄が両方に入っていたら、持ち株として扱う")
	func bothKeysPreferHeld() throws {
		let defaults = try defaults("app-data-both-keys")
		defer { defaults.removePersistentDomain(forName: "app-data-both-keys") }
		defaults.set([1], forKey: "holdings")
		defaults.set([1, 2], forKey: "watching")

		let data = AppData(fetch: fetch(Probe()), store: RegistrationStore(defaults: defaults))

		#expect(data.registration(of: 1) == .held)
		#expect(data.watching == [2])
		// 直した値が保存にも書かれている（作っただけで、登録は1度も替えていない）
		#expect(RegistrationStore(defaults: defaults).load(.watching) == [2])

		// 持ち株から外して作り直しても、食い違っていた保存が気になる銘柄として戻ってこない
		data.register(1, as: nil)
		let reopened = AppData(fetch: fetch(Probe()), store: RegistrationStore(defaults: defaults))
		#expect(reopened.registration(of: 1) == nil)
		#expect(reopened.watching == [2])
	}

	@Test("registered は持ち株と気になる銘柄を合わせたもの。持ち株が先")
	func registeredCombines() throws {
		let (data, defaults) = try makeData("app-data-registered")
		defer { defaults.removePersistentDomain(forName: "app-data-registered") }

		data.register(2, as: .watching)
		data.register(1, as: .held)

		#expect(data.registered == [1, 2])
	}

	@Test("登録を変えると、見せるイベントが変わる。気になる銘柄のイベントも出る")
	func visibleEvents() async throws {
		let (data, defaults) = try makeData(
			"app-data-visible-events",
			events: [event(id: 1, stockId: 1), event(id: 2, stockId: 2)],
			stocks: [stock, otherStock])
		defer { defaults.removePersistentDomain(forName: "app-data-visible-events") }
		await data.load()

		data.register(1, as: .held)
		#expect(data.visibleEvents.map(\.id) == ["1"])

		data.register(1, as: nil)
		data.register(2, as: .watching)
		#expect(data.visibleEvents.map(\.id) == ["2"])

		data.register(1, as: .held)
		#expect(data.visibleEvents.map(\.id) == ["1", "2"])
	}
}
