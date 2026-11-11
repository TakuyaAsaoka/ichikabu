import Foundation
import IchikabuAPI
import Testing

@testable import Ichikabu

@Suite("銘柄のこれから来るイベント")
struct UpcomingEventsTests {
	private let stock = Stock(id: 1, market: .JP, ticker: "7203", name: "トヨタ自動車", themeIds: [20])
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
			id: id, kind: .stock, title: "イベント\(id)", shortLabel: id,
			startDate: start, endDate: end, time: nil, importance: 1, note: nil, source: nil,
			target: target)
	}

	private func stockTarget(_ id: Int) -> Components.Schemas.EventTarget {
		.stock(.init(_type: .stock, stockId: id))
	}

	private func themeTarget(_ id: Int) -> Components.Schemas.EventTarget {
		.theme(.init(_type: .theme, themeId: id))
	}

	private func ids(_ events: [Event]) -> [String] { events.map(\.id) }

	private func upcoming(_ events: [Event]) -> [Event] {
		EventLayout.upcoming(for: stock, events: events, today: today)
	}

	@Test("その銘柄のイベントが入る")
	func 銘柄のイベントが入る() {
		#expect(ids(upcoming([event("a", stockTarget(1), start: "2026-09-20")])) == ["a"])
	}

	@Test("入っているテーマのイベントが入る")
	func テーマのイベントが入る() {
		#expect(ids(upcoming([event("a", themeTarget(20), start: "2026-09-20")])) == ["a"])
	}

	@Test("ほかの銘柄・入っていないテーマ・市場のイベントは入らない")
	func 関係の無いイベントは入らない() {
		let events = [
			event("other", stockTarget(2), start: "2026-09-20"),
			event("theme", themeTarget(10), start: "2026-09-20"),
			event("market", .market(.init(_type: .market, market: .GLOBAL)), start: "2026-09-20"),
			event("jp", .market(.init(_type: .market, market: .JP)), start: "2026-09-20"),
		]
		#expect(upcoming(events).isEmpty)
	}

	@Test("過ぎたイベントは入らない")
	func 過ぎたイベントは入らない() {
		#expect(upcoming([event("a", stockTarget(1), start: "2026-09-15")]).isEmpty)
	}

	@Test("今日のイベントは入る")
	func 今日のイベントは入る() {
		#expect(ids(upcoming([event("a", stockTarget(1), start: "2026-09-16")])) == ["a"])
	}

	@Test("期間のイベントは、始まっていても終わる日が今日以降なら入る")
	func 続いている期間は入る() {
		let events = [
			event("running", stockTarget(1), start: "2026-09-10", end: "2026-09-18"),
			event("endsToday", stockTarget(1), start: "2026-09-10", end: "2026-09-16"),
		]
		#expect(ids(upcoming(events)) == ["running", "endsToday"])
	}

	@Test("期間のイベントは、終わっていれば入らない")
	func 終わった期間は入らない() {
		#expect(upcoming([event("a", stockTarget(1), start: "2026-09-10", end: "2026-09-15")]).isEmpty)
	}

	@Test("渡した並びを保つ")
	func 並びを保つ() {
		let events = [
			event("c", themeTarget(20), start: "2026-09-30"),
			event("a", stockTarget(1), start: "2026-09-17"),
			event("b", stockTarget(1), start: "2026-09-20"),
		]
		#expect(ids(upcoming(events)) == ["c", "a", "b"])
	}

	@Test("今日かどうかはJSTの日付で決まる。JSTの0時30分は、UTCではまだ前日でも今日")
	func JSTの日付で決まる() {
		var components = DateComponents(year: 2026, month: 9, day: 16, hour: 0, minute: 30)
		components.timeZone = TimeZone(identifier: "Asia/Tokyo")
		let early = EventLayout.calendar.date(from: components) ?? Date(timeIntervalSince1970: 0)
		let events = [
			event("today", stockTarget(1), start: "2026-09-16"),
			event("yesterday", stockTarget(1), start: "2026-09-15"),
		]
		#expect(ids(EventLayout.upcoming(for: stock, events: events, today: early)) == ["today"])
	}

	@Test("次に来るイベントがあれば、日付と名称の文字列になる")
	func 次のイベントの文字列() {
		let text = EventLayout.nextEventText(
			for: stock, events: [event("a", stockTarget(1), start: "2026-09-20")], today: today)
		#expect(text == "9月20日 (日) イベントa")
	}

	@Test("次に来るイベントが無ければ nil")
	func 次のイベントが無ければnil() {
		let text = EventLayout.nextEventText(
			for: stock, events: [event("a", stockTarget(1), start: "2026-09-15")], today: today)
		#expect(text == nil)
	}

	@Test("2件あるときは早いほう（先頭）を選ぶ")
	func 先頭を選ぶ() {
		let events = [
			event("early", stockTarget(1), start: "2026-09-18"),
			event("late", themeTarget(20), start: "2026-09-25"),
		]
		#expect(
			EventLayout.nextEventText(for: stock, events: events, today: today)
				== "9月18日 (金) イベントearly")
	}
}
