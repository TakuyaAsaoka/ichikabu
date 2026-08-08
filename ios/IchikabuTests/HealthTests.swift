import IchikabuAPI
import Testing

@testable import Ichikabu

/// テストランナーの配線確認。契約から生成された型が
/// テストターゲットからも見えることを合わせて確かめる（Issue #4）。
@Suite("ヘルスチェックの型")
struct HealthTests {
	@Test("status は ok を表す文字列になる")
	func statusIsOK() {
		let health = Health(status: .ok)
		#expect(health.status.rawValue == "ok")
	}
}
