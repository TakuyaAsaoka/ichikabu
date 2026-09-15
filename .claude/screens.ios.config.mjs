// iOS アプリの画面一覧を撮る設定（capturing-screens-to-canvas スキル。Issue #166）。
// 撮る画面と順番は UI テスト ios/IchikabuUITests/ScreensUITests.swift が持つ。ここには書き写さない
export default {
  title: "イチカブ iOS 画面一覧",
  favicon: "📱",
  artifactUrl: "https://claude.ai/artifact/SncHBrHyEEu2MVr5HWXsDX",
  // アプリが読むサーバー。管理画面を撮る設定（screens.config.mjs）の 3777 と重ならないポートにする
  baseURL: "http://localhost:3779/api/health",
  start: "cd server && pnpm gen && pnpm build && pnpm exec next start --port 3779",
  ios: {
    project: "ios/Ichikabu.xcodeproj",
    scheme: "Ichikabu",
    test: "IchikabuUITests/ScreensUITests",
    // 小さい端末で詰まり、大きい端末で間延びに気づく
    devices: ["iPhone 17e", "iPhone 17 Pro Max"],
    // UI テストが受け取り、アプリが読む ICHIKABU_API_BASE_URL として入れ直す。これが無いと撮影のテストは飛ばされる
    env: { ICHIKABU_CAPTURE_API_BASE_URL: "http://localhost:3779" },
    // 契約から型を作るビルドプラグインを信頼する（CLAUDE.md の品質ゲートと同じ理由）
    xcodebuildArgs: ["-skipPackagePluginValidation"],
  },
};
