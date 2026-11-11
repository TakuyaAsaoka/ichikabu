import IchikabuAPI
import SwiftUI

/// 銘柄を選ぶ画面。登録されている銘柄を全件並べ、行ごとに「なし・持ち株・気になる」を選ぶ。
/// 検索は付けない。銘柄は手入力で増える範囲にとどまるため
struct StockPicker: View {
	let stocks: [Stock]

	@Environment(\.dismiss) private var dismiss

	var body: some View {
		NavigationStack {
			List(stocks, id: \.id) { stock in
				// 選んだ銘柄のイベントが段階2ではまだ出ないことがあるため
				// （Issue #87 の検証時の罠）、選べたことは行の選択欄で示す
				HStack {
					StockLabel(stock: stock)
					Spacer()
					// 銘柄名は左の StockLabel が出すので、欄の題は隠す。読み上げ名には銘柄名を入れる
					RegistrationPicker(stock: stock, title: "\(stock.name)の登録")
						.pickerStyle(.menu)
						.labelsHidden()
				}
			}
			.listStyle(.plain)
			.overlay {
				if stocks.isEmpty {
					// 空になるのは「1件も登録が無い」ときと「取得に失敗した」ときの両方。
					// 前者だと言い切らない文言にする
					Text("銘柄を取得できていません").foregroundStyle(.secondary)
				}
			}
			.navigationTitle("銘柄を選ぶ")
			.navigationBarTitleDisplayMode(.inline)
			.toolbar {
				// 選ぶと選んだ時点で保存されるので、閉じるだけの「完了」でよい。
				// 引き下げて閉じる操作は画面に書いていないので、気づけない人がいる（#194）
				ToolbarItem(placement: .confirmationAction) {
					Button("完了") { dismiss() }
				}
			}
		}
	}
}
