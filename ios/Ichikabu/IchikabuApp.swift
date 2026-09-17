import SwiftUI

@main
struct IchikabuApp: App {
	var body: some Scene {
		WindowGroup {
			// ログインは無い。持ち株は端末に持ち、絞り込みも端末で行う（Issue #88）
			CalendarView()
		}
	}
}
