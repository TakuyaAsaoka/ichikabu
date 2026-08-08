import Foundation
import IchikabuAPI

/// 通信の失敗
enum APIError: Error, Equatable {
	/// 認証切れ。サインイン画面に戻す
	case unauthorized
	/// 成功したのに set-auth-token が付いていない
	case missingToken
	/// HTTP の応答ではない
	case notHTTP
	/// 想定していないステータス
	case unexpectedStatus(Int)
}

/// サーバーとの通信。
/// 経路が2本しかないため、契約からは型だけを生成し、通信は自分で書く（Issue #5 設計書 §3 判断3）。
struct APIClient {
	static let baseURL = URL(string: "http://localhost:3000")!

	/// サインインしてトークンを返す。
	/// この経路は Better Auth のもので openapi.yaml に載せていない（Issue #5 設計書 §3 判断1）
	func signIn(email: String, password: String) async throws -> String {
		var request = URLRequest(url: Self.baseURL.appending(path: "/api/auth/sign-in/email"))
		request.httpMethod = "POST"
		request.setValue("application/json", forHTTPHeaderField: "content-type")
		request.httpBody = try JSONEncoder().encode(["email": email, "password": password])
		let (_, response) = try await URLSession.shared.data(for: request)
		return try Self.token(from: response)
	}

	/// 保有に対応するイベントを全件取る
	func events(token: String) async throws -> [Event] {
		var request = URLRequest(url: Self.baseURL.appending(path: "/api/events"))
		request.setValue("Bearer \(token)", forHTTPHeaderField: "authorization")
		let (data, response) = try await URLSession.shared.data(for: request)
		return try Self.events(from: data, response: response)
	}

	// 以下は引数だけで動く。通信をせずにテストできるように分けている

	/// 応答ヘッダからトークンを取り出す
	static func token(from response: URLResponse) throws -> String {
		let http = try verified(response)
		guard let token = http.value(forHTTPHeaderField: "set-auth-token") else {
			throw APIError.missingToken
		}
		return token
	}

	/// 応答をイベントの配列に読み取る
	static func events(from data: Data, response: URLResponse) throws -> [Event] {
		_ = try verified(response)
		return try JSONDecoder().decode([Event].self, from: data)
	}

	/// 成功の応答だけを通す
	private static func verified(_ response: URLResponse) throws -> HTTPURLResponse {
		guard let http = response as? HTTPURLResponse else { throw APIError.notHTTP }
		if http.statusCode == 401 { throw APIError.unauthorized }
		guard (200..<300).contains(http.statusCode) else {
			throw APIError.unexpectedStatus(http.statusCode)
		}
		return http
	}
}
