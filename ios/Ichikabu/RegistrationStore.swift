import Foundation

/// 登録した銘柄（持ち株と気になる銘柄の銘柄ID）を端末に読み書きする（Issue #87・#221）。
///
/// 置くのは銘柄IDの配列2本だけなので、数十バイトで済む。スキーマもマイグレーションも要らない。
/// 持ち株のキーは前の版の `holdings` のまま使う。前の版で選んだ銘柄は、
/// 何も移し替えなくても持ち株として読める（気になる銘柄のキー `watching` は無ければ空になる）。
/// Apple Developer Program に加入したら `NSUbiquitousKeyValueStore` に差し替えて
/// 機種変更で引き継げるようにする。**差し替えるのはこの型の中だけ**。
struct RegistrationStore {
	/// 入れ物。テストは `UserDefaults(suiteName:)` を渡す。
	/// シミュレータの標準の入れ物はアプリを消すまで残り、前の実行の値を拾うため
	private let defaults: UserDefaults

	init(defaults: UserDefaults = .standard) {
		self.defaults = defaults
	}

	/// 登録の種類ごとの保存先のキー。持ち株は前の版と同じ `holdings`
	private func key(_ registration: Registration) -> String {
		switch registration {
		case .held: "holdings"
		case .watching: "watching"
		}
	}

	func load(_ registration: Registration) -> [Int] {
		// 選んでいなければキー自体が無い。別の型が入っていた場合も選び直しで直せるので空にする
		defaults.array(forKey: key(registration)) as? [Int] ?? []
	}

	func save(_ stockIds: [Int], as registration: Registration) {
		defaults.set(stockIds, forKey: key(registration))
	}
}
