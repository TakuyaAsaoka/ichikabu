import Foundation
import IchikabuAPI
import Testing

@testable import Ichikabu

@Suite("テーマのイベントと銘柄")
struct ThemeViewLogicTests {
	private let car = Theme(id: 20, name: "自動車")
	private let toyota = Stock(id: 1, market: .JP, ticker: "7203", name: "トヨタ自動車", themeIds: [20])
	private let softbank = Stock(id: 2, market: .JP, ticker: "9434", name: "ソフトバンク", themeIds: [20, 30])
	private let daikin = Stock(id: 3, market: .JP, ticker: "6367", name: "ダイキン工業", themeIds: [30])
	/// 2026-09-16 の昼（JST）。今の時刻には頼らない
	private let today: Date = {
		var components = DateComponents(year: 2026, month: 9, day: 16, hour: 12)
		components.timeZone = TimeZone(identifier: "Asia/Tokyo")
		return EventLayout.calendar.date(from: components) ?? Date(timeIntervalSince1970: 0)
	}()

	private func event(
		_ id: String, _ target: Components.Schemas.EventTarget, start: String, end: String? = nil
	) -> Event {
		Event(
			id: id, kind: .theme, title: "イベント\(id)", shortLabel: id,
			startDate: start, endDate: end, time: nil, importance: 1, note: nil, source: nil,
			target: target)
	}

	private func themeTarget(_ id: Int) -> Components.Schemas.EventTarget {
		.theme(.init(_type: .theme, themeId: id))
	}

	private func ids(_ events: [Event]) -> [String] { events.map(\.id) }

	@Test("そのテーマのイベントが、渡した並びのまま入る")
	func テーマのイベントが入る() {
		let events = [
			event("b", themeTarget(20), start: "2026-09-30"),
			event("a", themeTarget(20), start: "2026-09-17"),
		]
		#expect(ids(EventLayout.upcoming(forTheme: car, events: events, today: today)) == ["b", "a"])
	}

	@Test("ほかのテーマ・銘柄・市場のイベントは入らない")
	func 関係の無いイベントは入らない() {
		let events = [
			event("theme", themeTarget(30), start: "2026-09-20"),
			event("stock", .stock(.init(_type: .stock, stockId: 1)), start: "2026-09-20"),
			event("market", .market(.init(_type: .market, market: .GLOBAL)), start: "2026-09-20"),
		]
		#expect(EventLayout.upcoming(forTheme: car, events: events, today: today).isEmpty)
	}

	@Test("過ぎたイベントは入らず、今日と続いている期間は入る")
	func 過ぎたイベントは入らない() {
		let events = [
			event("past", themeTarget(20), start: "2026-09-15"),
			event("today", themeTarget(20), start: "2026-09-16"),
			event("running", themeTarget(20), start: "2026-09-10", end: "2026-09-18"),
			event("ended", themeTarget(20), start: "2026-09-10", end: "2026-09-15"),
		]
		#expect(ids(EventLayout.upcoming(forTheme: car, events: events, today: today)) == ["today", "running"])
	}

	@Test("テーマに属する銘柄だけが、渡した並びのまま入る")
	func 属する銘柄だけ() {
		let result = EventLayout.stocks(in: car, from: [softbank, daikin, toyota])
		#expect(result.map(\.id) == [2, 1])
	}

	@Test("銘柄が無いテーマの補足は「銘柄なし」")
	func 補足は銘柄なし() {
		let empty = Theme(id: 99, name: "空")
		#expect(EventLayout.themeSummary(for: empty, stocks: [toyota], registered: [1]) == "銘柄なし")
	}

	@Test("登録した銘柄が属していなければ、銘柄の数だけを出す")
	func 補足は登録なし() {
		#expect(EventLayout.themeSummary(for: car, stocks: [toyota, softbank, daikin], registered: [3]) == "2銘柄")
	}

	@Test("登録した銘柄が1つでも属していれば「登録あり」を足し、登録の数は出さない。持ち株でも気になる銘柄でも同じ")
	func 補足は登録あり() {
		#expect(EventLayout.themeSummary(for: car, stocks: [toyota, softbank, daikin], registered: [1]) == "2銘柄・登録あり")
		#expect(EventLayout.themeSummary(for: car, stocks: [toyota, softbank, daikin], registered: [1, 2]) == "2銘柄・登録あり")
	}
}
