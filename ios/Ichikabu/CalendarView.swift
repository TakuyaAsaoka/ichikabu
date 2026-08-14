import IchikabuAPI
import SwiftUI

/// メイン画面。等高の月グリッドを横スワイプで送る（全体設計書 §10）
struct CalendarView: View {
	let token: String
	/// 401 が返ったときに呼ぶ
	let onUnauthorized: () -> Void

	@State private var events: [Event] = []
	/// 絞り込みに使う銘柄。市場とテーマは持ち株のIDだけでは引けない
	@State private var stocks: [Stock] = []
	@State private var message: String?
	/// 起動月を0として、何ヶ月ずれた月を見ているか
	@State private var monthOffset = 0

	/// 選んだ持ち株。端末に保存したものを起動時に読む
	@State private var holdings: [Int] = HoldingStore().load()
	/// 持ち株を選ぶ画面を出しているか
	@State private var isPickingHoldings = false

	private let store = HoldingStore()

	/// ページの基準になる日。`@State` にすることで初期化が1回だけになり、
	/// 親の `body` が再評価されても（`let` と違って）値が変わらない
	@State private var today = Date()

	/// タップされた日。nil の間はシートを出さない
	@State private var selectedDay: Date?

	/// シートの高さ。日付は 0.45、持ち株の一覧は狭いので `.large` で開く。
	/// 高さの候補（`presentationDetents` に渡す集合）は変えずに、選ぶほうだけを変える。
	/// 集合を出し分けると、閉じている最中に候補が入れ替わることになる
	@State private var sheetHeight: PresentationDetent = .fraction(0.45)

	/// 起動月の前後12ヶ月（設計書 §2 判断5）
	private static let monthRange = -12...12

	var body: some View {
		// 出すのは持ち株に対応するイベントだけ。絞り込みは端末で行う（ログイン廃止 設計書 §4）
		let shown = EventLayout.visible(events, holdings: holdings, stocks: stocks)

		NavigationStack {
			VStack(spacing: 0) {
				// 案内は TabView の外に置く。中に入れると前後12ヶ月の25ページに複製される
				if holdings.isEmpty {
					holdingsPrompt
				}
				grid(shown: shown)
			}
			.navigationBarTitleDisplayMode(.inline)
			.toolbar {
				// 常に見える入り口。持ち株を選んだあとも選び直せるようにする
				ToolbarItem(placement: .topBarTrailing) {
					Button("持ち株") { showHoldings() }
				}
			}
		}
		.task {
			await load()
		}
	}

	/// 持ち株を選ぶ画面を出す
	private func showHoldings() {
		sheetHeight = .large
		isPickingHoldings = true
	}

	/// その日のイベントのシートを出す。
	/// 高さを 0.45 に戻すのは、持ち株の一覧で `.large` にしたまま日付を開くと
	/// カレンダーが隠れ、続けて別の日付をタップできなくなるため（設計書 §3）
	private func showDay(_ day: Date) {
		sheetHeight = .fraction(0.45)
		selectedDay = day
	}

	/// 持ち株を1つも選んでいないときの案内。選ぶまで消えない
	private var holdingsPrompt: some View {
		Button { showHoldings() } label: {
			HStack {
				Text("持ち株が未選択です")
				Spacer()
				Text("選ぶ").fontWeight(.semibold)
			}
			.font(.caption)
			.padding(.horizontal, 12)
			.padding(.vertical, 8)
			.frame(maxWidth: .infinity)
			.background(Color.yellow.opacity(0.25))
			.contentShape(Rectangle())
		}
		.buttonStyle(.plain)
	}

	private func grid(shown: [Event]) -> some View {
		TabView(selection: $monthOffset) {
			ForEach(Self.monthRange, id: \.self) { offset in
				MonthPage(
					monthStart: EventLayout.month(offset: offset, from: today),
					today: today,
					events: shown,
					onSelect: { showDay($0) }
				)
				.tag(offset)
			}
		}
		.tabViewStyle(.page(indexDisplayMode: .never))
		.overlay {
			if let message {
				// `.task` は画面が出たときの1回しか走らないため、押して取り直せるようにする。
				// これが無いと復旧はアプリの再起動だけになる
				Button { Task { await load() } } label: {
					VStack(spacing: 4) {
						Text(message).foregroundStyle(.secondary)
						Text("再試行")
					}
				}
			}
		}
		// `.sheet(item:)` ではなく `isPresented` で出す。item だと日付が変わるたびに
		// シートを出し直すため、0.45 で開いていたシートが `.large` に広がってしまう（設計書 §3）。
		//
		// 日付と持ち株でシートを2枚に分けない。シートは1枚しか出せないのに、
		// 0.45 の間は裏を操作できる（下の `presentationBackgroundInteraction`）ため、
		// 日付のシートを開いたままツールバーの「持ち株」を押せてしまう。
		// 1枚の中身を入れ替える形にすれば、2枚目を出す要求そのものが起きない
		.sheet(isPresented: sheetIsShown) {
			// 高さの指定は if の外側に置く。内側だと、閉じるときに selectedDay が
			// nil になった時点で消えていくシートから指定が外れる
			Group {
				if isPickingHoldings {
					HoldingsView(stocks: stocks, holdings: savedHoldings)
				} else if let selectedDay {
					DaySheet(
						date: selectedDay,
						events: EventLayout.events(
							on: EventLayout.key(for: selectedDay), from: shown)
					)
				}
			}
			.presentationDetents([.fraction(0.45), .large], selection: $sheetHeight)
			// 0.45 まで下げている間は裏を操作できる。
			// これでシートを開いたまま別の日付をタップできる（全体設計書 §10.1）
			.presentationBackgroundInteraction(.enabled(upThrough: .fraction(0.45)))
		}
	}

	/// 日が選ばれているか、持ち株を選んでいる間はシートを出す。閉じられたら両方消す
	private var sheetIsShown: Binding<Bool> {
		Binding(
			get: { isPickingHoldings || selectedDay != nil },
			set: {
				if !$0 {
					isPickingHoldings = false
					selectedDay = nil
				}
			})
	}

	/// 選んだ持ち株。書き込むと同時に端末へ保存する。
	/// 保存を通らずに持ち株が変わる経路を作らないため、書き込み口はこれ1つにする
	private var savedHoldings: Binding<[Int]> {
		Binding(
			get: { holdings },
			set: {
				holdings = $0
				store.save($0)
			})
	}

	private func load() async {
		do {
			// 2本を1回で受け取る。片方が失敗すると代入に届かないので、
			// 銘柄一覧が無いまま絞ったふりのカレンダーを描くことがない
			async let events = APIClient().events(token: token)
			async let stocks = APIClient().stocks()
			(self.events, self.stocks) = try await (events, stocks)
			// 再試行で取れたら文言を消す
			message = nil
		} catch APIError.unauthorized {
			onUnauthorized()
		} catch {
			// 銘柄一覧が落ちた場合もここに来る。片方だけ落ちても画面には何も出ないため、
			// 文言はイベントに限定しない
			message = "イベントと銘柄を取得できませんでした"
		}
	}
}

/// 1か月ぶんのページ。月の表題・月サマリ・曜日ヘッダ・6週×7列のグリッド
private struct MonthPage: View {
	let monthStart: Date
	let today: Date
	let events: [Event]
	let onSelect: (Date) -> Void

	var body: some View {
		let summary = EventLayout.summary(forMonthOf: monthStart, from: events)

		VStack(spacing: 4) {
			Text(EventLayout.title(for: monthStart))
				.font(.headline)

			// グリッドを読む前に「今月は荒れるか」に答える（全体設計書 §10.2）
			Text("\(summary.total)件 ・ ★3が\(summary.importantCount)件")
				.font(.caption)
				.foregroundStyle(.secondary)

			HStack(spacing: 0) {
				ForEach(EventLayout.weekdayNames, id: \.self) { name in
					Text(name)
						.font(.caption2)
						.foregroundStyle(.secondary)
						.frame(maxWidth: .infinity)
				}
			}

			// 6週を等分するので、どの月も同じ高さになる（設計書 §2 判断6）
			ForEach(Array(EventLayout.weeks(inMonthOf: monthStart).enumerated()), id: \.offset) {
				_, week in
				HStack(spacing: 0) {
					ForEach(week, id: \.self) { day in
						let isInMonth = EventLayout.calendar.isDate(
							day, equalTo: monthStart, toGranularity: .month)
						let cell = DayCell(
							day: day,
							isInMonth: isInMonth,
							isToday: EventLayout.calendar.isDate(day, inSameDayAs: today),
							events: EventLayout.events(on: EventLayout.key(for: day), from: events)
						)
						// 埋め草（月外の日）はイベントを出していないのでタップも受けない（設計書 §3）。
						// onTapGesture ではなく Button にするのは、押せる要素だと
						// VoiceOver に伝わるようにするため
						if isInMonth {
							Button { onSelect(day) } label: { cell }
								.buttonStyle(.plain)
						} else {
							cell
						}
					}
				}
				.frame(maxHeight: .infinity)
			}
		}
		.padding(.horizontal, 4)
		.padding(.bottom, 8)
	}
}

/// 日付タップで開くシート。その日の全件を出す。
/// セルで `+N` に省略された分も、セルには出さない正式名称と★の実数もここに出る（全体設計書 §10.2）
private struct DaySheet: View {
	let date: Date
	let events: [Event]

	var body: some View {
		NavigationStack {
			List {
				if events.isEmpty {
					Text("イベントはありません").foregroundStyle(.secondary)
				} else {
					ForEach(events, id: \.id) { event in
						row(for: event)
					}
				}
			}
			.listStyle(.plain)
			.navigationTitle(EventLayout.dayTitle(for: date))
			.navigationBarTitleDisplayMode(.inline)
		}
	}

	private func row(for event: Event) -> some View {
		VStack(alignment: .leading, spacing: 4) {
			HStack(spacing: 6) {
				// セル上は「★3か否か」の2値だが、シートでは実数を出す（全体設計書 §10.2）。
				// 1〜3 に収めるのは、String(repeating:count:) が負の数で落ちるため。
				// openapi.yaml は 1〜3 と書いているが、生成コードは範囲を検査しない
				Text(String(repeating: "★", count: min(max(event.importance, 0), 3)))
					.font(.caption)
					.foregroundStyle(.orange)
				Text(event.shortLabel)
					.font(.caption)
					.foregroundStyle(EventLayout.color(for: event.kind))
				if let time = event.time {
					Text(time).font(.caption).foregroundStyle(.secondary)
				}
			}
			Text(event.title)
			if let note = event.note {
				Text(note).font(.caption).foregroundStyle(.secondary)
			}
			// 出典の記載を条件とする出典を使うために、利用者に見える形で出す
			// （全体設計書 §5.1）。source が無い行には何も出さない
			if let source = event.source {
				// URLとして読めないときも名前だけは出す。リンクごと消すと、
				// 出典を出していないのと同じ状態が静かにできてしまう
				if let url = URL(string: source.url) {
					Link(destination: url) {
						Text("出典: \(source.name)").font(.caption)
					}
				} else {
					Text("出典: \(source.name)")
						.font(.caption)
						.foregroundStyle(.secondary)
				}
			}
		}
		.padding(.vertical, 2)
	}
}

/// 1日ぶんのセル
private struct DayCell: View {
	let day: Date
	/// 表示中の月の日か。42セルの前後の埋め草は日番号だけ出す（設計書 §2 判断9）
	let isInMonth: Bool
	let isToday: Bool
	let events: [Event]

	/// セルに出すのは2件まで（全体設計書 §10.2）
	private static let visibleCount = 2

	var body: some View {
		VStack(alignment: .leading, spacing: 1) {
			dayNumber
			if isInMonth {
				ForEach(events.prefix(Self.visibleCount), id: \.id) { event in
					label(for: event)
				}
				if events.count > Self.visibleCount {
					Text("+\(events.count - Self.visibleCount)")
						.font(.system(size: 9))
						.foregroundStyle(.secondary)
				}
			}
			Spacer(minLength: 0)
		}
		.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
		// これが無いとタップが効くのは描かれた文字の上だけになり、
		// イベントの無い日は日番号の16ptしか押せない
		.contentShape(Rectangle())
		.accessibilityElement(children: .combine)
	}

	private var dayNumber: some View {
		Text("\(EventLayout.calendar.component(.day, from: day))")
			.font(.caption2)
			.foregroundStyle(isInMonth ? Color.primary : Color.secondary)
			.frame(width: 16, height: 16)
			.background {
				if isToday {
					Circle().fill(Color.accentColor.opacity(0.25))
				}
			}
	}

	/// ★3のラベルだけ左端に赤の細線と太字。★1・★2に差はつけない（全体設計書 §10.2）
	private func label(for event: Event) -> some View {
		HStack(spacing: 1) {
			if event.importance == 3 {
				Rectangle().fill(Color.red).frame(width: 2)
			}
			Text(event.shortLabel)
				.font(.system(size: 9))
				.fontWeight(event.importance == 3 ? .bold : .regular)
				.foregroundStyle(EventLayout.color(for: event.kind))
				.lineLimit(1)
		}
		.frame(height: 12)
	}
}
