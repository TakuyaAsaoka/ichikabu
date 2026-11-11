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
	func test_取得に失敗したらカレンダーの代わりに知らせと再試行を出す() {
		let app = launch()

		XCTAssertTrue(app.buttons["再試行"].waitForExistence(timeout: 30), "「再試行」が出ない")
		XCTAssertTrue(app.staticTexts["イベントと銘柄を取得できませんでした"].exists, "取得できなかったことが出ない")
		// 取れていないのに空のマスや「0件」を出すと、予定が無い月に見える。
		// 月のページは前後12ヶ月ぶん部品の一覧に入るので、どのページにも無いことを見る。
		// 日のマスは読み上げ名が日番号で始まる押せる要素（DayCell）
		let days = app.buttons.matching(NSPredicate(format: "label MATCHES %@", "^[0-9]+.*"))
		XCTAssertEqual(days.count, 0, "取得に失敗しているのに日のマスが出ている")
		let summaries = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "★3が"))
		XCTAssertEqual(summaries.count, 0, "取得に失敗しているのに月の件数が出ている")
	}

	@MainActor
	func test_銘柄が未登録なら銘柄を選ぶボタンから一覧を開ける() {
		let app = launch()

		let choose = app.buttons["銘柄を選ぶ"]
		XCTAssertTrue(choose.waitForExistence(timeout: 10), "「銘柄を選ぶ」が出ない")
		choose.tap()
		// 題は「銘柄を選ぶ」。下のタブの名前「銘柄」と別にして、取り違えて通らないようにする
		XCTAssertTrue(app.navigationBars["銘柄を選ぶ"].waitForExistence(timeout: 10), "銘柄を選ぶ画面が開かない")
	}

	@MainActor
	func test_銘柄を選ぶ画面は完了で閉じる() {
		let app = launch()

		let choose = app.buttons["銘柄を選ぶ"]
		XCTAssertTrue(choose.waitForExistence(timeout: 10), "「銘柄を選ぶ」が出ない")
		choose.tap()
		let sheet = app.navigationBars["銘柄を選ぶ"]
		XCTAssertTrue(sheet.waitForExistence(timeout: 10), "銘柄を選ぶ画面が開かない")
		sheet.buttons["完了"].tap()
		XCTAssertTrue(sheet.waitForNonExistence(timeout: 10), "「完了」で閉じない")
	}

	@MainActor
	func test_下のタブで銘柄へ移れて取得に失敗していれば知らせと再試行が出る() {
		let app = launch()

		// カレンダーの失敗の知らせが出てから移る。移った先にも同じ知らせがあることを見るため
		XCTAssertTrue(app.buttons["再試行"].waitForExistence(timeout: 30), "カレンダーに「再試行」が出ない")
		let tab = app.tabBars.buttons["銘柄"]
		XCTAssertTrue(tab.exists, "下のタブに「銘柄」が無い")
		tab.tap()
		XCTAssertTrue(app.navigationBars["銘柄"].waitForExistence(timeout: 10), "銘柄のタブに移れない")
		XCTAssertTrue(app.staticTexts["イベントと銘柄を取得できませんでした"].waitForExistence(timeout: 10), "銘柄のタブに失敗の知らせが出ない")
		XCTAssertTrue(app.buttons["再試行"].exists, "銘柄のタブに「再試行」が出ない")
		// 登録した銘柄が無いので、「選び直す」は出さない
		XCTAssertFalse(app.buttons["銘柄を選び直す"].exists, "登録した銘柄が無いのに「選び直す」が出ている")
	}

	/// 銘柄が未登録で、取得に失敗する状態で起動する。
	/// `-holdings ()` と `-watching ()` は UserDefaults の読み出しだけを上書きする。前の実行で登録した銘柄は端末に残るため、毎回付ける
	@MainActor
	private func launch() -> XCUIApplication {
		let app = XCUIApplication()
		app.launchArguments += ["-holdings", "()", "-watching", "()"]
		app.launchEnvironment["ICHIKABU_API_BASE_URL"] = Self.unreachable
		app.launch()
		return app
	}
}
