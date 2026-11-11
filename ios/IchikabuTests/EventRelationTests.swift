import IchikabuAPI
import Testing

@testable import Ichikabu

@Suite("イベントと持ち株の関係")
struct EventRelationTests {
	private let lasertec = Stock(
		id: 1, market: .JP, ticker: "6920", name: "レーザーテック", themeIds: [10])
	private let tokyoElectron = Stock(
		id: 2, market: .JP, ticker: "8035", name: "東京エレクトロン", themeIds: [10])
	private let usStock = Stock(
		id: 4, market: .US, ticker: "NVDA", name: "エヌビディア", themeIds: [])
	private let stocks: [Stock]
	private let themes = [Theme(id: 10, name: "半導体"), Theme(id: 20, name: "自動車")]

	init() {
		stocks = [
			lasertec, tokyoElectron,
			Stock(id: 3, market: .JP, ticker: "7203", name: "トヨタ自動車", themeIds: [20]), usStock,
		]
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

	private func hint(_ event: Event, holdings: [Int]) -> String? {
		EventLayout.relationHint(of: event, holdings: holdings, stocks: stocks)
	}

	private func detail(_ event: Event, holdings: [Int], themes: [Theme]? = nil)
		-> EventLayout.RelationDetail?
	{
		EventLayout.relationDetail(
			of: event, holdings: holdings, stocks: stocks, themes: themes ?? self.themes)
	}

	private func names(_ detail: EventLayout.RelationDetail?) -> [String] {
		detail?.stocks.map(\.name) ?? []
	}

	// MARK: - 一覧の行の手がかり

	@Test("市場イベントの手がかりは、市場ごとの持ち株の言い方になる")
	func hintMarket() {
		#expect(hint(marketEvent(.GLOBAL), holdings: []) == "すべての持ち株")
		#expect(hint(marketEvent(.JP), holdings: []) == "日本株の持ち株")
		#expect(hint(marketEvent(.US), holdings: []) == "米国株の持ち株")
	}

	@Test("持ち株が1つのテーマの手がかりは、その銘柄名")
	func hintThemeSingle() {
		#expect(hint(themeEvent(20), holdings: [3]) == "トヨタ自動車")
	}

	@Test("持ち株が複数のテーマの手がかりは、stocks の先頭の銘柄名と残りの数")
	func hintThemeMany() {
		#expect(hint(themeEvent(10), holdings: [2, 1]) == "レーザーテック ほか1銘柄")
	}

	@Test("持っていない銘柄は、手がかりの「ほか○銘柄」の数に入らない")
	func hintNotHeld() {
		#expect(hint(themeEvent(10), holdings: [1]) == "レーザーテック")
	}

	@Test("テーマに属する持ち株が無ければ手がかりは出さない")
	func hintThemeWithoutHoldings() {
		#expect(hint(themeEvent(10), holdings: [3]) == nil)
	}

	@Test("銘柄イベントの手がかりは銘柄名。銘柄が無ければ出さない")
	func hintStock() {
		#expect(hint(stockEvent(1), holdings: [1]) == "レーザーテック")
		#expect(hint(stockEvent(99), holdings: [99]) == nil)
	}

	// MARK: - 詳細の文と持ち株

	@Test("全体の市場イベントは、全員に関係すると言い、持ち株の一覧は無い")
	func detailGlobal() {
		let result = detail(marketEvent(.GLOBAL), holdings: [1])
		#expect(result == .init(sentence: "持ち株にかかわらず、全員に関係します", stocks: []))
	}

	@Test("日本・米国の市場イベントは、その市場の持ち株だけを並べる")
	func detailMarket() {
		let jp = detail(marketEvent(.JP), holdings: [4, 2, 1])
		#expect(jp?.sentence == "日本株を持つ人全員に関係します")
		#expect(names(jp) == ["レーザーテック", "東京エレクトロン"])
		let us = detail(marketEvent(.US), holdings: [4, 1])
		#expect(us?.sentence == "米国株を持つ人全員に関係します")
		#expect(names(us) == ["エヌビディア"])
	}

	@Test("持ち株が1つのテーマは、銘柄名とテーマ名を文に入れる")
	func detailThemeSingle() {
		let result = detail(themeEvent(20), holdings: [3])
		#expect(result?.sentence == "持ち株のトヨタ自動車が「自動車」のテーマに入っています")
		#expect(names(result) == ["トヨタ自動車"])
	}

	@Test("持ち株が複数のテーマは、銘柄の数を文に入れ、stocks の並びで並べる")
	func detailThemeMany() {
		let result = detail(themeEvent(10), holdings: [2, 1])
		#expect(result?.sentence == "持ち株のうち2銘柄が「半導体」のテーマに入っています")
		#expect(names(result) == ["レーザーテック", "東京エレクトロン"])
	}

	@Test("持っていない銘柄は、詳細の文にも持ち株の一覧にも出ない")
	func detailNotHeld() {
		let result = detail(themeEvent(10), holdings: [2])
		#expect(result?.sentence == "持ち株の東京エレクトロンが「半導体」のテーマに入っています")
		#expect(names(result) == ["東京エレクトロン"])
	}

	@Test("テーマの名前が分からないときは、名前を省いた文にして持ち株を出す")
	func detailThemeWithoutName() {
		let single = detail(themeEvent(20), holdings: [3], themes: [])
		#expect(single?.sentence == "持ち株のトヨタ自動車が、このイベントのテーマに入っています")
		#expect(names(single) == ["トヨタ自動車"])
		let many = detail(themeEvent(10), holdings: [1, 2], themes: [])
		#expect(many?.sentence == "持ち株のうち2銘柄が、このイベントのテーマに入っています")
		#expect(names(many) == ["レーザーテック", "東京エレクトロン"])
	}

	@Test("テーマに属する持ち株が無ければ、名前があるときだけテーマのイベントだと言う")
	func detailThemeWithoutHoldings() {
		#expect(
			detail(themeEvent(10), holdings: [3])
				== .init(sentence: "「半導体」のテーマのイベントです", stocks: []))
		#expect(detail(themeEvent(10), holdings: [3], themes: []) == nil)
	}

	@Test("銘柄イベントは、その銘柄を持ち株として言う。銘柄が無ければ何も出さない")
	func detailStock() {
		let result = detail(stockEvent(1), holdings: [1])
		#expect(result?.sentence == "持ち株のレーザーテックのイベントです")
		#expect(names(result) == ["レーザーテック"])
		#expect(detail(stockEvent(99), holdings: [99]) == nil)
	}
}
