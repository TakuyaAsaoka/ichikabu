import IchikabuAPI
import SwiftUI

/// 持ち株のタブ。持っている銘柄だけを並べ、押すと銘柄の画面へ進む。
/// 選び直しは右上の「選び直す」から開く
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
					// 持っている銘柄が0件の間は出さない。中央の「持ち株を選ぶ」と同じ画面を開くボタンが2つ並ぶため。
					// 「編集」にしないのは、iOS では一覧の削除・並べ替えを指す言葉だから
					if !held.isEmpty {
						ToolbarItem(placement: .topBarTrailing) {
							Button("選び直す") { isPicking = true }
								.accessibilityLabel("持ち株を選び直す")
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
		} else if !data.loaded {
			// 受け取る前は件数が分からないので、未選択とも未登録とも言い切らない
			ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
		} else if data.stocks.isEmpty {
			// 選ぶ画面を開いても並べるものが無いので、ボタンは置かない
			ContentUnavailableView {
				Label("銘柄がまだ登録されていません", systemImage: "list.bullet")
			}
		} else if held.isEmpty {
			ContentUnavailableView {
				Label("持ち株が未選択です", systemImage: "list.bullet")
			} description: {
				Text("持ち株を選ぶと、関係するイベントがカレンダーに出ます。")
			} actions: {
				Button("持ち株を選ぶ") { isPicking = true }
					.buttonStyle(.prominent)
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
				Text(next).accessibilityLabel("次の予定、\(next)")
			} else {
				Text("予定はありません").foregroundStyle(.secondary)
			}
		}
	}
}
