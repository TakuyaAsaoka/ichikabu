import IchikabuAPI
import SwiftUI

/// 銘柄の見出し。「銘柄名」と、その下に「`市場 ティッカー`」を出す。
/// 右側の印（「持ち株」・「気になる」）や、下に続く行は、使う側が並べる
struct StockLabel: View {
	let stock: Stock

	var body: some View {
		VStack(alignment: .leading, spacing: Space.s2) {
			Text(stock.name)
			Text("\(stock.market.rawValue) \(stock.ticker)")
				.font(.captionRegular)
				.foregroundStyle(.secondary)
		}
	}
}
