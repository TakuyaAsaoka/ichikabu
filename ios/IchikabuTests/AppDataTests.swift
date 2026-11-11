import Foundation
import IchikabuAPI
import Testing

@testable import Ichikabu

/// 取得の成否と回数を、テストの側から切り替える・数えるための入れ物
private actor Probe {
	var failsEvents = false
	var failsStocks = false
	var failsThemes = false
	private(set) var eventCalls = 0

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

@MainActor
@Suite("アプリのデータ（取得と保存）")
struct AppDataTests {
	private let stock = Stock(id: 1, market: .JP, ticker: "7203", name: "トヨタ自動車", themeIds: [20])
	private let otherStock = Stock(id: 2, market: .JP, ticker: "6758", name: "ソニーグループ", themeIds: [])

	/// 銘柄のイベントを1件作る。日付以外は表示に影響しないので固定値でよい
	private func event(id: Int, stockId: Int) -> Event {
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
			store: HoldingStore(defaults: defaults))

		await data.load()

		#expect(data.events.map(\.id) == ["1"])
		#expect(data.stocks.map(\.id) == [1])
		#expect(data.themes.map(\.id) == [20])
		#expect(data.loaded)
		#expect(!data.failed)
		#expect(!data.isLoading)
	}

	@Test("イベントの取得が落ちると失敗になり、前の値を上書きしない")
	func eventsFailure() async throws {
		let suiteName = "app-data-events-failure"
		let defaults = try defaults(suiteName)
		defer { defaults.removePersistentDomain(forName: suiteName) }
		let probe = Probe()
		let data = AppData(
			fetch: fetch(probe, events: [event(id: 1, stockId: 1)], stocks: [stock]),
			store: HoldingStore(defaults: defaults))
		await data.load()

		await probe.set(events: true)
		await data.load()

		#expect(data.failed)
		#expect(data.events.map(\.id) == ["1"])
		#expect(data.stocks.map(\.id) == [1])
	}

	@Test("銘柄の取得が落ちても失敗になり、前の値を上書きしない")
	func stocksFailure() async throws {
		let suiteName = "app-data-stocks-failure"
		let defaults = try defaults(suiteName)
		defer { defaults.removePersistentDomain(forName: suiteName) }
		let probe = Probe()
		let data = AppData(
			fetch: fetch(probe, events: [event(id: 1, stockId: 1)], stocks: [stock]),
			store: HoldingStore(defaults: defaults))
		await data.load()

		await probe.set(stocks: true)
		await data.load()

		#expect(data.failed)
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
			store: HoldingStore(defaults: defaults))

		await data.load()

		#expect(!data.failed)
		#expect(data.loaded)
		#expect(data.themes.isEmpty)
		#expect(data.events.map(\.id) == ["1"])
	}

	@Test("取得の途中にもう一度呼んでも、取得は1回しか走らない")
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
			store: HoldingStore(defaults: defaults))

		let first = Task { await data.load() }
		for await _ in started { break }
		#expect(data.isLoading)

		await data.load()
		releaseSignal.yield()
		await first.value

		#expect(await probe.eventCalls == 1)
		#expect(!data.isLoading)
	}

	@Test("持ち株を変えると端末に保存され、作り直しても読み直される")
	func savesHoldings() throws {
		let suiteName = "app-data-saves-holdings"
		let defaults = try defaults(suiteName)
		defer { defaults.removePersistentDomain(forName: suiteName) }
		let data = AppData(fetch: fetch(Probe()), store: HoldingStore(defaults: defaults))

		data.holdings = [1, 2]

		#expect(HoldingStore(defaults: defaults).load() == [1, 2])
		let reopened = AppData(fetch: fetch(Probe()), store: HoldingStore(defaults: defaults))
		#expect(reopened.holdings == [1, 2])
	}

	@Test("見せるイベントは、持ち株に対応するものだけになる")
	func visibleEvents() async throws {
		let suiteName = "app-data-visible-events"
		let defaults = try defaults(suiteName)
		defer { defaults.removePersistentDomain(forName: suiteName) }
		let data = AppData(
			fetch: fetch(
				Probe(), events: [event(id: 1, stockId: 1), event(id: 2, stockId: 2)],
				stocks: [stock, otherStock]),
			store: HoldingStore(defaults: defaults))
		await data.load()

		data.holdings = [1]

		#expect(data.visibleEvents.map(\.id) == ["1"])
	}
}
