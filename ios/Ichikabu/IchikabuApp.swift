import SwiftUI

@main
struct IchikabuApp: App {
	var body: some Scene {
		WindowGroup {
			// ログインは無い。持ち株は端末に持ち、絞り込みも端末で行う（ログイン廃止 設計書 §1）
			CalendarView()
		}
	}
}
