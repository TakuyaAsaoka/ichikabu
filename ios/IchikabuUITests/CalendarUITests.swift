import XCTest

/// サーバーの要らない状態の画面を確かめる UI テスト（Issue #194）。
///
/// 何も待ち受けていないポートにつなぎ、取得に失敗した状態で起動する。
/// 撮影用の `ScreensUITests` と違い、品質ゲートでも走る。
/// イベントのある日のシートはサーバーが要るので、ここでは見ない（撮影の写真で見る）
final class CalendarUITests: XCTestCase {
	/// 取得に失敗させるための接続先。何も待ち受けていないポート
	private static let unreachable = "http://127.0.0.1:9"

	override func setUpWithError() throws {
		continueAfterFailure = false
	}

	@MainActor
	func test_取得に失敗したら月の件数を出さない() {
		let app = launch()

		let retry = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "再試行")).firstMatch
		XCTAssertTrue(retry.waitForExistence(timeout: 30), "「再試行」が出ない")
		// 取れていないのに「0件」と出すと、事実と違う。
		// 月のページは前後12ヶ月ぶん部品の一覧に入るので、どのページにも無いことを見る
		let summaries = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "★3が"))
		XCTAssertEqual(summaries.count, 0, "取得に失敗しているのに月の件数が出ている")
	}

	@MainActor
	func test_持ち株が未選択なら持ち株を選ぶボタンから一覧を開ける() {
		let app = launch()

		let choose = app.buttons["持ち株を選ぶ"]
		XCTAssertTrue(choose.waitForExistence(timeout: 10), "「持ち株を選ぶ」が出ない")
		choose.tap()
		XCTAssertTrue(app.navigationBars["持ち株"].waitForExistence(timeout: 10), "持ち株の一覧が開かない")
	}

	@MainActor
	func test_持ち株の一覧は完了で閉じる() {
		let app = launch()

		let holdings = app.buttons["持ち株"]
		XCTAssertTrue(holdings.waitForExistence(timeout: 10), "「持ち株」が出ない")
		holdings.tap()
		let sheet = app.navigationBars["持ち株"]
		XCTAssertTrue(sheet.waitForExistence(timeout: 10), "持ち株の一覧が開かない")
		sheet.buttons["完了"].tap()
		XCTAssertTrue(sheet.waitForNonExistence(timeout: 10), "「完了」で閉じない")
	}

	/// 持ち株が未選択で、取得に失敗する状態で起動する。
	/// `-holdings ()` は UserDefaults の読み出しだけを上書きする。前の実行で選んだ持ち株は端末に残るため、毎回付ける
	@MainActor
	private func launch() -> XCUIApplication {
		let app = XCUIApplication()
		app.launchArguments += ["-holdings", "()"]
		app.launchEnvironment["ICHIKABU_API_BASE_URL"] = Self.unreachable
		app.launch()
		return app
	}
}
