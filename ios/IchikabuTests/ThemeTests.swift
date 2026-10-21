import Foundation
import Testing

/// 画面のファイルが文字・積み重ねの間・角丸・ボタンの種類を `Theme.swift` の名前で書いているか。
/// 決まりは `Theme.swift` の冒頭にある。テストはシミュレータで動くが、Mac のソースをそのまま読める
@Suite("画面のファイルの書き方")
struct ThemeTests {
	/// 直に書かないもの。`spacing: 0` は数字のまま書くので当てない
	private static let forbidden =
		#"\.font\(\.(largeTitle|title|title2|title3|headline|subheadline|body|callout|footnote|caption|caption2|system)\b|spacing: *[1-9]|cornerRadius: *[0-9]|\.buttonStyle\(\.(plain|bordered|borderedProminent|borderless)\)"#

	/// アプリのソースの置き場（`ios/Ichikabu`）。このファイルの場所から辿る
	private static let appSources = URL(filePath: #filePath)
		.deletingLastPathComponent().deletingLastPathComponent().appending(path: "Ichikabu")

	@Test("文字・間・角丸・ボタンを OS の型や数字で直に書いた行が無い")
	func 直に書いた行が無い() throws {
		let regex = try Regex(Self.forbidden)
		let files = try #require(FileManager.default.enumerator(at: Self.appSources, includingPropertiesForKeys: nil))
			.compactMap { $0 as? URL }
			.filter { $0.pathExtension == "swift" && $0.lastPathComponent != "Theme.swift" }
		// 置き場を取り違えると0件で通ってしまうので、読めたことを先に確かめる
		#expect(files.contains { $0.lastPathComponent == "CalendarView.swift" })

		var violations: [String] = []
		for file in files {
			let lines = try String(contentsOf: file, encoding: .utf8).split(separator: "\n", omittingEmptySubsequences: false)
			for (index, line) in lines.enumerated() where line.contains(regex) {
				violations.append("\(file.lastPathComponent):\(index + 1): \(line.trimmingCharacters(in: .whitespaces))")
			}
		}
		#expect(violations.isEmpty, "Theme.swift の名前を使う:\n\(violations.joined(separator: "\n"))")
	}
}
