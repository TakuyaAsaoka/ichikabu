import Foundation

/// 選んだ持ち株（銘柄ID）を端末に読み書きする（ログイン廃止 設計書 §4.1）。
///
/// 置くのは銘柄IDの配列だけなので、数十バイトで済む。スキーマもマイグレーションも要らない。
/// Apple Developer Program に加入したら `NSUbiquitousKeyValueStore` に差し替えて
/// 機種変更で引き継げるようにする。**差し替えるのはこの型の中だけ**（同 §4.2）。
struct HoldingStore {
	private static let key = "holdings"

	/// 入れ物。テストは `UserDefaults(suiteName:)` を渡す。
	/// シミュレータの標準の入れ物はアプリを消すまで残り、前の実行の値を拾うため
	private let defaults: UserDefaults

	init(defaults: UserDefaults = .standard) {
		self.defaults = defaults
	}

	func load() -> [Int] {
		// 選んでいなければキー自体が無い。別の型が入っていた場合も選び直しで直せるので空にする
		defaults.array(forKey: Self.key) as? [Int] ?? []
	}

	func save(_ stockIds: [Int]) {
		defaults.set(stockIds, forKey: Self.key)
	}
}
