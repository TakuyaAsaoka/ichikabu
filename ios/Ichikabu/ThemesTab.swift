import IchikabuAPI
import SwiftUI

/// テーマのタブ。登録されているテーマを `data.themes` の並びのまま全部出し、押すとテーマの画面へ進む。
/// 並べ替えない（人気や保有で並べると順位に見えるため。docs/reference/product.md「投資助言との境界」）
struct ThemesTab: View {
	@Environment(AppData.self) private var data

	var body: some View {
		NavigationStack {
			content
				.navigationTitle("テーマ")
		}
	}

	@ViewBuilder
	private var content: some View {
		if data.failed {
			LoadFailureView()
		} else if !data.loaded {
			ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
		} else if data.themes.isEmpty {
			// テーマの取得だけが落ちても空になる（`AppData.load`）ので、「登録が無い」とは言い切らない
			ContentUnavailableView {
				Label("テーマを取得できていません", systemImage: "tag")
			}
		} else {
			List {
				ForEach(data.themes, id: \.id) { theme in
					NavigationLink {
						ThemeView(theme: theme)
					} label: {
						VStack(alignment: .leading, spacing: Space.s4) {
							Text(theme.name)
							Text(EventLayout.themeSummary(for: theme, stocks: data.stocks, holdings: data.holdings))
								.font(.captionRegular)
								.foregroundStyle(.secondary)
						}
					}
				}
			}
			.listStyle(.plain)
		}
	}
}
