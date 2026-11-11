import SwiftUI

/// 下のタブ。どのタブを先に開いても、最初の取得はここで1回だけ走る
struct RootTabs: View {
	@Environment(AppData.self) private var data

	var body: some View {
		TabView {
			Tab("カレンダー", systemImage: "calendar") { CalendarView() }
			Tab("持ち株", systemImage: "list.bullet") { HoldingsTab() }
			Tab("テーマ", systemImage: "tag") { ThemesTab() }
		}
		.task { await data.load() }
	}
}
