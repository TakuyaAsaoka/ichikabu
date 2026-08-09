import IchikabuAPI
import SwiftUI

/// メイン画面。等高の月グリッドを横スワイプで送る（全体設計書 §10）
struct CalendarView: View {
	let token: String
	/// 401 が返ったときに呼ぶ
	let onUnauthorized: () -> Void

	@State private var events: [Event] = []
	@State private var message: String?
	/// 起動月を0として、何ヶ月ずれた月を見ているか
	@State private var monthOffset = 0

	/// ページの基準になる日。`@State` にすることで初期化が1回だけになり、
	/// 親の `body` が再評価されても（`let` と違って）値が変わらない
	@State private var today = Date()

	/// タップされた日。nil の間はシートを出さない
	@State private var selectedDay: Date?

	/// 起動月の前後12ヶ月（設計書 §2 判断5）
	private static let monthRange = -12...12

	var body: some View {
		TabView(selection: $monthOffset) {
			ForEach(Self.monthRange, id: \.self) { offset in
				MonthPage(
					monthStart: EventLayout.month(offset: offset, from: today),
					today: today,
					events: events,
					onSelect: { selectedDay = $0 }
				)
				.tag(offset)
			}
		}
		.tabViewStyle(.page(indexDisplayMode: .never))
		.overlay {
			if let message {
				Text(message).foregroundStyle(.secondary)
			}
		}
		// `.sheet(item:)` ではなく `isPresented` で出す。item だと日付が変わるたびに
		// シートを出し直すため、0.45 で開いていたシートが `.large` に広がってしまう（設計書 §3）
		.sheet(isPresented: sheetIsShown) {
			if let selectedDay {
				DaySheet(
					date: selectedDay,
					events: EventLayout.events(on: EventLayout.key(for: selectedDay), from: events)
				)
				.presentationDetents([.fraction(0.45), .large])
				// 0.45 まで下げている間は裏を操作できる。
				// これでシートを開いたまま別の日付をタップできる（全体設計書 §10.1）
				.presentationBackgroundInteraction(.enabled(upThrough: .fraction(0.45)))
			}
		}
		.task {
			await load()
		}
	}

	/// 日が選ばれていればシートを出す。閉じられたら選択も消す
	private var sheetIsShown: Binding<Bool> {
		Binding(get: { selectedDay != nil }, set: { if !$0 { selectedDay = nil } })
	}

	private func load() async {
		do {
			events = try await APIClient().events(token: token)
		} catch APIError.unauthorized {
			onUnauthorized()
		} catch {
			message = "イベントを取得できませんでした"
		}
	}
}

/// 1か月ぶんのページ。月の表題・月サマリ・曜日ヘッダ・6週×7列のグリッド
private struct MonthPage: View {
	let monthStart: Date
	let today: Date
	let events: [Event]
	let onSelect: (Date) -> Void

	var body: some View {
		let summary = EventLayout.summary(forMonthOf: monthStart, from: events)

		VStack(spacing: 4) {
			Text(EventLayout.title(for: monthStart))
				.font(.headline)

			// グリッドを読む前に「今月は荒れるか」に答える（全体設計書 §10.2）
			Text("\(summary.total)件 ・ ★3が\(summary.importantCount)件")
				.font(.caption)
				.foregroundStyle(.secondary)

			HStack(spacing: 0) {
				ForEach(EventLayout.weekdayNames, id: \.self) { name in
					Text(name)
						.font(.caption2)
						.foregroundStyle(.secondary)
						.frame(maxWidth: .infinity)
				}
			}

			// 6週を等分するので、どの月も同じ高さになる（設計書 §2 判断6）
			ForEach(Array(EventLayout.weeks(inMonthOf: monthStart).enumerated()), id: \.offset) {
				_, week in
				HStack(spacing: 0) {
					ForEach(week, id: \.self) { day in
						let isInMonth = EventLayout.calendar.isDate(
							day, equalTo: monthStart, toGranularity: .month)
						DayCell(
							day: day,
							isInMonth: isInMonth,
							isToday: EventLayout.calendar.isDate(day, inSameDayAs: today),
							events: EventLayout.events(on: EventLayout.key(for: day), from: events)
						)
						// 埋め草（月外の日）はイベントを出していないのでタップも受けない（設計書 §3）
						.onTapGesture {
							if isInMonth { onSelect(day) }
						}
					}
				}
				.frame(maxHeight: .infinity)
			}
		}
		.padding(.horizontal, 4)
		.padding(.bottom, 8)
	}
}

/// 日付タップで開くシート。その日の全件を出す。
/// セルで `+N` に省略された分も、セルには出さない正式名称と★の実数もここに出る（全体設計書 §10.2）
private struct DaySheet: View {
	let date: Date
	let events: [Event]

	var body: some View {
		NavigationStack {
			List {
				if events.isEmpty {
					Text("イベントはありません").foregroundStyle(.secondary)
				} else {
					ForEach(events, id: \.id) { event in
						row(for: event)
					}
				}
			}
			.listStyle(.plain)
			.navigationTitle(EventLayout.dayTitle(for: date))
			.navigationBarTitleDisplayMode(.inline)
		}
	}

	private func row(for event: Event) -> some View {
		VStack(alignment: .leading, spacing: 4) {
			HStack(spacing: 6) {
				// セル上は「★3か否か」の2値だが、シートでは実数を出す（全体設計書 §10.2）
				Text(String(repeating: "★", count: event.importance))
					.font(.caption)
					.foregroundStyle(.orange)
				Text(event.shortLabel)
					.font(.caption)
					.foregroundStyle(EventLayout.color(for: event.kind))
				if let time = event.time {
					Text(time).font(.caption).foregroundStyle(.secondary)
				}
			}
			Text(event.title)
			if let note = event.note {
				Text(note).font(.caption).foregroundStyle(.secondary)
			}
		}
		.padding(.vertical, 2)
	}
}

/// 1日ぶんのセル
private struct DayCell: View {
	let day: Date
	/// 表示中の月の日か。42セルの前後の埋め草は日番号だけ出す（設計書 §2 判断9）
	let isInMonth: Bool
	let isToday: Bool
	let events: [Event]

	/// セルに出すのは2件まで（全体設計書 §10.2）
	private static let visibleCount = 2

	var body: some View {
		VStack(alignment: .leading, spacing: 1) {
			dayNumber
			if isInMonth {
				ForEach(events.prefix(Self.visibleCount), id: \.id) { event in
					label(for: event)
				}
				if events.count > Self.visibleCount {
					Text("+\(events.count - Self.visibleCount)")
						.font(.system(size: 9))
						.foregroundStyle(.secondary)
				}
			}
			Spacer(minLength: 0)
		}
		.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
		.accessibilityElement(children: .combine)
	}

	private var dayNumber: some View {
		Text("\(EventLayout.calendar.component(.day, from: day))")
			.font(.caption2)
			.foregroundStyle(isInMonth ? Color.primary : Color.secondary)
			.frame(width: 16, height: 16)
			.background {
				if isToday {
					Circle().fill(Color.accentColor.opacity(0.25))
				}
			}
	}

	/// ★3のラベルだけ左端に赤の細線と太字。★1・★2に差はつけない（全体設計書 §10.2）
	private func label(for event: Event) -> some View {
		HStack(spacing: 1) {
			if event.importance == 3 {
				Rectangle().fill(Color.red).frame(width: 2)
			}
			Text(event.shortLabel)
				.font(.system(size: 9))
				.fontWeight(event.importance == 3 ? .bold : .regular)
				.foregroundStyle(EventLayout.color(for: event.kind))
				.lineLimit(1)
		}
		.frame(height: 12)
	}
}
