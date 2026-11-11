import IchikabuAPI
import Observation

/// 銘柄の登録の種類。1つの銘柄は、同時にどちらか1つだけ（または登録なし）
enum Registration: String, CaseIterable {
	/// 本当に持っている銘柄
	case held
	/// 持っていないが、イベントを追うために登録した銘柄
	case watching

	/// 銘柄ごとの印と選択肢に出す言葉
	var label: String {
		switch self {
		case .held: "持ち株"
		case .watching: "気になる"
		}
	}

	/// 銘柄のタブの見出しに出す言葉
	var sectionTitle: String {
		switch self {
		case .held: "持ち株"
		case .watching: "気になる銘柄"
		}
	}
}

/// イベント・銘柄・テーマ・登録した銘柄の状態。画面の外に1つだけ持ち、画面は読むだけにする（#213）。
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
	/// 絞り込みに使う銘柄。市場とテーマは登録した銘柄のIDだけでは引けない
	private(set) var stocks: [Stock] = []
	/// 詳細の文に出すテーマの名前を引くための一覧
	private(set) var themes: [Theme] = []
	/// 直近の取得に失敗したか
	private(set) var failed = false
	/// 取得している最中か。起動時の1回目も含むが、画面に出るのは失敗中の取り直しだけ
	private(set) var isLoading = false
	/// イベントと銘柄を1度でも受け取れたか。受け取る前は件数が分からない
	private(set) var loaded = false

	/// 持ち株。書き込むと同時に端末へ保存する。
	/// 保存を通らずに変わる経路を作らないため、書き込み口は `register` を通す
	private(set) var holdings: [Int] {
		didSet { store.save(holdings, as: .held) }
	}

	/// 気になる銘柄。持ち株と同じく、書き込むと同時に保存する
	private(set) var watching: [Int] {
		didSet { store.save(watching, as: .watching) }
	}

	@ObservationIgnored private let fetch: Fetch
	@ObservationIgnored private let store: RegistrationStore

	/// 登録は端末に保存したものを起動時に読む
	init(fetch: Fetch = .live, store: RegistrationStore = RegistrationStore()) {
		self.fetch = fetch
		self.store = store
		let holdings = store.load(.held)
		self.holdings = holdings
		// 同じ銘柄が両方に入っていたら持ち株として扱う（register を通せば起きないが、保存の中身は信じ切らない）。
		// 直した値は保存もする。直さないと、あとで持ち株から外したときに、残った保存が気になる銘柄として戻ってくる
		let saved = store.load(.watching)
		let watching = saved.filter { !holdings.contains($0) }
		self.watching = watching
		if watching != saved { store.save(watching, as: .watching) }
	}

	/// 登録した銘柄すべて（持ち株が先）。カレンダーの絞り込みと、一覧の手がかりに使う
	var registered: [Int] { holdings + watching }

	/// その銘柄の登録。登録していなければ nil
	func registration(of stockId: Int) -> Registration? {
		if holdings.contains(stockId) { return .held }
		if watching.contains(stockId) { return .watching }
		return nil
	}

	/// 銘柄の登録を替える。nil なら外す。
	/// 持ち株にすると気になる銘柄から外れ、逆も同じ。同じ種類をもう一度指定しても増えない
	func register(_ stockId: Int, as registration: Registration?) {
		Self.update(&holdings, stockId, present: registration == .held)
		Self.update(&watching, stockId, present: registration == .watching)
	}

	/// 入れるか外すか。もう望みどおりなら何もしない（無駄な保存をしない）
	private static func update(_ ids: inout [Int], _ stockId: Int, present: Bool) {
		let isPresent = ids.contains(stockId)
		if present && !isPresent {
			ids.append(stockId)
		} else if !present && isPresent {
			ids.removeAll { $0 == stockId }
		}
	}

	/// 出すのは登録した銘柄に対応するイベントだけ。絞り込みは端末で行う（Issue #87）
	var visibleEvents: [Event] {
		EventLayout.visible(events, registered: registered, stocks: stocks)
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
