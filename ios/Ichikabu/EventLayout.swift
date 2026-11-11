import Foundation
import IchikabuAPI
import SwiftUI

/// 月グリッドの日付計算と、イベントの割り当て・絞り込み。
/// 画面から切り離してテストできるように、状態を持たない関数だけを置く
enum EventLayout {
	/// 日付の計算はすべてJST・グレゴリオ暦・日曜始まりで行う。
	/// 端末のタイムゾーンや暦の設定でセルの日付がずれてはならない
	static let calendar: Calendar = {
		var calendar = Calendar(identifier: .gregorian)
		if let jst = TimeZone(identifier: "Asia/Tokyo") {
			calendar.timeZone = jst
		}
		calendar.firstWeekday = 1  // 日曜
		return calendar
	}()

	/// イベントの `startDate` と突き合わせるための日付キー（`2026-08-04`）。
	/// `DateFormatter` を使わないのは、`Sendable` ではなく static に持てないため
	static func key(for date: Date) -> String {
		let components = calendar.dateComponents([.year, .month, .day], from: date)
		guard let year = components.year, let month = components.month, let day = components.day
		else {
			return ""
		}
		return String(format: "%04d-%02d-%02d", year, month, day)
	}

	/// 詳細に出す日付と時刻（`9月16日 (水) 22:30:00`。期間なら `9月16日 (水) 〜 9月18日 (金)`）。
	/// 今日と違う年の日付には年を付ける（`2027年3月29日 (月)`）。付けないと、来年の日付が過ぎた日に読める。
	/// 期間は始まりと終わりのそれぞれで決める。日付が読めないときは、その文字列をそのまま出す
	static func whenText(startDate: String, endDate: String?, time: String?, today: Date) -> String {
		let thisYear = calendar.component(.year, from: today)
		var text = dayText(startDate, thisYear: thisYear)
		if let endDate, endDate != startDate {
			text += " 〜 \(dayText(endDate, thisYear: thisYear))"
		}
		if let time { text += " \(time)" }
		return text
	}

	/// `2026-09-16` を `9月16日 (水)` にする（`thisYear` と違う年なら `2027年3月29日 (月)`）。
	/// 読めなければそのまま返す
	private static func dayText(_ key: String, thisYear: Int) -> String {
		let parts = key.split(separator: "-").compactMap { Int($0) }
		guard parts.count == 3,
			let date = calendar.date(
				from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
		else { return key }
		let text = dayTitle(for: date)
		return parts[0] == thisYear ? text : "\(parts[0])年\(text)"
	}

	/// グリッド上部に出す月の表題（`2026年9月`）
	static func title(for monthStart: Date) -> String {
		let components = calendar.dateComponents([.year, .month], from: monthStart)
		guard let year = components.year, let month = components.month else { return "" }
		return "\(year)年\(month)月"
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
	/// どの月も同じ高さになる
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
	/// 単日（`endDate` が nil）は `startDate` に縮退させ、期間と同じ式で扱う
	static func events(on key: String, from events: [Event]) -> [Event] {
		events.filter { $0.startDate <= key && ($0.endDate ?? $0.startDate) >= key }
	}

	/// グリッド上部に出す月サマリ。その月に**重なる**イベントを数える。
	/// 期間イベントはセルには各日出るが、出来事としては1件なので月ごとに1しか数えない
	static func summary(forMonthOf monthStart: Date, from events: [Event]) -> (
		total: Int, importantCount: Int
	) {
		let first = key(for: monthStart)
		guard
			let lastDay = calendar.date(byAdding: DateComponents(month: 1, day: -1), to: monthStart)
		else {
			return (0, 0)
		}
		let last = key(for: lastDay)
		// 日についての条件（events(on:from:)）を月の幅に広げただけの式
		let inMonth = events.filter { $0.startDate <= last && ($0.endDate ?? $0.startDate) >= first }
		return (inMonth.count, inMonth.filter { $0.importance == 3 }.count)
	}

	/// 持ち株に出すイベントだけに絞る。**絞るのはここだけ**で、サーバーは全件返す。判定は4条件
	/// （`GLOBAL` は全員・持ち株の市場・持ち株そのもの・持ち株が属するテーマ）。
	///
	/// `stocks` が要るのは、市場とテーマが持ち株のIDだけでは引けないため。
	/// 銘柄一覧が取れていなければ市場イベントもテーマイベントも判定できないので、
	/// `GLOBAL` と持ち株のイベントだけが残る
	static func visible(_ events: [Event], holdings: [Int], stocks: [Stock]) -> [Event] {
		let held = stocks.filter { holdings.contains($0.id) }
		// `Stock.market`（JP・US）と `EventMarket`（JP・US・GLOBAL）は値の集合が違うので
		// 別の型になる。文字列に直して比べるのはここだけ
		let markets = Set(held.map(\.market.rawValue))
		let themeIds = Set(held.flatMap(\.themeIds))
		return events.filter { event in
			switch event.target {
			case .market(let target):
				target.market == .GLOBAL || markets.contains(target.market.rawValue)
			case .theme(let target):
				themeIds.contains(target.themeId)
			case .stock(let target):
				holdings.contains(target.stockId)
			}
		}
	}

	/// 詳細に出す、関係の理由の文と、関係する持ち株
	struct RelationDetail: Equatable {
		let sentence: String
		let stocks: [Stock]
		/// 持ち株に関係するか。画面の見出しを選ぶ。
		/// 持っていない銘柄のイベントや、持ち株が1つも入っていないテーマのイベントでは false
		let isHeld: Bool
	}

	/// 持ち株のうち、そのテーマに属する銘柄。`stocks` の並びのまま
	private static func heldStocks(inTheme themeId: Int, holdings: [Int], stocks: [Stock]) -> [Stock] {
		stocks.filter { holdings.contains($0.id) && $0.themeIds.contains(themeId) }
	}

	/// シートの行に出す、どの持ち株に関係するかの短い手がかり。出すものが無ければ nil
	static func relationHint(of event: Event, holdings: [Int], stocks: [Stock]) -> String? {
		switch event.target {
		case .market(let target):
			switch target.market {
			case .JP: return "日本株の持ち株"
			case .US: return "米国株の持ち株"
			case .GLOBAL: return "すべての持ち株"
			}
		case .theme(let target):
			let held = heldStocks(inTheme: target.themeId, holdings: holdings, stocks: stocks)
			guard let first = held.first else { return nil }
			return held.count == 1 ? first.name : "\(first.name) ほか\(held.count - 1)銘柄"
		case .stock(let target):
			return stocks.first(where: { $0.id == target.stockId })?.name
		}
	}

	/// 詳細に出す、関係の理由の文と関係する持ち株。出すものが無ければ nil。
	///
	/// テーマの名前が `themes` に無いことがある。CDN は経路ごとに別々に古い写しを返すので、
	/// `Stock.themeIds` の番号が、まだ届いていないテーマ一覧に無いことがあるため。
	/// そのときは名前を省いた文にして、持ち株だけを出す
	static func relationDetail(
		of event: Event, holdings: [Int], stocks: [Stock], themes: [Theme]
	) -> RelationDetail? {
		switch event.target {
		case .market(let target):
			let market: String
			switch target.market {
			case .GLOBAL:
				return RelationDetail(sentence: "持ち株にかかわらず、全員に関係します", stocks: [], isHeld: true)
			case .JP:
				market = "日本株"
			case .US:
				market = "米国株"
			}
			let held = stocks.filter {
				holdings.contains($0.id) && $0.market.rawValue == target.market.rawValue
			}
			return RelationDetail(sentence: "\(market)を持つ人全員に関係します", stocks: held, isHeld: true)
		case .theme(let target):
			let held = heldStocks(inTheme: target.themeId, holdings: holdings, stocks: stocks)
			let themeName = themes.first(where: { $0.id == target.themeId })?.name
			guard let first = held.first else {
				return themeName.map { RelationDetail(sentence: "「\($0)」のテーマのイベントです", stocks: [], isHeld: false) }
			}
			let subject = held.count == 1 ? "持ち株の\(first.name)が" : "持ち株のうち\(held.count)銘柄が"
			let theme = themeName.map { "「\($0)」のテーマに" } ?? "、このイベントのテーマに"
			return RelationDetail(sentence: "\(subject)\(theme)入っています", stocks: held, isHeld: true)
		case .stock(let target):
			guard let stock = stocks.first(where: { $0.id == target.stockId }) else { return nil }
			// 持っていない銘柄を「持ち株の」と言わない（銘柄の画面は持っていない銘柄でも開ける）
			let isHeld = holdings.contains(stock.id)
			let sentence = isHeld ? "持ち株の\(stock.name)のイベントです" : "\(stock.name)のイベントです"
			return RelationDetail(sentence: sentence, stocks: [stock], isHeld: isHeld)
		}
	}

	/// その銘柄に関係する、これから来るイベント。日付の早い順。
	///
	/// 入れるのは、その銘柄のイベントと、その銘柄が入っているテーマのイベント。
	/// 市場のイベントは入れない。どの銘柄にも同じものが並び、その銘柄のイベントが埋もれるため。
	/// 市場のイベントはカレンダーで見られる。
	/// 「これから」は、終わる日（期間でなければ始まる日）が今日以降。今日のイベントも入る。
	/// 並べ替えはしない。サーバーが日付・時刻・IDの順で返す（openapi.yaml の `/api/events`）ので、
	/// 渡された並びを保つ
	static func upcoming(for stock: Stock, events: [Event], today: Date) -> [Event] {
		let todayKey = key(for: today)
		return events.filter { event in
			guard isUpcoming(event, todayKey: todayKey) else { return false }
			switch event.target {
			case .stock(let target): return target.stockId == stock.id
			case .theme(let target): return stock.themeIds.contains(target.themeId)
			case .market: return false
			}
		}
	}

	/// そのテーマを対象にした、これから来るイベント。「これから」の決め方は `upcoming(for:)` と同じ。
	/// 並べ替えはしない。渡された並び（サーバーが返す日付・時刻・IDの順）を保つ
	static func upcoming(forTheme theme: Theme, events: [Event], today: Date) -> [Event] {
		let todayKey = key(for: today)
		return events.filter { event in
			guard isUpcoming(event, todayKey: todayKey) else { return false }
			if case .theme(let target) = event.target { return target.themeId == theme.id }
			return false
		}
	}

	/// 終わる日（期間でなければ始まる日）が今日以降か。日付キーはゼロ埋めなので文字列の大小で比べられる
	private static func isUpcoming(_ event: Event, todayKey: String) -> Bool {
		(event.endDate ?? event.startDate) >= todayKey
	}

	/// そのテーマに属する銘柄。持っているかどうかは問わない。
	/// 並びは `stocks` のまま。人気や保有で並べ替えない（docs/reference/product.md「投資助言との境界」）
	static func stocks(in theme: Theme, from stocks: [Stock]) -> [Stock] {
		stocks.filter { $0.themeIds.contains(theme.id) }
	}

	/// テーマのタブの行に出す補足（`3銘柄`・`3銘柄・持ち株あり`・`銘柄なし`）。
	/// 持ち株の数は出さない。「◯件中△件を保有」の言い方は、人気や順位の印象を生むため
	static func themeSummary(for theme: Theme, stocks: [Stock], holdings: [Int]) -> String {
		let members = Self.stocks(in: theme, from: stocks)
		guard !members.isEmpty else { return "銘柄なし" }
		let count = "\(members.count)銘柄"
		return members.contains { holdings.contains($0.id) } ? "\(count)・持ち株あり" : count
	}

	/// 持ち株のタブの行に出す、次に来るイベント（`9月20日 (日) 決算`）。無ければ nil。
	/// 時刻は行に出さない。日付と名称で足りる
	static func nextEventText(for stock: Stock, events: [Event], today: Date) -> String? {
		guard let next = upcoming(for: stock, events: events, today: today).first else { return nil }
		let when = whenText(startDate: next.startDate, endDate: next.endDate, time: nil, today: today)
		return "\(when) \(next.title)"
	}

	/// シートの見出し（`8月4日 (火)`）
	static func dayTitle(for date: Date) -> String {
		let components = calendar.dateComponents([.month, .day, .weekday], from: date)
		guard let month = components.month, let day = components.day,
			let weekday = components.weekday
		else {
			return ""
		}
		return "\(month)月\(day)日 (\(weekdayNames[weekday - 1]))"
	}

	/// 曜日名。並びは日曜始まり固定。
	/// `dayTitle` は `.weekday` 成分（暦の設定によらず日曜=1）で引くので常に正しいが、
	/// 曜日ヘッダは並び順をそのまま使うため `calendar.firstWeekday` が1であることに依存する
	static let weekdayNames = ["日", "月", "火", "水", "木", "金", "土"]

	/// 種別ごとの色。色に重要度を持たせない（重要度は★3の赤線と太字で示す）。
	/// 1つの色に2つの意味を持たせると、どちらも読めなくなるため。
	/// 琥珀・藍は SwiftUI 標準に無いため、3色とも明示的に定義して彩度・明度を揃える
	static func color(for kind: Event.kindPayload) -> Color {
		switch kind {
		case .stock: Color(red: 0.72, green: 0.47, blue: 0.05)  // 琥珀
		case .market: Color(red: 0.15, green: 0.28, blue: 0.60)  // 藍
		case .theme: Color(red: 0.45, green: 0.22, blue: 0.62)  // 紫
		}
	}
}
