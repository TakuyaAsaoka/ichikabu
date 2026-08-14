import Foundation
import IchikabuAPI
import SwiftUI

/// 月グリッドの日付計算と、イベントの割り当て・絞り込み。
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

	/// グリッド上部に出す月サマリ。その月に**重なる**イベントを数える。
	/// 期間イベントはセルには各日出るが、出来事としては1件なので月ごとに1しか数えない（設計書 §5）
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
		// 別の型になる。文字列に直して比べるのはここだけ（ログイン廃止 設計書 §3.1）
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

	/// シートの見出し（`8月4日（火）`）
	static func dayTitle(for date: Date) -> String {
		let components = calendar.dateComponents([.month, .day, .weekday], from: date)
		guard let month = components.month, let day = components.day,
			let weekday = components.weekday
		else {
			return ""
		}
		return "\(month)月\(day)日（\(weekdayNames[weekday - 1])）"
	}

	/// 曜日名。並びは日曜始まり固定。
	/// `dayTitle` は `.weekday` 成分（暦の設定によらず日曜=1）で引くので常に正しいが、
	/// 曜日ヘッダは並び順をそのまま使うため `calendar.firstWeekday` が1であることに依存する
	static let weekdayNames = ["日", "月", "火", "水", "木", "金", "土"]

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
