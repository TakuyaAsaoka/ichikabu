import IchikabuAPI
import SwiftUI

/// 銘柄の画面。入っているテーマと、その銘柄に関係するこれから来るイベントを出す。
/// イベントの詳細の銘柄の行から進む
struct StockView: View {
	let stock: Stock
	@Environment(AppData.self) private var data

	/// 「これから」の基準の日。`CalendarView` の `today` と同じく、作ったときに1回だけ取る
	@State private var today = Date()

	var body: some View {
		let upcoming = EventLayout.upcoming(for: stock, events: data.events, today: today)
		// 名前を引けないテーマ（まだ届いていないテーマ一覧）は出さない
		let themeNames = stock.themeIds.compactMap { id in data.themes.first { $0.id == id }?.name }

		List {
			Section {
				VStack(alignment: .leading, spacing: Space.s6) {
					Text(stock.name).font(.title3Regular).accessibilityAddTraits(.isHeader)
					Text("\(stock.market.rawValue) \(stock.ticker)")
						.font(.captionRegular)
						.foregroundStyle(.secondary)
				}
			}
			Section("これから来るイベント") {
				if upcoming.isEmpty {
					Text("これから来るイベントはありません").foregroundStyle(.secondary)
				} else {
					ForEach(upcoming, id: \.id) { event in
						NavigationLink {
							EventDetailView(
								event: event,
								relation: EventLayout.relationDetail(
									of: event, holdings: data.holdings, stocks: data.stocks,
									themes: data.themes))
						} label: {
							row(for: event)
						}
					}
				}
				Text("市場全体のイベントはカレンダーに出ます")
					.font(.captionRegular)
					.foregroundStyle(.secondary)
			}
			if !themeNames.isEmpty {
				Section("入っているテーマ") {
					ForEach(themeNames, id: \.self) { Text($0) }
				}
			}
		}
		.listStyle(.plain)
		.navigationBarTitleDisplayMode(.inline)
	}

	private func row(for event: Event) -> some View {
		VStack(alignment: .leading, spacing: Space.s4) {
			HStack(spacing: Space.s6) {
				EventStars(importance: event.importance)
				Text(EventLayout.whenText(startDate: event.startDate, endDate: event.endDate, time: event.time))
					.font(.captionRegular)
					.foregroundStyle(.secondary)
			}
			Text(event.title)
		}
	}
}
