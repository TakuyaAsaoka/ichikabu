import IchikabuAPI
import Observation

/// イベント・銘柄・テーマ・持ち株の状態。画面の外に1つだけ持ち、画面は読むだけにする（#213）。
/// 取得と保存の決まりはここにあり、画面を描かずに単体テストで確かめられる
@MainActor
@Observable
final class AppData {
	/// 通信の差し替え口。テストは数や失敗を決めたクロージャを渡す。
	/// 実装が1つしかないのでプロトコルにはしない
	struct Fetch: Sendable {
		var events: @Sendable () async throws -> [Event]
		var stocks: @Sendable () async throws -> [Stock]
		var themes: @Sendable () async throws -> [Theme]

		static let live = Fetch(
			events: { try await APIClient().events() },
			stocks: { try await APIClient().stocks() },
			themes: { try await APIClient().themes() }
		)
	}

	private(set) var events: [Event] = []
	/// 絞り込みに使う銘柄。市場とテーマは持ち株のIDだけでは引けない
	private(set) var stocks: [Stock] = []
	/// 詳細の文に出すテーマの名前を引くための一覧
	private(set) var themes: [Theme] = []
	/// 直近の取得に失敗したか
	private(set) var failed = false
	/// 取得している最中か。起動時の1回目も含むが、画面に出るのは失敗中の取り直しだけ
	private(set) var isLoading = false
	/// イベントと銘柄を1度でも受け取れたか。受け取る前は件数が分からない
	private(set) var loaded = false

	/// 選んだ持ち株。書き込むと同時に端末へ保存する。
	/// 保存を通らずに持ち株が変わる経路を作らないため、書き込み口はこれ1つにする
	var holdings: [Int] {
		didSet { store.save(holdings) }
	}

	@ObservationIgnored private let fetch: Fetch
	@ObservationIgnored private let store: HoldingStore

	/// 持ち株は端末に保存したものを起動時に読む
	init(fetch: Fetch = .live, store: HoldingStore = HoldingStore()) {
		self.fetch = fetch
		self.store = store
		self.holdings = store.load()
	}

	/// 持ち株に足す。もう持っていれば何もしない（すばやく2回押しても、同じ銘柄が2回入らない）
	func addHolding(_ stockId: Int) {
		guard !holdings.contains(stockId) else { return }
		holdings.append(stockId)
	}

	/// 出すのは持ち株に対応するイベントだけ。絞り込みは端末で行う（Issue #87）
	var visibleEvents: [Event] {
		EventLayout.visible(events, holdings: holdings, stocks: stocks)
	}

	func load() async {
		// 「再試行」を続けて押したときに2本目を走らせない。走らせると、
		// 先に終わった方が isLoading を戻し、取得の途中で「再試行」がまた出る
		guard !isLoading else { return }
		isLoading = true
		defer { isLoading = false }
		do {
			// 3本を同時に取る。イベントと銘柄は1本でも失敗すると代入に届かないので、
			// 銘柄一覧が無いまま絞ったふりのカレンダーを描くことがない。
			// テーマは `try?` で受けて、落ちたら空の配列にする。テーマの名前は添え書きで、
			// 無くても `relationDetail` が名前を省いて出せる。アプリを先に配ってサーバーが古い
			// （`/api/themes` が無い）間も、カレンダーが出るようにするため
			async let events = fetch.events()
			async let stocks = fetch.stocks()
			async let themes = try? fetch.themes()
			(self.events, self.stocks) = try await (events, stocks)
			self.themes = await themes ?? []
			loaded = true
			failed = false
		} catch {
			// 銘柄一覧が落ちた場合もここに来る。片方だけ落ちても画面には何も出ないため、
			// 見出しはイベントに限定しない
			failed = true
		}
	}
}
