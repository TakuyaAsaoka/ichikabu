import Foundation
import IchikabuAPI

/// 通信の失敗
enum APIError: Error, Equatable {
	/// HTTP の応答ではない
	case notHTTP
	/// 想定していないステータス
	case unexpectedStatus(Int)
}

/// サーバーとの通信。
/// 経路が2本しかないため、契約からは型だけを生成し、通信は自分で書く（Issue #5 設計書 §3 判断3）。
struct APIClient {
	/// 接続先。Debug はMacの `next dev`、Release は配信先を見る。
	///
	/// 実機で配信先を使うときは、Xcode の Scheme > Run > Build Configuration を
	/// Release にする。Debug のままだと iPhone 自身の 3000 番を指すため届かない。
	static let baseURL: URL = {
		#if DEBUG
			return URL(string: "http://localhost:3000")!
		#else
			return URL(string: "https://ichikabu.netlify.app")!
		#endif
	}()

	/// 通信に使うセッション。**Cookie を保管しない**。
	///
	/// このアプリは認証を持たない（ログイン廃止 設計書 §5）。`URLSession.shared` は
	/// 応答の Cookie を保存して以降の要求に付けるが、Better Auth は Cookie が付いた要求に
	/// だけ Origin を検査する。アプリは Origin を送らないため、Cookie を1つでも
	/// 持つと、同じ配信先にある管理UIの認証の都合で要求が拒まれうる。
	static let session: URLSession = {
		let configuration = URLSessionConfiguration.default
		configuration.httpCookieStorage = nil
		return URLSession(configuration: configuration)
	}()

	/// 有効なイベントを全件取る。認証は要らない（ログイン廃止 設計書 §5.1）
	func events() async throws -> [Event] {
		let request = URLRequest(url: Self.baseURL.appending(path: "/api/events"))
		let (data, response) = try await Self.session.data(for: request)
		return try Self.events(from: data, response: response)
	}

	/// 登録されている銘柄を全件取る。認証は要らない（ログイン廃止 設計書 §3.2）
	func stocks() async throws -> [Stock] {
		let request = URLRequest(url: Self.baseURL.appending(path: "/api/stocks"))
		let (data, response) = try await Self.session.data(for: request)
		return try Self.stocks(from: data, response: response)
	}

	// 以下は引数だけで動く。通信をせずにテストできるように分けている

	/// 応答を銘柄の配列に読み取る
	static func stocks(from data: Data, response: URLResponse) throws -> [Stock] {
		_ = try verified(response)
		return try JSONDecoder().decode([Stock].self, from: data)
	}

	/// 応答をイベントの配列に読み取る
	static func events(from data: Data, response: URLResponse) throws -> [Event] {
		_ = try verified(response)
		return try JSONDecoder().decode([Event].self, from: data)
	}

	/// 成功の応答だけを通す
	private static func verified(_ response: URLResponse) throws -> HTTPURLResponse {
		guard let http = response as? HTTPURLResponse else { throw APIError.notHTTP }
		guard (200..<300).contains(http.statusCode) else {
			throw APIError.unexpectedStatus(http.statusCode)
		}
		return http
	}
}
