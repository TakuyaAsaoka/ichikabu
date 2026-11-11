import XCTest

/// 画面一覧を撮る UI テスト（Issue #166）。
///
/// capturing-screens-to-canvas スキルが、設定の env を `TEST_RUNNER_` 付きで渡して走らせる。
/// 写真の名前は `段｜画面`（全角の `｜`）にする。スキルは撮った時刻の順に並べ、名前の前半で段に分ける。
/// `/` は書き出すと消えるため使えない。
///
/// 撮影用の接続先 `ICHIKABU_CAPTURE_API_BASE_URL` が渡されなければ飛ばす。品質ゲートでは撮影用のサーバーが無いため。
/// サーバーが要る `test_1`・`test_2` は、飛ばす判定で取り出した値を起動に使うので、判定だけを消すとコンパイルが通らない。
/// `test_3` は何も待ち受けていないポートにつなぐので、判定を消してもサーバーの有無で結果は変わらない。
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
	func test_1_銘柄を選ぶ流れ() throws {
		let app = launch(baseURL: try captureBaseURL())

		openStockPicker(app)
		snap(app, "銘柄が未登録｜銘柄を選ぶ画面")
		closeSheet(app)
		snap(app, "銘柄が未登録｜カレンダー")
		openStocksTab(app)
		XCTAssertTrue(app.staticTexts["銘柄が未登録です"].waitForExistence(timeout: 10), "銘柄のタブに未登録の案内が出ない")
		snap(app, "銘柄が未登録｜銘柄のタブ")
		// タブ側の入口。帯の入口は、このあとの選ぶ手順で通す
		app.buttons["銘柄を選ぶ"].tap()
		XCTAssertTrue(pickerBar(app).waitForExistence(timeout: 10), "銘柄のタブの「銘柄を選ぶ」で選ぶ画面が開かない")
		pickerBar(app).buttons["完了"].tap()
		XCTAssertTrue(pickerBar(app).waitForNonExistence(timeout: 10), "「完了」で閉じない")
		openCalendarTab(app)

		// 最後の1行を残して「持ち株」にする。登録した行と、登録しない行の両方を写す
		openStockPicker(app)
		let rows = pickerRows(app)
		let count = rows.count
		XCTAssertGreaterThanOrEqual(count, 2, "銘柄が2件以上ないと、登録した行と登録しない行の両方を写せない")
		for index in 0..<(count - 1) {
			choose("持ち株", in: rows.element(boundBy: index), app)
		}
		// 選び損じたまま「登録済み」の名前で撮らない
		for index in 0..<(count - 1) {
			XCTAssertTrue(rows.element(boundBy: index).label.hasSuffix("、持ち株"), "\(index + 1)行目が「持ち株」になっていない")
		}
		XCTAssertTrue(rows.element(boundBy: count - 1).label.hasSuffix("、なし"), "最後の行まで登録している")
		snap(app, "銘柄を登録済み｜銘柄を選ぶ画面")
		closeSheet(app)
		snap(app, "銘柄を登録済み｜カレンダー")
		openStocksTab(app)
		XCTAssertTrue(app.staticTexts["市場全体のイベントはカレンダーに出ます"].waitForExistence(timeout: 10), "銘柄のタブに銘柄の一覧が出ない")
		XCTAssertTrue(app.staticTexts["持ち株"].exists, "銘柄のタブに見出し「持ち株」が出ない")
		snap(app, "銘柄を登録済み｜銘柄のタブ")
		app.buttons["銘柄を選び直す"].tap()
		XCTAssertTrue(pickerBar(app).waitForExistence(timeout: 10), "銘柄のタブの「選び直す」で選ぶ画面が開かない")
		pickerBar(app).buttons["完了"].tap()
		XCTAssertTrue(pickerBar(app).waitForNonExistence(timeout: 10), "「完了」で閉じない")
		openCalendarTab(app)

		// 日付のセルは読み上げ名が「日番号 イベント名…」になる（DayCell の accessibilityElement(children: .combine)）
		try visibleDay(app, matching: "^[0-9]+[^0-9].*$", what: "イベントのある日").tap()
		waitForSheet(app)
		snap(app, "銘柄を登録済み｜日のシート（イベントあり）")
		openEventDetail(app)

		// 詳細の銘柄の行から銘柄の画面へ進む。行は銘柄名と「市場 ティッカー」、登録の印（あれば）をまとめた1つのボタン。印の分だけ末尾が変わるので、末尾は問わない
		let stockRow = app.buttons.matching(NSPredicate(format: "label MATCHES %@", ".*(JP|US) [0-9A-Z.]+.*")).firstMatch
		if !stockRow.waitForExistence(timeout: 5) {
			XCTFail("イベントの詳細に銘柄の行が無い。開発用DBに、登録した銘柄に関係するテーマか銘柄のイベントが当月に無い")
		}
		stockRow.tap()
		XCTAssertTrue(app.staticTexts["これから来るイベント"].waitForExistence(timeout: 10), "銘柄の画面が開かない")
		snap(app, "銘柄を登録済み｜銘柄")

		// 銘柄の画面を開いたまま、半分の高さのシートの裏のカレンダーで別の日を押すと、その日の一覧に戻る
		try visibleDay(app, matching: "^[0-9]+$", what: "イベントの無い日").tap()
		XCTAssertTrue(app.staticTexts["これから来るイベント"].waitForNonExistence(timeout: 10), "別の日を押しても銘柄の画面が残っている")
		waitForSheet(app)
		snap(app, "銘柄を登録済み｜日のシート（イベントなし）")
	}

	/// 銘柄を登録したあとの、テーマから銘柄、イベント、気になる銘柄への登録までの流れ。
	/// 開発用DBの見本のテーマ「（見本）大型株」には、持ち株にした銘柄（トヨタ自動車）と、
	/// 最後の1銘柄として登録せずに残す銘柄（ソフトバンク）が並ぶ（server/src/db/seed-event.ts）
	@MainActor
	func test_2_テーマから銘柄を気になる銘柄に登録する流れ() throws {
		let app = launch(baseURL: try captureBaseURL())

		openStockPicker(app)
		let rows = pickerRows(app)
		let count = rows.count
		XCTAssertGreaterThanOrEqual(count, 2, "銘柄が2件以上ないと、登録した銘柄と登録していない銘柄を並べられない")
		for index in 0..<(count - 1) {
			choose("持ち株", in: rows.element(boundBy: index), app)
		}
		closeSheet(app)

		// 1. テーマのタブ
		app.tabBars.buttons["テーマ"].tap()
		XCTAssertTrue(app.navigationBars["テーマ"].waitForExistence(timeout: 10), "テーマのタブが開かない")
		let themeRow = app.staticTexts["（見本）大型株"]
		XCTAssertTrue(themeRow.waitForExistence(timeout: 10), "テーマのタブに「（見本）大型株」の行が無い。開発用DBに見本のテーマを入れる（pnpm db:seed）")
		snap(app, "銘柄を登録済み｜テーマのタブ")

		// 2. テーマの画面。持ち株にした銘柄にだけ「持ち株」が付く
		themeRow.tap()
		XCTAssertTrue(app.staticTexts["このテーマの銘柄"].waitForExistence(timeout: 10), "テーマの画面が開かない")
		snap(app, "銘柄を登録済み｜テーマ")
		let toyota = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "トヨタ自動車")).firstMatch
		let softbank = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "ソフトバンク")).firstMatch
		XCTAssertTrue(toyota.waitForExistence(timeout: 10), "テーマの画面にトヨタ自動車の行が無い")
		XCTAssertTrue(softbank.waitForExistence(timeout: 10), "テーマの画面にソフトバンクの行が無い")
		XCTAssertTrue(toyota.label.contains("持ち株"), "持ち株の銘柄に「持ち株」が出ていない: \(toyota.label)")
		XCTAssertFalse(softbank.label.contains("持ち株") || softbank.label.contains("気になる"), "登録していない銘柄に印が出ている: \(softbank.label)")

		// 3. 登録していない銘柄の画面。3つから選ぶ部品は「なし」を選んでいる
		softbank.tap()
		let none = app.segmentedControls.buttons["なし"]
		XCTAssertTrue(none.waitForExistence(timeout: 10), "銘柄の画面に3つから選ぶ部品の「なし」が出ない")
		XCTAssertTrue(none.isSelected, "登録していない銘柄で「なし」が選ばれていない")
		XCTAssertTrue(app.segmentedControls.buttons["持ち株"].exists, "3つから選ぶ部品に「持ち株」が出ない")
		XCTAssertTrue(app.segmentedControls.buttons["気になる"].exists, "3つから選ぶ部品に「気になる」が出ない")
		snap(app, "銘柄を登録済み｜銘柄（登録なし）")

		// 4. 登録していない銘柄のイベント。見出しが「このイベントの対象」になる
		// 当てにするのは「ソフトバンク 権利付最終日」。サーバーが決算月から計算して返すイベントで、
		// 種データの `EVENTS` には無い（server/src/rights.ts）
		let eventRow = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "重要度")).firstMatch
		if !eventRow.waitForExistence(timeout: 5) {
			XCTFail("ソフトバンクの「これから来るイベント」に行が無い。当てにしているのは計算で作る権利付最終日で、休場日の表（server/src/rights.ts の CLOSED_DAYS）に載っている年の分しか作られない。翌年分が足されているか確かめる")
		}
		eventRow.tap()
		XCTAssertTrue(app.staticTexts["このイベントの対象"].waitForExistence(timeout: 10), "登録していない銘柄のイベントの見出しが「このイベントの対象」にならない")
		XCTAssertFalse(app.staticTexts["あなたの銘柄との関係"].exists, "登録していない銘柄のイベントに「あなたの銘柄との関係」が出ている")

		// 5. 戻って「気になる」を選ぶ。選んだ直後に印が替わり、銘柄のタブの「気になる銘柄」の下に増える
		app.navigationBars.buttons.firstMatch.tap()
		let watching = app.segmentedControls.buttons["気になる"]
		XCTAssertTrue(watching.waitForExistence(timeout: 10), "銘柄の画面に戻れない")
		watching.tap()
		// 押した直後は選びが反映されていないことがあるので、選ばれるのを待ってから確かめる
		expectation(for: NSPredicate(format: "isSelected == true"), evaluatedWith: watching)
		waitForExpectations(timeout: 10)
		XCTAssertFalse(app.segmentedControls.buttons["持ち株"].isSelected, "「気になる」を選んだのに「持ち株」も選ばれている")
		snap(app, "銘柄を登録済み｜銘柄（気になる）")
		openStocksTab(app)
		let watchingHeader = app.staticTexts["気になる銘柄"]
		let heldHeader = app.staticTexts["持ち株"]
		XCTAssertTrue(watchingHeader.waitForExistence(timeout: 10), "銘柄のタブに見出し「気になる銘柄」が出ない")
		XCTAssertTrue(heldHeader.exists, "銘柄のタブに見出し「持ち株」が出ない")
		let added = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "ソフトバンク")).firstMatch
		let held = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "トヨタ自動車")).firstMatch
		XCTAssertTrue(added.waitForExistence(timeout: 10), "気になる銘柄にした銘柄が銘柄のタブに出ない")
		XCTAssertTrue(held.exists, "持ち株の銘柄が銘柄のタブに出ない")
		// 並びは見出しの下。ソフトバンクは「気になる銘柄」の下、トヨタ自動車は「持ち株」の下にある
		XCTAssertLessThan(heldHeader.frame.minY, watchingHeader.frame.minY, "見出しが「持ち株」「気になる銘柄」の順になっていない")
		XCTAssertGreaterThanOrEqual(added.frame.minY, watchingHeader.frame.maxY, "ソフトバンクが「気になる銘柄」の下に出ていない")
		XCTAssertGreaterThanOrEqual(held.frame.minY, heldHeader.frame.maxY, "トヨタ自動車が「持ち株」の下に出ていない")
		XCTAssertLessThanOrEqual(held.frame.maxY, watchingHeader.frame.minY, "トヨタ自動車が「持ち株」の下に収まっていない")
		snap(app, "銘柄を登録済み｜銘柄のタブ（持ち株と気になる銘柄）")

		// 6. テーマの画面では、ソフトバンクの印が「気になる」
		app.tabBars.buttons["テーマ"].tap()
		XCTAssertTrue(themeRow.waitForExistence(timeout: 10), "テーマのタブに戻れない")
		themeRow.tap()
		XCTAssertTrue(app.staticTexts["このテーマの銘柄"].waitForExistence(timeout: 10), "テーマの画面が開かない")
		let marked = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "ソフトバンク")).firstMatch
		XCTAssertTrue(marked.waitForExistence(timeout: 10), "テーマの画面にソフトバンクの行が無い")
		XCTAssertTrue(marked.label.contains("気になる"), "気になる銘柄に「気になる」が出ていない: \(marked.label)")
		XCTAssertFalse(marked.label.contains("持ち株"), "気になる銘柄に「持ち株」が出ている: \(marked.label)")
		snap(app, "銘柄を登録済み｜テーマ（気になる銘柄あり）")
	}

	@MainActor
	func test_3_取得に失敗した流れ() throws {
		_ = try captureBaseURL()
		let app = launch(baseURL: Self.unreachable)

		let retry = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "再試行")).firstMatch
		XCTAssertTrue(retry.waitForExistence(timeout: 30), "「再試行」が出ない")
		snap(app, "取得に失敗｜カレンダー")

		// 失敗中も、カレンダーの帯から選ぶ画面は開ける
		app.buttons["銘柄を選ぶ"].tap()
		XCTAssertTrue(pickerBar(app).waitForExistence(timeout: 10), "銘柄を選ぶ画面が開かない")
		XCTAssertTrue(app.staticTexts["銘柄を取得できていません"].waitForExistence(timeout: 10), "銘柄が無いときの案内が出ない")
		snap(app, "取得に失敗｜銘柄を選ぶ画面")
		// 日付のシートと同じく、開いている間はタブの帯が覆われるので、タブを替える前に閉じる
		closeSheet(app)

		openStocksTab(app)
		XCTAssertTrue(app.staticTexts["イベントと銘柄を取得できませんでした"].waitForExistence(timeout: 10), "銘柄のタブに失敗の知らせが出ない")
		snap(app, "取得に失敗｜銘柄のタブ")
	}

	// MARK: - 手順

	/// 撮影のときだけ渡される接続先。無ければテストを飛ばす
	private func captureBaseURL() throws -> String {
		guard let value = ProcessInfo.processInfo.environment["ICHIKABU_CAPTURE_API_BASE_URL"] else {
			throw XCTSkip("画面を撮るときだけ走らせる（ICHIKABU_CAPTURE_API_BASE_URL が渡されていない）")
		}
		return value
	}

	/// 銘柄が未登録の状態で起動する。
	/// `-holdings ()` と `-watching ()` は UserDefaults の読み出しだけを上書きする。前の実行で登録した銘柄は端末に残るため、毎回付ける
	@MainActor
	private func launch(baseURL: String) -> XCUIApplication {
		let app = XCUIApplication()
		app.launchArguments += ["-holdings", "()", "-watching", "()"]
		// TEST_RUNNER_ の環境変数は UI テストにしか届かないので、アプリが読む名前で入れ直す
		app.launchEnvironment["ICHIKABU_API_BASE_URL"] = baseURL
		app.launch()
		return app
	}

	/// 銘柄を選ぶ画面の行の選択欄。読み上げ名は「銘柄名の登録、」に選んでいる「なし」「持ち株」「気になる」が続く形（StockPicker の row）。
	/// `app.cells` で探さない。カレンダーの月送りのページも cells に数えられ、行が無くても見つかってしまう（実測）
	@MainActor
	private func pickerRows(_ app: XCUIApplication) -> XCUIElementQuery {
		app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "の登録、"))
	}

	/// 選択欄を押してメニューを開き、選択肢を押す。押したあと、選んだ値に替わるまで待つ
	@MainActor
	private func choose(_ option: String, in row: XCUIElement, _ app: XCUIApplication) {
		row.tap()
		let item = app.buttons[option]
		XCTAssertTrue(item.waitForExistence(timeout: 10), "選択肢「\(option)」が出ない")
		item.tap()
		let chosen = NSPredicate(format: "label ENDSWITH %@", "、\(option)")
		expectation(for: chosen, evaluatedWith: row)
		waitForExpectations(timeout: 10)
	}

	/// 銘柄を選ぶ画面を開き、行が出るまで待つ。イベントと銘柄は1回で受け取るので、行が出れば読み込みも終わっている。
	/// 銘柄が未登録のあいだは、カレンダーの帯の「銘柄を選ぶ」から開く。
	/// 帯のボタンは銘柄のタブの中身と別のタブにあり、いまのタブにあるほうだけが画面に出る
	@MainActor
	private func openStockPicker(_ app: XCUIApplication) {
		app.buttons["銘柄を選ぶ"].tap()
		// シートの見出しが出たことを先に確かめる。確かめずに閉じると、見出しが最初から無い場合に「閉じた」と取り違える
		XCTAssertTrue(pickerBar(app).waitForExistence(timeout: 10), "銘柄を選ぶ画面が開かない")
		XCTAssertTrue(pickerRows(app).firstMatch.waitForExistence(timeout: 30), "銘柄の行が出ない。接続先のサーバーと開発用DBの銘柄を確かめる")
	}

	/// 開いている日のシートで、開発用DBの見本のテーマのイベントの行を押して詳細を撮る。
	/// 見本の行が無い月は、その日の最初のイベントの行を押す。どちらの行も、詳細が開かなければ失敗させる。
	/// 行は読み上げ名で探す（`app.cells` は使わない。stockRows の注記と同じ理由）。
	/// 行の読み上げ名には ★ の読み上げ「重要度」が入り、日付のセルの名前（日番号で始まる）には入らない。
	/// 詳細は開いたままにする。戻らずに、裏のカレンダーで別の日を押す確認に続ける
	@MainActor
	private func openEventDetail(_ app: XCUIApplication) {
		let sample = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "（見本）自動車のテーマのイベント")).firstMatch
		let first = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "重要度")).firstMatch
		let row = sample.waitForExistence(timeout: 3) ? sample : first
		XCTAssertTrue(row.waitForExistence(timeout: 10), "日のシートにイベントの行が無い")
		row.tap()
		// 詳細が開いたことを、関係の見出しで確かめてから撮る
		XCTAssertTrue(app.staticTexts["あなたの銘柄との関係"].waitForExistence(timeout: 10), "イベントの詳細が開かない")
		snap(app, "銘柄を登録済み｜イベントの詳細")
	}

	/// 下のタブの「銘柄」へ移る。シートが開いている間はタブの帯が覆われるので、先に閉じておく
	@MainActor
	private func openStocksTab(_ app: XCUIApplication) {
		app.tabBars.buttons["銘柄"].tap()
		XCTAssertTrue(app.navigationBars["銘柄"].waitForExistence(timeout: 10), "銘柄のタブが開かない")
	}

	@MainActor
	private func openCalendarTab(_ app: XCUIApplication) {
		app.tabBars.buttons["カレンダー"].tap()
		// 押した直後は切り替わっていない。カレンダーにしか無い曜日の見出しが出るのを待つ
		XCTAssertTrue(app.staticTexts["日"].firstMatch.waitForExistence(timeout: 10), "カレンダーのタブに戻れない")
	}

	@MainActor
	private func waitForSheet(_ app: XCUIApplication) {
		XCTAssertTrue(sheetBar(app).waitForExistence(timeout: 10), "シートが開かない")
	}

	/// 銘柄を選ぶ画面の見出し。下のタブができて見出しの数が増えたので、番号でなく名前で探す
	@MainActor
	private func pickerBar(_ app: XCUIApplication) -> XCUIElement {
		app.navigationBars["銘柄を選ぶ"]
	}

	/// 日のシートの見出し（`8月4日 (火)`）。見出しの数は下のタブで変わるので、番号でなく名前の形で探す
	@MainActor
	private func sheetBar(_ app: XCUIApplication) -> XCUIElement {
		app.navigationBars.matching(NSPredicate(format: "identifier MATCHES %@", "^[0-9]+月[0-9]+日.*")).firstMatch
	}

	/// シートを閉じる。高さの候補が 0.45 と large なので、1回引き下ろしても 0.45 で止まることがある。
	/// 0.45 の間は裏を触れる設定なので、外を押しても閉じない。見出しが消えるまで引き下ろす。
	/// 見出しの上で `swipeDown` を払っても、シートは動かなかった（実測）。見出しの少し上（つまみの辺り）を押さえて、画面の下端まで引く。
	/// 12pt は iOS 26.5 のシートの形での実測。iOS を上げて閉じなくなったら（下の確認で落ちる）ここを見直す
	@MainActor
	private func closeSheet(_ app: XCUIApplication) {
		for _ in 0..<3 where pickerBar(app).exists {
			let grabber = pickerBar(app).coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0)).withOffset(CGVector(dx: 0, dy: -12))
			let bottom = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.99))
			grabber.press(forDuration: 0.1, thenDragTo: bottom)
			_ = pickerBar(app).waitForNonExistence(timeout: 3)
		}
		XCTAssertFalse(pickerBar(app).exists, "シートが閉じない")
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
