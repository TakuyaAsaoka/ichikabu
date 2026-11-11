import IchikabuAPI
import SwiftUI

/// テーマの画面。そのテーマを対象にしたこれから来るイベントと、属する銘柄を、この順に出す。
/// 銘柄は登録していないものも全部出す。テーマから、同じイベントで動く銘柄を見つけられるようにするため。
///
/// 全員に同じ内容を、事実の言い方で出す（docs/reference/product.md「投資助言との境界」）。
/// 並びはサーバーが返す並びのままにし、人気・保有・件数で並べ替えない。
/// 並びに意味を持たせると、順位やおすすめに見えるため。「持ち株」「気になる」の印は、登録の事実を示すだけ
struct ThemeView: View {
	let theme: Theme
	@Environment(AppData.self) private var data

	/// 「これから」の基準の日。`StockView` と同じく、作ったときに1回だけ取る
	@State private var today = Date()

	var body: some View {
		let upcoming = EventLayout.upcoming(forTheme: theme, events: data.events, today: today)
		let members = EventLayout.stocks(in: theme, from: data.stocks)

		List {
			Section {
				Text(theme.name).font(.title3Regular).accessibilityAddTraits(.isHeader)
			}
			Section("これから来るイベント") {
				if upcoming.isEmpty {
					Text("これから来るイベントはありません").foregroundStyle(.secondary)
				} else {
					ForEach(upcoming, id: \.id) { event in
						UpcomingEventLink(event: event, today: today)
					}
				}
			}
			Section("このテーマの銘柄") {
				if members.isEmpty {
					Text("このテーマの銘柄はありません").foregroundStyle(.secondary)
				} else {
					ForEach(members, id: \.id) { stock in
						NavigationLink {
							StockView(stock: stock)
						} label: {
							row(for: stock)
						}
					}
				}
			}
		}
		.listStyle(.plain)
		.navigationBarTitleDisplayMode(.inline)
	}

	private func row(for stock: Stock) -> some View {
		VStack(alignment: .leading, spacing: Space.s2) {
			StockLabel(stock: stock)
			// 色だけで示さず、文字で出す
			if let registration = data.registration(of: stock.id) {
				Text(registration.label).font(.captionRegular).foregroundStyle(.secondary)
			}
		}
		.accessibilityElement(children: .combine)
	}
}
