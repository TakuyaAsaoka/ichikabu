// swift-tools-version: 6.0
import PackageDescription

// 契約（リポジトリルートの openapi.yaml）から Swift の型とクライアントを生成するパッケージ。
// 生成はビルドのたびに走るため、生成物はコミットしない（設計書 §7）。
let package = Package(
	name: "IchikabuAPI",
	platforms: [.iOS(.v18)],
	products: [
		.library(name: "IchikabuAPI", targets: ["IchikabuAPI"])
	],
	dependencies: [
		.package(url: "https://github.com/apple/swift-openapi-generator", from: "1.13.0"),
		.package(url: "https://github.com/apple/swift-openapi-runtime", from: "1.12.0"),
		// 生成されたクライアントが HTTPTypes の型を直接使う。
		// swift-openapi-runtime 経由の間接依存だけでは、フレームワークのリンク時に見つからない
		.package(url: "https://github.com/apple/swift-http-types", from: "1.6.0"),
	],
	targets: [
		.target(
			name: "IchikabuAPI",
			dependencies: [
				.product(name: "OpenAPIRuntime", package: "swift-openapi-runtime"),
				.product(name: "HTTPTypes", package: "swift-http-types"),
			],
			plugins: [
				.plugin(name: "OpenAPIGenerator", package: "swift-openapi-generator")
			]
		)
	]
)
