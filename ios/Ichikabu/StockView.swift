import IchikabuAPI
import SwiftUI

/// 銘柄の画面。その銘柄に関係するこれから来るイベントと、入っているテーマを、この順に出す。
/// 半分の高さのシートでもイベントが見えるよう、イベントを先に置く。
/// イベントの詳細の銘柄の行から進む
struct StockView: View {
	let stock: Stock
	@Environment(AppData.self) private var data

	/// 「これから」の基準の日。`CalendarView` の `today` と同じく、作ったときに1回だけ取る
	@State private var today = Date()

	var body: some View {
		let upcoming = EventLayout.upcoming(for: stock, events: data.events, today: today)
		// 名前を引けないテーマ（まだ届いていないテーマ一覧）は出さない
		let themes = stock.themeIds.compactMap { id in data.themes.first { $0.id == id } }

		List {
			Section {
				VStack(alignment: .leading, spacing: Space.s6) {
					Text(stock.name).font(.title3Regular).accessibilityAddTraits(.isHeader)
					Text("\(stock.market.rawValue) \(stock.ticker)")
						.font(.captionRegular)
						.foregroundStyle(.secondary)
					holdingControl
				}
			}
			Section("これから来るイベント") {
				if upcoming.isEmpty {
					Text("これから来るイベントはありません").foregroundStyle(.secondary)
				} else {
					ForEach(upcoming, id: \.id) { event in
						UpcomingEventLink(event: event, today: today)
					}
				}
				Text("市場全体のイベントはカレンダーに出ます")
					.font(.captionRegular)
					.foregroundStyle(.secondary)
			}
			if !themes.isEmpty {
				Section("入っているテーマ") {
					ForEach(themes, id: \.id) { theme in
						NavigationLink(theme.name) { ThemeView(theme: theme) }
					}
				}
			}
		}
		.listStyle(.plain)
		.navigationBarTitleDisplayMode(.inline)
	}

	/// 持っていない銘柄にだけ「持ち株に追加」を出す。持っているときは文字で知らせるだけで、外すボタンは置かない
	/// （外すのは持ち株のタブの「選び直す」）。押すと `data.holdings` に足し、保存は `AppData` が行う
	@ViewBuilder
	private var holdingControl: some View {
		if data.holdings.contains(stock.id) {
			Text("持ち株です").font(.captionRegular).foregroundStyle(.secondary)
		} else {
			Button("持ち株に追加") { data.holdings.append(stock.id) }
				.buttonStyle(.prominent)
			Text("追加すると、この銘柄に関係するイベントがカレンダーに出ます")
				.font(.captionRegular)
				.foregroundStyle(.secondary)
		}
	}
}
