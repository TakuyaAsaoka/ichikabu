import IchikabuAPI
import Testing

@testable import Ichikabu

@Suite("持ち株による絞り込み")
struct HoldingFilterTests {
	/// JP の銘柄。テーマ10に属する
	private let toyota = Stock(
		id: 1, market: .JP, ticker: "7203", name: "トヨタ自動車", themeIds: [10])
	/// US の銘柄。どのテーマにも属さない
	private let nvidia = Stock(
		id: 2, market: .US, ticker: "NVDA", name: "NVIDIA", themeIds: [])

	/// テスト用のイベントを1件作る。対象以外は判定に影響しないので固定値でよい。
	/// `kind` は対象から導く。契約は食い違う組み合わせも表せるため、テストでも必ず揃える
	private func event(id: String, target: Components.Schemas.EventTarget) -> Event {
		Event(
			id: id,
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

	private func stockEvent(id: String, stockId: Int) -> Event {
		event(id: id, target: .stock(.init(_type: .stock, stockId: stockId)))
	}

	private func themeEvent(id: String, themeId: Int) -> Event {
		event(id: id, target: .theme(.init(_type: .theme, themeId: themeId)))
	}

	private func marketEvent(id: String, market: Components.Schemas.EventMarket) -> Event {
		event(id: id, target: .market(.init(_type: .market, market: market)))
	}

	@Test("選んだ銘柄のイベントだけが出る")
	func selectedStockOnly() {
		let events = [stockEvent(id: "held", stockId: 1), stockEvent(id: "other", stockId: 2)]

		let visible = EventLayout.visible(events, holdings: [1], stocks: [toyota, nvidia])

		#expect(visible.map(\.id) == ["held"])
	}

	@Test("1つも選んでいなければ GLOBAL の市場イベントだけが出る")
	func nothingSelected() {
		let events = [
			marketEvent(id: "global", market: .GLOBAL),
			marketEvent(id: "jp", market: .JP),
			stockEvent(id: "stock", stockId: 1),
			themeEvent(id: "theme", themeId: 10),
		]

		let visible = EventLayout.visible(events, holdings: [], stocks: [toyota, nvidia])

		#expect(visible.map(\.id) == ["global"])
	}

	@Test("持ち株の市場の市場イベントが出る。別の市場のものは出ない")
	func marketOfHeldStock() {
		let events = [marketEvent(id: "jp", market: .JP), marketEvent(id: "us", market: .US)]

		let visible = EventLayout.visible(events, holdings: [1], stocks: [toyota, nvidia])

		#expect(visible.map(\.id) == ["jp"])
	}

	@Test("持ち株が属するテーマのイベントが出る。属さないテーマのものは出ない")
	func themeOfHeldStock() {
		let events = [themeEvent(id: "belongs", themeId: 10), themeEvent(id: "other", themeId: 11)]

		let visible = EventLayout.visible(events, holdings: [1], stocks: [toyota, nvidia])

		#expect(visible.map(\.id) == ["belongs"])
	}

	@Test("銘柄一覧が取れていなければ、市場もテーマも判定できないので出ない")
	func withoutStocks() {
		let events = [
			marketEvent(id: "global", market: .GLOBAL),
			marketEvent(id: "jp", market: .JP),
			themeEvent(id: "theme", themeId: 10),
		]

		// 取得に失敗するとイベント自体も空になるが、絞り込みだけを見ると
		// 持ち株の市場とテーマは引けない。GLOBAL は誰にでも出る
		let visible = EventLayout.visible(events, holdings: [1], stocks: [])

		#expect(visible.map(\.id) == ["global"])
	}
}
