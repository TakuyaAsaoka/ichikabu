import IchikabuAPI
import SwiftUI

/// 持ち株を選ぶ画面。登録されている銘柄を全件並べ、タップで選ぶ・外す。
/// 検索は付けない。銘柄は手入力で増える範囲にとどまるため（ログイン廃止 設計書 §6）
struct HoldingsView: View {
	let stocks: [Stock]
	/// 選んだ銘柄ID。書き込みは呼び出し側で端末に保存される
	@Binding var holdings: [Int]

	var body: some View {
		NavigationStack {
			List(stocks, id: \.id) { stock in
				// 選んだ銘柄のイベントが段階2ではまだ出ないことがあるため
				// （Issue #87 の検証時の罠）、選べたことはこの行のチェックで示す
				Button { toggle(stock.id) } label: { row(for: stock) }
					.buttonStyle(.plain)
			}
			.listStyle(.plain)
			.overlay {
				if stocks.isEmpty {
					// 空になるのは「1件も登録が無い」ときと「取得に失敗した」ときの両方。
					// 前者だと言い切らない文言にする
					Text("銘柄を取得できていません").foregroundStyle(.secondary)
				}
			}
			.navigationTitle("持ち株")
			.navigationBarTitleDisplayMode(.inline)
		}
	}

	private func row(for stock: Stock) -> some View {
		HStack {
			VStack(alignment: .leading, spacing: 2) {
				Text(stock.name)
				Text("\(stock.market.rawValue) \(stock.ticker)")
					.font(.caption)
					.foregroundStyle(.secondary)
			}
			Spacer()
			if holdings.contains(stock.id) {
				Image(systemName: "checkmark").foregroundStyle(Color.accentColor)
			}
		}
		// チェックの印は目で見る人にしか伝わらないため、選択の状態を VoiceOver にも渡す
		.accessibilityAddTraits(holdings.contains(stock.id) ? .isSelected : [])
		// これが無いと、行の余白（銘柄名の右側）を押しても反応しない
		.contentShape(Rectangle())
	}

	private func toggle(_ stockId: Int) {
		if let index = holdings.firstIndex(of: stockId) {
			holdings.remove(at: index)
		} else {
			holdings.append(stockId)
		}
	}
}
