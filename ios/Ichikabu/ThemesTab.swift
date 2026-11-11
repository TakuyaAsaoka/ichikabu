import IchikabuAPI
import SwiftUI

/// テーマのタブ。サーバーにあるテーマを `data.themes` の並びのまま全部出し、押すとテーマの画面へ進む。
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
			// テーマの取得だけが落ちても空になる（`AppData.load`）ので、「テーマが無い」とは言い切らない。
			// 前に戻したときの取り直しは、5分たつまで走らない。待たずに押して取り直せるようにする。
			// この再試行が失敗しても、一度受け取れているので `failed` は立たず、失敗の画面には替えない
			// （カレンダーと銘柄は前の中身を出せているため）。取り直している間は読み込み中の表示を出し、
			// 終わってまだ空なら、この案内と「再試行」に戻る。それが失敗の知らせになる
			if data.isLoading {
				ProgressView("取得しています")
					.frame(maxWidth: .infinity, maxHeight: .infinity)
			} else {
				ContentUnavailableView {
					Label("テーマを取得できていません", systemImage: "tag")
				} actions: {
					Button("再試行") { Task { await data.load() } }
						.buttonStyle(.prominent)
				}
			}
		} else {
			List {
				ForEach(data.themes, id: \.id) { theme in
					NavigationLink {
						ThemeView(theme: theme)
					} label: {
						VStack(alignment: .leading, spacing: Space.s4) {
							Text(theme.name)
							Text(EventLayout.themeSummary(for: theme, stocks: data.stocks, registered: data.registered))
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
