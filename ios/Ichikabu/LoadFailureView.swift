import SwiftUI

/// 取得に失敗したときに、カレンダーと持ち株のタブが画面の代わりに出す知らせ
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
				// 最初の取得は起動時の1回しか走らないため、押して取り直せるようにする。
				// これが無いと復旧はアプリの再起動だけになる
				Button("再試行") { Task { await data.load() } }
					.buttonStyle(.prominent)
			}
		}
	}
}
