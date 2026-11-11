import SwiftUI

/// 下のタブ。どのタブを先に開いても、最初の取得はここで1回だけ走る
struct RootTabs: View {
	@Environment(AppData.self) private var data
	@Environment(\.scenePhase) private var scenePhase

	var body: some View {
		TabView {
			Tab("カレンダー", systemImage: "calendar") { CalendarView() }
			Tab("銘柄", systemImage: "list.bullet") { StocksTab() }
			Tab("テーマ", systemImage: "tag") { ThemesTab() }
		}
		.task { await data.load() }
		// 前に戻したとき。起動中の最初の読み込みと重なっても、`activated` はまだ受け取れていなければ何もしない
		.onChange(of: scenePhase) { _, phase in
			if phase == .active { Task { await data.activated() } }
		}
		// 前に出したまま日をまたいだとき（日付が変わったときと、時計が変わったときに OS が送る）
		.onReceive(NotificationCenter.default.publisher(for: UIApplication.significantTimeChangeNotification)) { _ in
			data.refreshToday()
		}
	}
}
