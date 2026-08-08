import Foundation
import Security

/// サインインのトークンを Keychain に読み書きする（全体設計書 §9）。
/// ラッパーのライブラリは入れず、Security フレームワークをそのまま使う。
enum TokenStore {
	private static let service = "com.takuyaasaoka.ichikabu"
	private static let account = "session-token"

	/// 項目を1つに特定するための条件
	private static var query: [String: Any] {
		[
			kSecClass as String: kSecClassGenericPassword,
			kSecAttrService as String: service,
			kSecAttrAccount as String: account,
		]
	}

	static func save(_ token: String) {
		// 同じ条件の項目があると追加が失敗するため、先に消してから入れる
		SecItemDelete(query as CFDictionary)
		var attributes = query
		attributes[kSecValueData as String] = Data(token.utf8)
		SecItemAdd(attributes as CFDictionary, nil)
	}

	static func load() -> String? {
		var lookup = query
		lookup[kSecReturnData as String] = true
		lookup[kSecMatchLimit as String] = kSecMatchLimitOne
		var item: CFTypeRef?
		guard SecItemCopyMatching(lookup as CFDictionary, &item) == errSecSuccess,
			let data = item as? Data
		else { return nil }
		return String(decoding: data, as: UTF8.self)
	}

	static func delete() {
		SecItemDelete(query as CFDictionary)
	}
}
