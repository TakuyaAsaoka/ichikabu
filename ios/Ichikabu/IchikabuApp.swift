import SwiftUI

@main
struct IchikabuApp: App {
	/// トークンの有無で画面を出し分ける。リフレッシュ機構は作らない（全体設計書 §7）
	@State private var token: String? = TokenStore.load()

	var body: some Scene {
		WindowGroup {
			if let token {
				CalendarView(token: token, onUnauthorized: signOut)
			} else {
				SignInView(onSignedIn: signIn)
			}
		}
	}

	private func signIn(_ token: String) {
		TokenStore.save(token)
		self.token = token
	}

	private func signOut() {
		TokenStore.delete()
		token = nil
	}
}
