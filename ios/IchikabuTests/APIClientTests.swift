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
			[{"id":1,"kind":"market","title":"FOMC 政策金利発表","shortLabel":"FOMC",\
			"startDate":"2026-09-16","endDate":"2026-09-17","time":"03:00:00",\
			"importance":3,"note":null}]
			""".utf8)
		let events = try APIClient.events(from: json, response: response(status: 200))
		#expect(events.count == 1)
		#expect(events[0].kind == .market)
		#expect(events[0].title == "FOMC 政策金利発表")
		#expect(events[0].endDate == "2026-09-17")
		#expect(events[0].note == nil)
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
