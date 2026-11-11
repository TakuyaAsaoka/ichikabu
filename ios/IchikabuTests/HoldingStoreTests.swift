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

		HoldingStore(defaults: defaults).save([7203, 6758], as: .held)

		// 開き直した状態は、値を持たない新しい HoldingStore から読むことで作る
		#expect(HoldingStore(defaults: defaults).load(.held) == [7203, 6758])
	}

	@Test("選び直すと前の内容は残らない")
	func replaces() throws {
		let suiteName = "holding-store-replaces"
		let defaults = try defaults(suiteName)
		defer { defaults.removePersistentDomain(forName: suiteName) }

		let store = HoldingStore(defaults: defaults)
		store.save([7203], as: .held)
		store.save([6758], as: .held)

		#expect(store.load(.held) == [6758])
	}

	@Test("持ち株と気になる銘柄は、別々に保存される")
	func separateKeys() throws {
		let suiteName = "holding-store-separate-keys"
		let defaults = try defaults(suiteName)
		defer { defaults.removePersistentDomain(forName: suiteName) }

		let store = HoldingStore(defaults: defaults)
		store.save([1], as: .held)
		store.save([2], as: .watching)

		#expect(store.load(.held) == [1])
		#expect(store.load(.watching) == [2])
	}

	@Test("前の版が保存した形（キー holdings だけ）は、持ち株として読め、気になる銘柄は空")
	func readsOldFormat() throws {
		let suiteName = "holding-store-old-format"
		let defaults = try defaults(suiteName)
		defer { defaults.removePersistentDomain(forName: suiteName) }
		defaults.set([7203, 6758], forKey: "holdings")

		let store = HoldingStore(defaults: defaults)

		#expect(store.load(.held) == [7203, 6758])
		#expect(store.load(.watching).isEmpty)
	}

	@Test("一度も選んでいなければ空")
	func empty() throws {
		let suiteName = "holding-store-empty"
		let defaults = try defaults(suiteName)
		defer { defaults.removePersistentDomain(forName: suiteName) }

		#expect(HoldingStore(defaults: defaults).load(.held).isEmpty)
		#expect(HoldingStore(defaults: defaults).load(.watching).isEmpty)
	}
}
