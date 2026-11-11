import IchikabuAPI
import SwiftUI

/// 1つの銘柄の登録を「なし・持ち株・気になる」から選ぶ部品。
/// 選ぶと同時に `AppData` が端末へ保存する。選ぶ画面と銘柄の画面で同じものを使い、選択肢の言葉をここ1か所にする。
/// 見た目（メニュー・分割表示）は、使う側が `pickerStyle` で決める
struct RegistrationPicker: View {
	let stock: Stock
	/// 読み上げの名前。見た目に出ないことが多いので、どの銘柄の登録かが分かる名前を渡す
	let title: String
	@Environment(AppData.self) private var data

	var body: some View {
		Picker(
			title,
			selection: Binding(
				get: { data.registration(of: stock.id) },
				set: { data.register(stock.id, as: $0) })
		) {
			Text("なし").tag(Registration?.none)
			ForEach(Registration.allCases, id: \.self) { registration in
				Text(registration.label).tag(Registration?.some(registration))
			}
		}
	}
}
