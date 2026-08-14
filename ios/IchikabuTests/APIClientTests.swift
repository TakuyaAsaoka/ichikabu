import Foundation
import IchikabuAPI
import Testing

@testable import Ichikabu

@Suite("APIの応答の判定")
struct APIClientTests {
	/// 判定はステータスとヘッダしか見ないため、URLは何でもよい
	private static let url = URL(string: "http://localhost:3000/api/events")!

	private func response(status: Int, headers: [String: String] = [:]) -> HTTPURLResponse {
		HTTPURLResponse(url: Self.url, statusCode: status, httpVersion: nil, headerFields: headers)!
	}

	@Test("この経路は Cookie を持たない")
	func doesNotUseCookies() {
		// Cookie が付いた要求にだけ Better Auth は Origin を検査する。
		// アプリは Origin を送らないため、Cookie を1つでも持つと
		// 以降のサインインが 403 で拒まれる
		#expect(APIClient.session.configuration.httpCookieStorage == nil)
	}

	@Test("401 は認証切れとして扱う")
	func unauthorized() {
		#expect(throws: APIError.unauthorized) {
			try APIClient.events(from: Data(), response: response(status: 401))
		}
	}

	@Test("サーバーが返す形の JSON をイベントに読み取れる")
	func decodeEvents() throws {
		let json = Data(
			"""
			[{"id":"1","kind":"market","title":"FOMC 政策金利発表","shortLabel":"FOMC",\
			"startDate":"2026-09-16","endDate":"2026-09-17","time":"03:00:00",\
			"importance":3,"note":null,"source":null,\
			"target":{"type":"market","market":"GLOBAL"}}]
			""".utf8)
		let events = try APIClient.events(from: json, response: response(status: 200))
		#expect(events.count == 1)
		#expect(events[0].kind == .market)
		// 対象は type で場合分けして読み取る。GLOBAL は全員に出す市場イベント
		#expect(events[0].target == .market(.init(_type: .market, market: .GLOBAL)))
		#expect(events[0].title == "FOMC 政策金利発表")
		#expect(events[0].endDate == "2026-09-17")
		#expect(events[0].note == nil)
		#expect(events[0].source == nil)
	}

	@Test("出典つきのイベントは名前とURLを読み取れる")
	func decodeEventWithSource() throws {
		let json = Data(
			"""
			[{"id":"2","kind":"market","title":"消費者物価指数（2026年8月分）",\
			"shortLabel":"CPI","startDate":"2026-09-18","endDate":null,"time":null,\
			"importance":2,"note":null,\
			"source":{"name":"総務省（PDL1.0）","url":"https://www.stat.go.jp/data/cpi/"},\
			"target":{"type":"market","market":"JP"}}]
			""".utf8)
		let events = try APIClient.events(from: json, response: response(status: 200))
		#expect(events[0].source?.name == "総務省（PDL1.0）")
		#expect(events[0].source?.url == "https://www.stat.go.jp/data/cpi/")
	}

	@Test("サーバーが返す形の JSON を銘柄に読み取れる")
	func decodeStocks() throws {
		let json = Data(
			"""
			[{"id":1,"market":"JP","ticker":"7203","name":"トヨタ自動車","themeIds":[10]},\
			{"id":2,"market":"US","ticker":"NVDA","name":"NVIDIA","themeIds":[]}]
			""".utf8)
		let stocks = try APIClient.stocks(from: json, response: response(status: 200))
		#expect(stocks.count == 2)
		#expect(stocks[0].market == .JP)
		#expect(stocks[0].ticker == "7203")
		// 所属テーマは端末側のテーマイベントの判定に使う（ログイン廃止 設計書 §3.2）
		#expect(stocks[0].themeIds == [10])
		#expect(stocks[1].themeIds.isEmpty)
	}

	@Test("サインインの応答ヘッダからトークンを取り出す")
	func extractToken() throws {
		let token = try APIClient.token(
			from: response(status: 200, headers: ["set-auth-token": "abc.def"]))
		#expect(token == "abc.def")
	}

	@Test("サインインに失敗すると認証切れとして扱う")
	func signInFailure() {
		#expect(throws: APIError.unauthorized) {
			try APIClient.token(from: response(status: 401))
		}
	}
}
