import XCTest

/// 画面一覧を撮る UI テスト（Issue #166）。
///
/// capturing-screens-to-canvas スキルが、設定の env を `TEST_RUNNER_` 付きで渡して走らせる。
/// 写真の名前は `段｜画面`（全角の `｜`）にする。スキルは撮った時刻の順に並べ、名前の前半で段に分ける。
/// `/` は書き出すと消えるため使えない。
///
/// 撮影用の接続先 `ICHIKABU_CAPTURE_API_BASE_URL` が渡されなければ飛ばす。品質ゲートでは撮影用のサーバーが無いため。
/// サーバーが要る `test_1` は、飛ばす判定で取り出した値を起動に使うので、判定だけを消すとコンパイルが通らない。
/// `test_2` は何も待ち受けていないポートにつなぐので、判定を消してもサーバーの有無で結果は変わらない。
/// アプリが読む `ICHIKABU_API_BASE_URL` と名前を分けている。scheme の実行の設定にアプリ用の値を足しても、ここでは飛ばされたままにするため。
/// XCTest はメソッドを名前の順に走らせるので、段の順は名前の頭の番号で決める
final class ScreensUITests: XCTestCase {
	/// 取得に失敗させるための接続先。何も待ち受けていないポート
	private static let unreachable = "http://127.0.0.1:9"

	override func setUpWithError() throws {
		// 待ちが外れたあとに、違う状態の画面を正しい名前で撮らない
		continueAfterFailure = false
	}

	@MainActor
	func test_1_持ち株を選ぶ流れ() throws {
		let app = launch(baseURL: try captureBaseURL())

		openHoldings(app)
		snap(app, "持ち株が未選択｜持ち株の一覧")
		closeSheet(app)
		snap(app, "持ち株が未選択｜カレンダー")

		// 最後の1行を残して選ぶ。チェックの有る行と無い行の両方を写す。
		// 後ろから押す。選んだ行はチェックの画像の読み上げ名が末尾に付いて行の検索から外れるので、前から押すと次の番号がずれる
		openHoldings(app)
		let rows = stockRows(app)
		let count = rows.count
		XCTAssertGreaterThanOrEqual(count, 2, "銘柄が2件以上ないと、選んだ行と選ばない行の両方を写せない")
		for index in (0..<(count - 1)).reversed() {
			rows.element(boundBy: index).tap()
		}
		// 押し損じたまま「選択済み」の名前で撮らない。選んだ行には isSelected が付く（HoldingsView の accessibilityAddTraits）
		let selected = app.buttons.matching(NSPredicate(format: "selected == true"))
		XCTAssertEqual(selected.count, count - 1, "選んだ行の数が合わない")
		XCTAssertFalse(rows.element(boundBy: count - 1).isSelected, "最後の行まで選ばれている")
		snap(app, "持ち株を選択済み｜持ち株の一覧")
		closeSheet(app)
		snap(app, "持ち株を選択済み｜カレンダー")

		// 日付のセルは読み上げ名が「日番号 イベント名…」になる（DayCell の accessibilityElement(children: .combine)）
		try visibleDay(app, matching: "^[0-9]+[^0-9].*$", what: "イベントのある日").tap()
		waitForSheet(app)
		snap(app, "持ち株を選択済み｜日のシート（イベントあり）")
		closeSheet(app)

		try visibleDay(app, matching: "^[0-9]+$", what: "イベントの無い日").tap()
		waitForSheet(app)
		snap(app, "持ち株を選択済み｜日のシート（イベントなし）")
	}

	@MainActor
	func test_2_取得に失敗した流れ() throws {
		_ = try captureBaseURL()
		let app = launch(baseURL: Self.unreachable)

		let retry = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "再試行")).firstMatch
		XCTAssertTrue(retry.waitForExistence(timeout: 30), "「再試行」が出ない")
		snap(app, "取得に失敗｜カレンダー")

		app.buttons["持ち株"].tap()
		XCTAssertTrue(app.staticTexts["銘柄を取得できていません"].waitForExistence(timeout: 10), "銘柄が無いときの案内が出ない")
		snap(app, "取得に失敗｜持ち株の一覧")
	}

	// MARK: - 手順

	/// 撮影のときだけ渡される接続先。無ければテストを飛ばす
	private func captureBaseURL() throws -> String {
		guard let value = ProcessInfo.processInfo.environment["ICHIKABU_CAPTURE_API_BASE_URL"] else {
			throw XCTSkip("画面を撮るときだけ走らせる（ICHIKABU_CAPTURE_API_BASE_URL が渡されていない）")
		}
		return value
	}

	/// 持ち株が未選択の状態で起動する。
	/// `-holdings ()` は UserDefaults の読み出しだけを上書きする。前の実行で選んだ持ち株は端末に残るため、毎回付ける
	@MainActor
	private func launch(baseURL: String) -> XCUIApplication {
		let app = XCUIApplication()
		app.launchArguments += ["-holdings", "()"]
		// TEST_RUNNER_ の環境変数は UI テストにしか届かないので、アプリが読む名前で入れ直す
		app.launchEnvironment["ICHIKABU_API_BASE_URL"] = baseURL
		app.launch()
		return app
	}

	/// 持ち株の一覧の行。行のボタンの読み上げ名は「銘柄名 市場 ティッカー」をつないだもの（HoldingsView の row）。
	/// `app.cells` で探さない。カレンダーの月送りのページも cells に数えられ、行が無くても見つかってしまう（実測）
	@MainActor
	private func stockRows(_ app: XCUIApplication) -> XCUIElementQuery {
		app.buttons.matching(NSPredicate(format: "label MATCHES %@", ".*(JP|US) [0-9A-Z.]+$"))
	}

	/// 持ち株の一覧を開き、行が出るまで待つ。イベントと銘柄は1回で受け取るので、行が出れば読み込みも終わっている
	@MainActor
	private func openHoldings(_ app: XCUIApplication) {
		app.buttons["持ち株"].tap()
		// シートの見出しが出たことを先に確かめる。確かめずに閉じると、見出しが最初から無い場合に「閉じた」と取り違える
		waitForSheet(app)
		XCTAssertTrue(stockRows(app).firstMatch.waitForExistence(timeout: 30), "銘柄の行が出ない。接続先のサーバーと開発用DBの銘柄を確かめる")
	}

	@MainActor
	private func waitForSheet(_ app: XCUIApplication) {
		XCTAssertTrue(sheetBar(app).waitForExistence(timeout: 10), "シートが開かない")
	}

	/// シートの見出し。カレンダーの見出しの後ろに出る
	@MainActor
	private func sheetBar(_ app: XCUIApplication) -> XCUIElement {
		app.navigationBars.element(boundBy: 1)
	}

	/// シートを閉じる。高さの候補が 0.45 と large なので、1回引き下ろしても 0.45 で止まることがある。
	/// 0.45 の間は裏を触れる設定なので、外を押しても閉じない。見出しが消えるまで引き下ろす。
	/// 見出しの上で `swipeDown` を払っても、シートは動かなかった（実測）。見出しの少し上（つまみの辺り）を押さえて、画面の下端まで引く。
	/// 12pt は iOS 26.5 のシートの形での実測。iOS を上げて閉じなくなったら（下の確認で落ちる）ここを見直す
	@MainActor
	private func closeSheet(_ app: XCUIApplication) {
		for _ in 0..<3 where sheetBar(app).exists {
			let grabber = sheetBar(app).coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0)).withOffset(CGVector(dx: 0, dy: -12))
			let bottom = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.99))
			grabber.press(forDuration: 0.1, thenDragTo: bottom)
			_ = sheetBar(app).waitForNonExistence(timeout: 3)
		}
		XCTAssertFalse(sheetBar(app).exists, "シートが閉じない")
	}

	/// 画面に見えている日付のボタンのうち、読み上げ名が形に合うもの。
	/// 月のページは横送りで、隣の月のボタンも部品の一覧に入るため、押せるものに絞る
	@MainActor
	private func visibleDay(_ app: XCUIApplication, matching pattern: String, what: String) throws -> XCUIElement {
		let candidates = app.buttons.matching(NSPredicate(format: "label MATCHES %@", pattern)).allElementsBoundByIndex
		return try XCTUnwrap(candidates.first { $0.isHittable }, "\(what)のセルが見つからない。開発用DBに当月のイベントがあるか確かめる")
	}

	@MainActor
	private func snap(_ app: XCUIApplication, _ name: String) {
		let shot = XCTAttachment(screenshot: app.screenshot())
		shot.name = name
		shot.lifetime = .keepAlways
		add(shot)
	}
}
