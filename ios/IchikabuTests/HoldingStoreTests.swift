import Foundation
import Testing

@testable import Ichikabu

@Suite("持ち株の保管")
struct HoldingStoreTests {
	/// テスト用の入れ物を作る。`UserDefaults.standard` は使わない。
	/// シミュレータの標準の入れ物はアプリを消すまで残り、前の実行の値を拾うため
	private func defaults(_ suiteName: String) throws -> UserDefaults {
		let defaults = try #require(UserDefaults(suiteName: suiteName))
		defaults.removePersistentDomain(forName: suiteName)
		return defaults
	}

	@Test("選んだ持ち株は、アプリを開き直しても残っている")
	func persists() throws {
		let suiteName = "holding-store-persists"
		let defaults = try defaults(suiteName)
		defer { defaults.removePersistentDomain(forName: suiteName) }

		HoldingStore(defaults: defaults).save([7203, 6758])

		// 開き直した状態は、値を持たない新しい HoldingStore から読むことで作る
		#expect(HoldingStore(defaults: defaults).load() == [7203, 6758])
	}

	@Test("選び直すと前の内容は残らない")
	func replaces() throws {
		let suiteName = "holding-store-replaces"
		let defaults = try defaults(suiteName)
		defer { defaults.removePersistentDomain(forName: suiteName) }

		let store = HoldingStore(defaults: defaults)
		store.save([7203])
		store.save([6758])

		#expect(store.load() == [6758])
	}

	@Test("一度も選んでいなければ空")
	func empty() throws {
		let suiteName = "holding-store-empty"
		let defaults = try defaults(suiteName)
		defer { defaults.removePersistentDomain(forName: suiteName) }

		#expect(HoldingStore(defaults: defaults).load().isEmpty)
	}
}
