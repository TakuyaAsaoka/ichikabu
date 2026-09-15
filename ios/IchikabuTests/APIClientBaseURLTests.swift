import Foundation
import Testing

@testable import Ichikabu

@Suite("Debug の接続先")
struct APIClientBaseURLTests {
	private static let nextDev = URL(string: "http://localhost:3000")!

	@Test("環境変数が無ければ Mac の next dev を見る")
	func defaultsToNextDev() {
		#expect(APIClient.debugBaseURL(environment: [:]) == Self.nextDev)
	}

	@Test("環境変数の接続先を使う")
	func usesEnvironment() {
		let url = APIClient.debugBaseURL(environment: ["ICHIKABU_API_BASE_URL": "http://localhost:3779"])
		#expect(url == URL(string: "http://localhost:3779")!)
	}

	@Test("http・https でない値や、ホスト名の無い値は使わない", arguments: ["", "abc", "ftp://localhost:3779", "http://", "localhost:3779"])
	func ignoresUnusableValue(value: String) {
		#expect(APIClient.debugBaseURL(environment: ["ICHIKABU_API_BASE_URL": value]) == Self.nextDev)
	}
}
