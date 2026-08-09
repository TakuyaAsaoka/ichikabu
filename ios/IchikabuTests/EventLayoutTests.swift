import Foundation
import IchikabuAPI
import SwiftUI
import Testing

@testable import Ichikabu

@Suite("月グリッドの日付計算とイベントの割り当て")
struct EventLayoutTests {
	/// テスト用のイベントを1件作る。日付以外は表示に影響しないので固定値でよい
	private func event(
		id: Int,
		startDate: String,
		endDate: String? = nil,
		kind: Event.kindPayload = .stock,
		importance: Int = 1
	) -> Event {
		Event(
			id: id,
			kind: kind,
			title: "テスト",
			shortLabel: "テスト",
			startDate: startDate,
			endDate: endDate,
			time: nil,
			importance: importance,
			note: nil
		)
	}

	/// JST の指定日の正午を作る。正午にするのは、
	/// タイムゾーンが多少ずれても日付が変わらないようにするため
	private func jstNoon(_ key: String) -> Date {
		let formatter = DateFormatter()
		formatter.calendar = EventLayout.calendar
		formatter.timeZone = EventLayout.calendar.timeZone
		formatter.locale = Locale(identifier: "en_US_POSIX")
		formatter.dateFormat = "yyyy-MM-dd HH:mm"
		guard let date = formatter.date(from: "\(key) 12:00") else {
			fatalError("テスト用の日付を作れない: \(key)")
		}
		return date
	}

	@Test("単日のイベントはその日だけに出る")
	func singleDay() {
		let events = [event(id: 1, startDate: "2026-08-04")]
		#expect(EventLayout.events(on: "2026-08-04", from: events).count == 1)
		#expect(EventLayout.events(on: "2026-08-03", from: events).isEmpty)
		#expect(EventLayout.events(on: "2026-08-05", from: events).isEmpty)
	}

	@Test("期間のイベントは開始日から終了日までの各日に出る")
	func period() {
		let events = [event(id: 1, startDate: "2026-09-16", endDate: "2026-09-17")]
		#expect(EventLayout.events(on: "2026-09-15", from: events).isEmpty)
		#expect(EventLayout.events(on: "2026-09-16", from: events).count == 1)
		#expect(EventLayout.events(on: "2026-09-17", from: events).count == 1)
		#expect(EventLayout.events(on: "2026-09-18", from: events).isEmpty)
	}

	@Test("月をまたぐ期間は両方の月に出る")
	func acrossMonths() {
		let events = [event(id: 1, startDate: "2026-08-31", endDate: "2026-09-01")]
		#expect(EventLayout.events(on: "2026-08-31", from: events).count == 1)
		#expect(EventLayout.events(on: "2026-09-01", from: events).count == 1)
	}

	@Test("その日のイベントは渡された並び順のまま返る")
	func keepsOrder() {
		let events = [
			event(id: 10, startDate: "2026-08-04"),
			event(id: 20, startDate: "2026-08-04"),
			event(id: 30, startDate: "2026-08-04"),
		]
		#expect(EventLayout.events(on: "2026-08-04", from: events).map(\.id) == [10, 20, 30])
	}

	@Test("種別ごとに違う色になる")
	func colorsDiffer() {
		let colors = Event.kindPayload.allCases.map(EventLayout.color(for:))
		#expect(Set(colors).count == Event.kindPayload.allCases.count)
	}

	@Test("週の配列は常に6週42日になる")
	func alwaysSixWeeks() {
		// 2026年2月は28日ちょうどで日曜始まり。最も短くなる月でも6週にする
		for key in ["2026-02-01", "2026-08-01", "2026-09-01"] {
			let weeks = EventLayout.weeks(inMonthOf: jstNoon(key))
			#expect(weeks.count == 6)
			#expect(weeks.allSatisfy { $0.count == 7 })
		}
	}

	@Test("グリッドの先頭は月初の直前の日曜になる")
	func startsOnSunday() {
		// 2026年9月1日は火曜。日曜始まりなので8月30日から始まる
		let weeks = EventLayout.weeks(inMonthOf: jstNoon("2026-09-01"))
		#expect(EventLayout.key(for: weeks[0][0]) == "2026-08-30")
		#expect(EventLayout.key(for: weeks[0][2]) == "2026-09-01")
	}

	@Test("月のオフセットで前後の月に移動できる")
	func monthOffset() {
		let base = jstNoon("2026-08-09")
		#expect(EventLayout.key(for: EventLayout.month(offset: 0, from: base)) == "2026-08-01")
		#expect(EventLayout.key(for: EventLayout.month(offset: 1, from: base)) == "2026-09-01")
		#expect(EventLayout.key(for: EventLayout.month(offset: -1, from: base)) == "2026-07-01")
		#expect(EventLayout.key(for: EventLayout.month(offset: 12, from: base)) == "2027-08-01")
	}

	@Test("月サマリはその月に重なるイベントを数える")
	func summaryCountsOverlapping() {
		let events = [
			event(id: 1, startDate: "2026-07-31"),
			event(id: 2, startDate: "2026-08-01"),
			event(id: 3, startDate: "2026-08-31"),
			event(id: 4, startDate: "2026-09-01"),
		]
		let summary = EventLayout.summary(forMonthOf: jstNoon("2026-08-01"), from: events)
		#expect(summary.total == 2)
	}

	@Test("月をまたぐ期間のイベントは両方の月で1件と数える")
	func summaryCountsPeriodOncePerMonth() {
		// セルには 8/31 と 9/1 の2日に出るが、出来事としては1件（設計書 §5）
		let events = [event(id: 1, startDate: "2026-08-31", endDate: "2026-09-01")]
		#expect(EventLayout.summary(forMonthOf: jstNoon("2026-08-01"), from: events).total == 1)
		#expect(EventLayout.summary(forMonthOf: jstNoon("2026-09-01"), from: events).total == 1)
	}

	@Test("月サマリは★3の件数を別に数える")
	func summaryCountsImportant() {
		let events = [
			event(id: 1, startDate: "2026-08-04", importance: 3),
			event(id: 2, startDate: "2026-08-04", importance: 2),
			event(id: 3, startDate: "2026-08-20", importance: 1),
			event(id: 4, startDate: "2026-08-20", importance: 3),
		]
		let summary = EventLayout.summary(forMonthOf: jstNoon("2026-08-01"), from: events)
		#expect(summary.total == 4)
		#expect(summary.importantCount == 2)
	}

	@Test("12月の月末は翌年にまたがずに数えられる")
	func summaryHandlesDecember() {
		// 月末を「翌月の1日の前日」で出しているため、年をまたぐ12月が境界になる
		let events = [
			event(id: 1, startDate: "2026-12-31"),
			event(id: 2, startDate: "2027-01-01"),
		]
		#expect(EventLayout.summary(forMonthOf: jstNoon("2026-12-01"), from: events).total == 1)
	}

	@Test("うるう年の2月は29日まで数えられる")
	func summaryHandlesLeapFebruary() {
		let events = [event(id: 1, startDate: "2028-02-29")]
		#expect(EventLayout.summary(forMonthOf: jstNoon("2028-02-01"), from: events).total == 1)
	}

	@Test("同じ月の中の期間イベントは1件と数える")
	func summaryCountsPeriodOnce() {
		// セルには2日に出るが、出来事としては1件（設計書 §5）
		let events = [event(id: 1, startDate: "2026-09-16", endDate: "2026-09-17")]
		#expect(EventLayout.summary(forMonthOf: jstNoon("2026-09-01"), from: events).total == 1)
	}

	@Test("イベントが無い月は0件になる")
	func summaryEmptyMonth() {
		let events = [event(id: 1, startDate: "2026-08-04", importance: 3)]
		let summary = EventLayout.summary(forMonthOf: jstNoon("2026-09-01"), from: events)
		#expect(summary.total == 0)
		#expect(summary.importantCount == 0)
	}

	@Test("日付キーが端末のタイムゾーンに依存しない")
	func keyIsJST() {
		// JST 2026-08-05 00:30 は UTC では 2026-08-04 15:30。
		// 端末が UTC でもキーは JST の日付になる
		// （`TZ=UTC date -r 1785857400` と `TZ=Asia/Tokyo date -r 1785857400` で検算済み）
		let date = Date(timeIntervalSince1970: 1_785_857_400)
		#expect(EventLayout.key(for: date) == "2026-08-05")
	}
}
