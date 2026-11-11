import IchikabuAPI
import Testing

@testable import Ichikabu

@Suite("シートの行に出す、イベントと持ち株の関係")
struct EventRelationTests {
	private let lasertec = Stock(
		id: 1, market: .JP, ticker: "6920", name: "レーザーテック", themeIds: [10])
	private let tokyoElectron = Stock(
		id: 2, market: .JP, ticker: "8035", name: "東京エレクトロン", themeIds: [10])
	private let toyota = Stock(
		id: 3, market: .JP, ticker: "7203", name: "トヨタ自動車", themeIds: [])
	private let stocks: [Stock]
	private let themes = [Theme(id: 10, name: "半導体")]

	init() {
		stocks = [lasertec, tokyoElectron, toyota]
	}

	private func event(target: Components.Schemas.EventTarget) -> Event {
		Event(
			id: "1",
			kind: {
				switch target {
				case .market: .market
				case .theme: .theme
				case .stock: .stock
				}
			}(),
			title: "テスト",
			shortLabel: "テスト",
			startDate: "2026-09-16",
			endDate: nil,
			time: nil,
			importance: 1,
			note: nil,
			source: nil,
			target: target
		)
	}

	private func marketEvent(_ market: Components.Schemas.EventMarket) -> Event {
		event(target: .market(.init(_type: .market, market: market)))
	}

	private func themeEvent(_ themeId: Int) -> Event {
		event(target: .theme(.init(_type: .theme, themeId: themeId)))
	}

	private func stockEvent(_ stockId: Int) -> Event {
		event(target: .stock(.init(_type: .stock, stockId: stockId)))
	}

	private func relation(_ event: Event, holdings: [Int], themes: [Theme]? = nil) -> String? {
		EventLayout.relation(
			of: event, holdings: holdings, stocks: stocks, themes: themes ?? self.themes)
	}

	@Test("市場イベントは対象の市場を出す")
	func market() {
		#expect(relation(marketEvent(.JP), holdings: []) == "市場: 日本")
		#expect(relation(marketEvent(.US), holdings: []) == "市場: 米国")
		#expect(relation(marketEvent(.GLOBAL), holdings: []) == "市場: すべて")
	}

	@Test("テーマイベントはテーマ名と、そのテーマの持ち株を stocks の並びで出す")
	func themeWithHoldings() {
		#expect(
			relation(themeEvent(10), holdings: [2, 1])
				== "テーマ: 半導体 ／ 持ち株: レーザーテック・東京エレクトロン")
	}

	@Test("持っていない銘柄は出ない")
	func notHeldIsHidden() {
		#expect(relation(themeEvent(10), holdings: [2]) == "テーマ: 半導体 ／ 持ち株: 東京エレクトロン")
	}

	@Test("テーマの名前が分からないときは持ち株だけを出す")
	func themeWithoutName() {
		#expect(
			relation(themeEvent(10), holdings: [1, 2], themes: [])
				== "持ち株: レーザーテック・東京エレクトロン")
	}

	@Test("テーマに属する持ち株が無ければテーマ名だけを出す")
	func themeWithoutHoldings() {
		#expect(relation(themeEvent(10), holdings: [3]) == "テーマ: 半導体")
	}

	@Test("テーマの名前も持ち株も分からなければ何も出さない")
	func themeWithNothing() {
		#expect(relation(themeEvent(10), holdings: [3], themes: []) == nil)
	}

	@Test("銘柄イベントは銘柄名を持ち株として出す。銘柄が無ければ何も出さない")
	func stock() {
		#expect(relation(stockEvent(1), holdings: [1]) == "持ち株: レーザーテック")
		#expect(relation(stockEvent(99), holdings: [99]) == nil)
	}
}
