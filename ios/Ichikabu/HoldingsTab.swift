import IchikabuAPI
import SwiftUI

/// 持ち株のタブ。持っている銘柄だけを並べ、押すと銘柄の画面へ進む。
/// 選び直しは右上の「編集」から開く
struct HoldingsTab: View {
	@Environment(AppData.self) private var data
	@State private var isPicking = false
	/// 「これから」の基準の日。`StockView` と同じく、作ったときに1回だけ取る
	@State private var today = Date()

	var body: some View {
		// 持ち株のIDが、もう無い銘柄だけを指していても、並べるものは0件として扱う
		let held = data.stocks.filter { data.holdings.contains($0.id) }
		@Bindable var data = data

		NavigationStack {
			content(held: held)
				.navigationTitle("持ち株")
				.toolbar {
					// 銘柄を受け取れていない間は、選ぶ画面も空になるので出さない
					if !data.stocks.isEmpty {
						ToolbarItem(placement: .topBarTrailing) {
							Button("編集") { isPicking = true }
						}
					}
				}
		}
		.sheet(isPresented: $isPicking) {
			HoldingsPicker(stocks: data.stocks, holdings: $data.holdings)
		}
	}

	@ViewBuilder
	private func content(held: [Stock]) -> some View {
		if data.failed {
			LoadFailureView()
		} else if held.isEmpty {
			if data.loaded {
				ContentUnavailableView {
					Label("持ち株が未選択です", systemImage: "list.bullet")
				} description: {
					Text("持ち株を選ぶと、関係するイベントがカレンダーに出ます。")
				} actions: {
					Button("持ち株を選ぶ") { isPicking = true }
						.buttonStyle(.prominent)
				}
			} else {
				// 受け取る前は件数が分からないので、未選択と言い切らない
				ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
			}
		} else {
			List {
				ForEach(held, id: \.id) { stock in
					NavigationLink {
						StockView(stock: stock)
					} label: {
						row(for: stock)
					}
				}
				Text("市場全体のイベントはカレンダーに出ます")
					.font(.captionRegular)
					.foregroundStyle(.secondary)
			}
			.listStyle(.plain)
		}
	}

	private func row(for stock: Stock) -> some View {
		VStack(alignment: .leading, spacing: Space.s4) {
			Text(stock.name)
			Text("\(stock.market.rawValue) \(stock.ticker)")
				.font(.captionRegular)
				.foregroundStyle(.secondary)
			if let next = EventLayout.nextEventText(for: stock, events: data.events, today: today) {
				Text(next)
			} else {
				Text("予定はありません").foregroundStyle(.secondary)
			}
		}
	}
}
