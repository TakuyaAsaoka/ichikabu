import SwiftUI

// 文字・積み重ねの間・角丸・ボタンの種類の置き場（#206）。
// 画面のファイルでは次を直に書かず、ここの名前から選ぶ。`ThemeTests` が違反を赤にする。
//
// | 直に書かないもの | 代わりに使うもの |
// |---|---|
// | `.font(.caption)`・`.font(Font.caption)` などの OS の文字の型・`.font(.system(size:))` | `Font` の名前（`.captionRegular` など） |
// | `spacing:` の数字 | `Space` の段 |
// | `cornerRadius:` の数字・`.cornerRadius(` | 角丸の段（使う所がまだ無いので置いていない。初めて使うときに `Radius` を足す） |
// | `.buttonStyle(.plain)`・`.buttonStyle(.glass)` など、下の2つ以外のボタンの形式 | `.prominent`・`.bare` |
//
// - 間を空けない `spacing: 0` は数字のまま書く。`.none` という名前にすると
//   `spacing: .none` が nil になり、OS の既定の間に変わる
// - `.padding` と `.frame` の数字は対象の外
// - 名前を足すのは使う所ができてから。使う所ごとの役割の名前（`Space.cardTitleGap` など）にはしない。
//   役割で分けると、そろえる相手の無い名前ばかり増える（novel-work-matching-system #524）
// - `Font` の名前で太字を作るときは `.bold()` を使う。`.weight(.bold)` とは描画が違い、
//   日本語が一段太くなる（同 #522）。`.fontWeight` の修飾子は対象の外

/// 文字。前半は OS の文字の型と太さの組、後半は固定の大きさの役割。
/// `Regular` は太さを足さない（OS の型の既定の太さのまま。`headline` は既定で太い）
extension Font {
	static let headlineRegular = Font.headline
	static let captionRegular = Font.caption
	static let caption2Regular = Font.caption2

	/// カレンダーのマスのイベントの短縮ラベルと「+N」。マスの幅に収めるため OS の型より小さい
	static let cellLabel = Font.system(size: 9)
}

/// 積み重ねの間（`spacing:`）の段。名前は値そのもの（手本の novel-work-matching-system と同じ）
enum Space {
	static let s1: CGFloat = 1
	static let s2: CGFloat = 2
	static let s4: CGFloat = 4
	static let s6: CGFloat = 6
}

/// いちばん押してほしい操作の、塗ったボタン
struct ProminentButtonStyle: PrimitiveButtonStyle {
	/// 塗りの色。既定の青 #007AFF と白の文字の明るさの差は 4.02、
	/// 暗い表示の #0A84FF では 3.65 で、文字の目安 4.5 を割る。#0062CC は 5.8
	private static let tint = Color(red: 0, green: 0x62 / 255, blue: 0xCC / 255)

	func makeBody(configuration: Configuration) -> some View {
		Button(configuration)
			.buttonStyle(.borderedProminent)
			.tint(Self.tint)
			.fontWeight(.semibold)
	}
}

extension PrimitiveButtonStyle where Self == ProminentButtonStyle {
	static var prominent: ProminentButtonStyle { .init() }
}

extension PrimitiveButtonStyle where Self == PlainButtonStyle {
	/// 中身の見た目のまま押せるボタン（カレンダーのマス・持ち株の行）
	static var bare: PlainButtonStyle { .plain }
}
