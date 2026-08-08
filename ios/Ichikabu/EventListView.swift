import IchikabuAPI
import SwiftUI

/// イベント一覧。疎通の確認のための足場で、Issue #8 で月グリッドに置き換わる
struct EventListView: View {
	let token: String
	/// 401 が返ったときに呼ぶ
	let onUnauthorized: () -> Void

	@State private var events: [Event] = []
	@State private var message: String?

	var body: some View {
		NavigationStack {
			List(events, id: \.id) { event in
				Text(event.title)
			}
			.navigationTitle("イベント")
			.overlay {
				if let message {
					Text(message).foregroundStyle(.secondary)
				}
			}
		}
		.task {
			await load()
		}
	}

	private func load() async {
		do {
			events = try await APIClient().events(token: token)
		} catch APIError.unauthorized {
			onUnauthorized()
		} catch {
			message = "イベントを取得できませんでした"
		}
	}
}
