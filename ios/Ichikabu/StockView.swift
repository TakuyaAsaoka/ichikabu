import IchikabuAPI
import SwiftUI

/// 銘柄の画面。その銘柄に関係するこれから来るイベントと、入っているテーマを、この順に出す。
/// 半分の高さのシートでもイベントが見えるよう、イベントを先に置く。
/// イベントの詳細の銘柄の行から進む
struct StockView: View {
	let stock: Stock
	@Environment(AppData.self) private var data

	var body: some View {
		let upcoming = EventLayout.upcoming(for: stock, events: data.events, today: data.today)
		// 名前を引けないテーマ（まだ届いていないテーマ一覧）は出さない
		let themes = stock.themeIds.compactMap { id in data.themes.first { $0.id == id } }

		List {
			Section {
				VStack(alignment: .leading, spacing: Space.s6) {
					Text(stock.name).font(.title3Regular).accessibilityAddTraits(.isHeader)
					Text("\(stock.market.rawValue) \(stock.ticker)")
						.font(.captionRegular)
						.foregroundStyle(.secondary)
					registrationControl
				}
			}
			Section("これから来るイベント") {
				if upcoming.isEmpty {
					Text("これから来るイベントはありません").foregroundStyle(.secondary)
				} else {
					ForEach(upcoming, id: \.id) { event in
						UpcomingEventLink(event: event, today: data.today)
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

	/// 登録を選ぶ。足す・切り替える・外すが、この部品1つでできる。保存は `AppData` が行う
	@ViewBuilder
	private var registrationControl: some View {
		RegistrationPicker(stock: stock, title: "登録")
			.pickerStyle(.segmented)
		// 登録しているときは、もう説明の要る状態ではない
		if data.registration(of: stock.id) == nil {
			Text("登録すると、この銘柄に関係するイベントがカレンダーに出ます")
				.font(.captionRegular)
				.foregroundStyle(.secondary)
		}
	}
}
