import IchikabuAPI
import SwiftUI

/// 銘柄のタブ。登録した銘柄を「持ち株」と「気になる銘柄」に分けて並べ、押すと銘柄の画面へ進む。
/// 選び直しは右上の「選び直す」から開く
struct StocksTab: View {
	@Environment(AppData.self) private var data
	@State private var isPicking = false
	/// 「これから」の基準の日。`StockView` と同じく、作ったときに1回だけ取る
	@State private var today = Date()

	var body: some View {
		// 登録のIDが、もう無い銘柄だけを指していても、並べるものは0件として扱う
		let held = data.stocks.filter { data.holdings.contains($0.id) }
		let watching = data.stocks.filter { data.watching.contains($0.id) }

		NavigationStack {
			content(held: held, watching: watching)
				.navigationTitle("銘柄")
				.toolbar {
					// 登録した銘柄が0件の間は出さない。中央の「銘柄を選ぶ」と同じ画面を開くボタンが2つ並ぶため。
					// 「編集」にしないのは、iOS では一覧の削除・並べ替えを指す言葉だから
					if !held.isEmpty || !watching.isEmpty {
						ToolbarItem(placement: .topBarTrailing) {
							Button("選び直す") { isPicking = true }
								.accessibilityLabel("銘柄を選び直す")
						}
					}
				}
		}
		.sheet(isPresented: $isPicking) {
			StockPicker(stocks: data.stocks)
		}
	}

	@ViewBuilder
	private func content(held: [Stock], watching: [Stock]) -> some View {
		if data.failed {
			LoadFailureView()
		} else if !data.loaded {
			// 受け取る前は件数が分からないので、未登録とも言い切らない
			ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
		} else if data.stocks.isEmpty {
			// 選ぶ画面を開いても並べるものが無いので、ボタンは置かない
			ContentUnavailableView {
				Label("銘柄がまだありません", systemImage: "list.bullet")
			}
		} else if held.isEmpty && watching.isEmpty {
			ContentUnavailableView {
				Label("銘柄が未登録です", systemImage: "list.bullet")
			} description: {
				Text("銘柄を登録すると、関係するイベントがカレンダーに出ます。")
			} actions: {
				Button("銘柄を選ぶ") { isPicking = true }
					.buttonStyle(.prominent)
			}
		} else {
			List {
				// 中身が0件の見出しは出さない
				section(.held, stocks: held)
				section(.watching, stocks: watching)
				Text("市場全体のイベントはカレンダーに出ます")
					.font(.captionRegular)
					.foregroundStyle(.secondary)
			}
			.listStyle(.plain)
		}
	}

	@ViewBuilder
	private func section(_ registration: Registration, stocks: [Stock]) -> some View {
		if !stocks.isEmpty {
			Section(registration.sectionTitle) {
				ForEach(stocks, id: \.id) { stock in
					NavigationLink {
						StockView(stock: stock)
					} label: {
						row(for: stock)
					}
				}
			}
		}
	}

	private func row(for stock: Stock) -> some View {
		VStack(alignment: .leading, spacing: Space.s4) {
			StockLabel(stock: stock)
			if let next = EventLayout.nextEventText(for: stock, events: data.events, today: today) {
				Text(next).accessibilityLabel("次の予定、\(next)")
			} else {
				Text("予定はありません").foregroundStyle(.secondary)
			}
		}
	}
}
