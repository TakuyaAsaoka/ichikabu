import IchikabuAPI
import SwiftUI

/// 骨組みの画面。契約（openapi.yaml）から生成された型を参照することで、
/// ビルドプラグインの配線が効いていることを確かめる（Issue #4）。
/// 実際の画面は Issue #5 以降で作る。
struct ContentView: View {
	private let health = Health(status: .ok)

	var body: some View {
		Text(health.status.rawValue)
	}
}

#Preview {
	ContentView()
}
