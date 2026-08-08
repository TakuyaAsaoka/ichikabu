import Testing

@testable import Ichikabu

@Suite("トークンの保管")
struct TokenStoreTests {
	@Test("保存したトークンを読み出せる。消すと読めなくなる")
	func saveLoadDelete() {
		TokenStore.save("test-token")
		#expect(TokenStore.load() == "test-token")

		// 上書きできる（サインインし直した場合）
		TokenStore.save("test-token-2")
		#expect(TokenStore.load() == "test-token-2")

		TokenStore.delete()
		#expect(TokenStore.load() == nil)
	}
}
