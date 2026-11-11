import SwiftUI

/// 取得に失敗したときに、カレンダーと銘柄のタブが画面の代わりに出す知らせ
struct LoadFailureView: View {
	@Environment(AppData.self) private var data

	var body: some View {
		if data.isLoading {
			ProgressView("取得しています")
				.frame(maxWidth: .infinity, maxHeight: .infinity)
		} else {
			ContentUnavailableView {
				Label("イベントと銘柄を取得できませんでした", systemImage: "wifi.slash")
			} description: {
				Text("通信できる状態か確かめて、もう一度お試しください。")
			} actions: {
				// この画面は、まだ一度も受け取れていない間だけ出る。前に戻したときの取り直しは、
				// 受け取れたあとでないと走らないので、ここからの復旧は押して取り直すしかない。
				// これが無いと復旧はアプリの再起動だけになる
				Button("再試行") { Task { await data.load() } }
					.buttonStyle(.prominent)
			}
		}
	}
}
