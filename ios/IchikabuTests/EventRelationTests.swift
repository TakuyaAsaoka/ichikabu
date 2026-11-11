import IchikabuAPI
import Testing

@testable import Ichikabu

@Suite("イベントと登録した銘柄の関係")
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

	/// 手がかりは持ち株でも気になる銘柄でも同じ文になるので、まとめた登録を渡す
	private func hint(_ event: Event, registered: [Int]) -> String? {
		EventLayout.relationHint(of: event, registered: registered, stocks: stocks)
	}

	private func detail(
		_ event: Event, holdings: [Int] = [], watching: [Int] = [], themes: [Theme]? = nil
	) -> EventLayout.RelationDetail? {
		EventLayout.relationDetail(
			of: event, holdings: holdings, watching: watching, stocks: stocks,
			themes: themes ?? self.themes)
	}

	private func names(_ detail: EventLayout.RelationDetail?) -> [String] {
		detail?.stocks.map(\.name) ?? []
	}

	// MARK: - 一覧の行の手がかり

	@Test("市場イベントの手がかりは、市場ごとの「登録した」の言い方になる。持ち株とは言わない")
	func hintMarket() {
		#expect(hint(marketEvent(.GLOBAL), registered: []) == "登録した銘柄すべて")
		#expect(hint(marketEvent(.JP), registered: []) == "登録した日本株")
		#expect(hint(marketEvent(.US), registered: []) == "登録した米国株")
	}

	@Test("登録した銘柄が1つのテーマの手がかりは、その銘柄名")
	func hintThemeSingle() {
		#expect(hint(themeEvent(20), registered: [3]) == "トヨタ自動車")
	}

	@Test("登録した銘柄が複数のテーマの手がかりは、stocks の先頭の銘柄名と残りの数")
	func hintThemeMany() {
		#expect(hint(themeEvent(10), registered: [2, 1]) == "レーザーテック ほか1銘柄")
	}

	@Test("登録していない銘柄は、手がかりの「ほか○銘柄」の数に入らない")
	func hintNotRegistered() {
		#expect(hint(themeEvent(10), registered: [1]) == "レーザーテック")
	}

	@Test("テーマに属する登録した銘柄が無ければ手がかりは出さない")
	func hintThemeWithoutRegistered() {
		#expect(hint(themeEvent(10), registered: [3]) == nil)
	}

	@Test("銘柄イベントの手がかりは銘柄名。銘柄が無ければ出さない")
	func hintStock() {
		#expect(hint(stockEvent(1), registered: [1]) == "レーザーテック")
		#expect(hint(stockEvent(99), registered: [99]) == nil)
	}

	// MARK: - 詳細の文と銘柄

	@Test("全体の市場イベントは、登録にかかわらず全員に関係すると言い、銘柄の一覧は無い")
	func detailGlobal() {
		let result = detail(marketEvent(.GLOBAL), holdings: [1])
		#expect(result == .init(sentence: "登録した銘柄にかかわらず、全員に関係します", stocks: [], isRegistered: true))
	}

	@Test("日本・米国の市場イベントは、その市場の登録した銘柄だけを並べる。気になる銘柄も入る")
	func detailMarket() {
		let jp = detail(marketEvent(.JP), holdings: [4, 1], watching: [2])
		#expect(jp?.sentence == "日本株を登録している人全員に関係します")
		#expect(names(jp) == ["レーザーテック", "東京エレクトロン"])
		let us = detail(marketEvent(.US), holdings: [1], watching: [4])
		#expect(us?.sentence == "米国株を登録している人全員に関係します")
		#expect(names(us) == ["エヌビディア"])
	}

	@Test("テーマ・1銘柄・持ち株なら「持ち株の」と言う")
	func detailThemeSingleHeld() {
		let result = detail(themeEvent(20), holdings: [3])
		#expect(result?.sentence == "持ち株のトヨタ自動車が「自動車」のテーマに入っています")
		#expect(names(result) == ["トヨタ自動車"])
	}

	@Test("テーマ・1銘柄・気になる銘柄なら「気になる銘柄の」と言い、「持ち株の」とは言わない")
	func detailThemeSingleWatching() {
		let result = detail(themeEvent(20), watching: [3])
		#expect(result?.sentence == "気になる銘柄のトヨタ自動車が「自動車」のテーマに入っています")
		#expect(names(result) == ["トヨタ自動車"])
	}

	@Test("テーマ・複数・全部持ち株なら、数を入れて「持ち株のうち」と言う。並びは stocks のまま")
	func detailThemeManyHeld() {
		let result = detail(themeEvent(10), holdings: [2, 1])
		#expect(result?.sentence == "持ち株のうち2銘柄が「半導体」のテーマに入っています")
		#expect(names(result) == ["レーザーテック", "東京エレクトロン"])
	}

	@Test("テーマ・複数・全部気になる銘柄なら「気になる銘柄のうち」と言う")
	func detailThemeManyWatching() {
		let result = detail(themeEvent(10), watching: [2, 1])
		#expect(result?.sentence == "気になる銘柄のうち2銘柄が「半導体」のテーマに入っています")
		#expect(names(result) == ["レーザーテック", "東京エレクトロン"])
	}

	@Test("テーマ・複数・持ち株と気になる銘柄が混ざるなら「登録した銘柄のうち」と言う")
	func detailThemeManyMixed() {
		let result = detail(themeEvent(10), holdings: [2], watching: [1])
		#expect(result?.sentence == "登録した銘柄のうち2銘柄が「半導体」のテーマに入っています")
		#expect(names(result) == ["レーザーテック", "東京エレクトロン"])
	}

	@Test("登録していない銘柄は、詳細の文にも銘柄の一覧にも出ない")
	func detailNotRegistered() {
		let result = detail(themeEvent(10), holdings: [2])
		#expect(result?.sentence == "持ち株の東京エレクトロンが「半導体」のテーマに入っています")
		#expect(names(result) == ["東京エレクトロン"])
	}

	@Test("テーマの名前が分からないときは、名前を省いた文にして銘柄を出す。持ち株・気になる・混ざるの言い分けは同じ")
	func detailThemeWithoutName() {
		let single = detail(themeEvent(20), holdings: [3], themes: [])
		#expect(single?.sentence == "持ち株のトヨタ自動車が、このイベントのテーマに入っています")
		#expect(names(single) == ["トヨタ自動車"])
		let watching = detail(themeEvent(20), watching: [3], themes: [])
		#expect(watching?.sentence == "気になる銘柄のトヨタ自動車が、このイベントのテーマに入っています")
		let many = detail(themeEvent(10), holdings: [1, 2], themes: [])
		#expect(many?.sentence == "持ち株のうち2銘柄が、このイベントのテーマに入っています")
		#expect(names(many) == ["レーザーテック", "東京エレクトロン"])
		let watchingMany = detail(themeEvent(10), watching: [1, 2], themes: [])
		#expect(watchingMany?.sentence == "気になる銘柄のうち2銘柄が、このイベントのテーマに入っています")
		let mixed = detail(themeEvent(10), holdings: [1], watching: [2], themes: [])
		#expect(mixed?.sentence == "登録した銘柄のうち2銘柄が、このイベントのテーマに入っています")
	}

	@Test("テーマに属する登録した銘柄が無ければ、名前があるときだけテーマのイベントだと言う")
	func detailThemeWithoutRegistered() {
		#expect(
			detail(themeEvent(10), holdings: [3])
				== .init(sentence: "「半導体」のテーマのイベントです", stocks: [], isRegistered: false))
		#expect(detail(themeEvent(10), holdings: [3], themes: []) == nil)
	}

	@Test("銘柄イベントは、持ち株なら「持ち株の」と言う。銘柄が無ければ何も出さない")
	func detailStockHeld() {
		let result = detail(stockEvent(1), holdings: [1])
		#expect(result?.sentence == "持ち株のレーザーテックのイベントです")
		#expect(names(result) == ["レーザーテック"])
		#expect(result?.isRegistered == true)
		#expect(detail(stockEvent(99), holdings: [99]) == nil)
	}

	@Test("銘柄イベントは、気になる銘柄なら「気になる銘柄の」と言い、「持ち株の」とは言わない")
	func detailStockWatching() {
		let result = detail(stockEvent(1), watching: [1])
		#expect(result?.sentence == "気になる銘柄のレーザーテックのイベントです")
		#expect(names(result) == ["レーザーテック"])
		#expect(result?.isRegistered == true)
	}

	@Test("登録していない銘柄のイベントは、「持ち株の」とも「気になる銘柄の」とも言わず、登録との関係でもないとする")
	func detailStockNotRegistered() {
		let result = detail(stockEvent(1), holdings: [2], watching: [3])
		#expect(result?.sentence == "レーザーテックのイベントです")
		#expect(names(result) == ["レーザーテック"])
		#expect(result?.isRegistered == false)
	}

	@Test("登録した銘柄に関係するときは isRegistered が true。テーマに登録した銘柄が無いときは false")
	func detailIsRegistered() {
		#expect(detail(marketEvent(.GLOBAL))?.isRegistered == true)
		#expect(detail(marketEvent(.JP))?.isRegistered == true)
		#expect(detail(themeEvent(10), watching: [1])?.isRegistered == true)
		#expect(detail(themeEvent(10), holdings: [3])?.isRegistered == false)
	}
}
