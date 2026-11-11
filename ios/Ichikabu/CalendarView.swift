import IchikabuAPI
import SwiftUI

/// メイン画面。等高の月グリッドを横スワイプで送る。
/// 金融・投資のアプリは日付順の一覧ばかりで、月グリッドを主画面にした例は見つからなかった。
/// それを承知のうえで月グリッドを選んだ。
/// セル幅の狭さと1日3件以上の日は、短縮ラベル・2件までの表示・日付のシートで補う
struct CalendarView: View {
	@Environment(AppData.self) private var data
	/// 起動月を0として、何ヶ月ずれた月を見ているか
	@State private var monthOffset = 0

	/// 持ち株を選ぶ画面を出しているか
	@State private var isPickingHoldings = false

	/// ページの基準になる日。`@State` にすることで初期化が1回だけになり、
	/// 親の `body` が再評価されても（`let` と違って）値が変わらない
	@State private var today = Date()

	/// タップされた日。nil の間はシートを出さない
	@State private var selectedDay: Date?

	/// シートの高さ。日付は 0.45、持ち株の一覧は狭いので `.large` で開く。
	/// 高さの候補（`presentationDetents` に渡す集合）は変えずに、選ぶほうだけを変える。
	/// 集合を出し分けると、閉じている最中に候補が入れ替わることになる
	@State private var sheetHeight: PresentationDetent = .fraction(0.45)

	/// 起動月の前後12ヶ月
	private static let monthRange = -12...12

	var body: some View {
		let shown = data.visibleEvents
		// シートの持ち株の一覧へ渡す Binding。書き込むと AppData が端末へ保存する
		@Bindable var data = data

		NavigationStack {
			VStack(spacing: 0) {
				// 案内は TabView の外に置く。中に入れると前後12ヶ月の25ページに複製される
				if data.holdings.isEmpty {
					holdingsPrompt
				}
				// 失敗したらカレンダーを出さない。空のマスを残すと「予定が無い月」に見える（#202）。
				// 前に取れた値が AppData に残っていても、失敗中は出さない
				if data.failed {
					failure
				} else {
					grid(shown: shown)
				}
			}
			.navigationBarTitleDisplayMode(.inline)
			.toolbar {
				// 常に見える入り口。持ち株を選んだあとも選び直せるようにする
				ToolbarItem(placement: .topBarTrailing) {
					Button("持ち株") { showHoldings() }
				}
			}
		}
		// `.sheet(item:)` ではなく `isPresented` で出す。item だと日付が変わるたびに
		// シートを出し直すため、0.45 で開いていたシートが `.large` に広がってしまう。
		//
		// 日付と持ち株でシートを2枚に分けない。シートは1枚しか出せないのに、
		// 0.45 の間は裏を操作できる（下の `presentationBackgroundInteraction`）ため、
		// 日付のシートを開いたままツールバーの「持ち株」を押せてしまう。
		// 1枚の中身を入れ替える形にすれば、2枚目を出す要求そのものが起きない。
		//
		// カレンダーではなくここに付けるのは、取得に失敗してカレンダーが無い間も
		// 持ち株の一覧を開けるようにするため
		.sheet(isPresented: sheetIsShown) {
			// 高さの指定は if の外側に置く。内側だと、閉じるときに selectedDay が
			// nil になった時点で消えていくシートから指定が外れる
			Group {
				if isPickingHoldings {
					HoldingsView(stocks: data.stocks, holdings: $data.holdings)
				} else if let selectedDay {
					DaySheet(
						date: selectedDay,
						events: EventLayout.events(
							on: EventLayout.key(for: selectedDay), from: shown),
						holdings: data.holdings,
						stocks: data.stocks,
						themes: data.themes
					)
				}
			}
			.presentationDetents([.fraction(0.45), .large], selection: $sheetHeight)
			// 0.45 まで下げている間は裏を操作できる。
			// これでシートを開いたまま別の日付をタップできる
			.presentationBackgroundInteraction(.enabled(upThrough: .fraction(0.45)))
		}
		.task {
			await data.load()
		}
	}

	/// 持ち株を選ぶ画面を出す
	private func showHoldings() {
		sheetHeight = .large
		isPickingHoldings = true
	}

	/// その日のイベントのシートを出す。
	/// 高さを 0.45 に戻すのは、持ち株の一覧で `.large` にしたまま日付を開くと
	/// カレンダーが隠れ、続けて別の日付をタップできなくなるため
	private func showDay(_ day: Date) {
		sheetHeight = .fraction(0.45)
		selectedDay = day
	}

	/// 持ち株を1つも選んでいないときの案内。選ぶまで消えない。
	/// この状態でいちばんしてほしいのは持ち株を選ぶことなので、塗ったボタンにして
	/// 右上の「持ち株」より強く見せる（#194）
	private var holdingsPrompt: some View {
		HStack {
			Text("持ち株が未選択です").font(.captionRegular)
			Spacer()
			// 文字は本文の大きさのままにする。小さくすると押せる高さがさらに縮む
			Button("持ち株を選ぶ") { showHoldings() }
				.buttonStyle(.prominent)
		}
		.padding(.horizontal, 12)
		.padding(.vertical, 6)
		.frame(maxWidth: .infinity)
		.background(Color.yellow.opacity(0.25))
	}

	/// 取得に失敗したときに、カレンダーの代わりに出す画面
	@ViewBuilder
	private var failure: some View {
		if data.isLoading {
			ProgressView("取得しています")
				.frame(maxWidth: .infinity, maxHeight: .infinity)
		} else {
			ContentUnavailableView {
				Label("イベントと銘柄を取得できませんでした", systemImage: "wifi.slash")
			} description: {
				Text("通信できる状態か確かめて、もう一度お試しください。")
			} actions: {
				// `.task` は画面が出たときの1回しか走らないため、押して取り直せるようにする。
				// これが無いと復旧はアプリの再起動だけになる
				Button("再試行") { Task { await data.load() } }
					.buttonStyle(.prominent)
			}
		}
	}

	private func grid(shown: [Event]) -> some View {
		TabView(selection: $monthOffset) {
			ForEach(Self.monthRange, id: \.self) { offset in
				MonthPage(
					monthStart: EventLayout.month(offset: offset, from: today),
					today: today,
					events: shown,
					// 受け取る前は件数を出さない。0件かどうかは分かっていない（#194）
					showsSummary: data.loaded,
					onSelect: { showDay($0) }
				)
				.tag(offset)
			}
		}
		.tabViewStyle(.page(indexDisplayMode: .never))
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
}

/// 1か月ぶんのページ。月の表題・月サマリ・曜日ヘッダ・6週×7列のグリッド
private struct MonthPage: View {
	let monthStart: Date
	let today: Date
	let events: [Event]
	/// 月の件数の行を出すか。受け取る前は出さない
	let showsSummary: Bool
	let onSelect: (Date) -> Void

	var body: some View {
		let summary = EventLayout.summary(forMonthOf: monthStart, from: events)

		VStack(spacing: Space.s4) {
			Text(EventLayout.title(for: monthStart))
				.font(.headlineRegular)

			// グリッドを読む前に「今月は荒れるか」に答える
			if showsSummary {
				Text("\(summary.total)件 ・ ★3が\(summary.importantCount)件")
					.font(.captionRegular)
					.foregroundStyle(.secondary)
			}

			HStack(spacing: 0) {
				ForEach(EventLayout.weekdayNames, id: \.self) { name in
					Text(name)
						.font(.caption2Regular)
						.foregroundStyle(.secondary)
						.frame(maxWidth: .infinity)
				}
			}

			// 6週を等分するので、どの月も同じ高さになる
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
						// 埋め草（月外の日）はイベントを出していないのでタップも受けない。
						// onTapGesture ではなく Button にするのは、押せる要素だと
						// VoiceOver に伝わるようにするため
						if isInMonth {
							Button { onSelect(day) } label: { cell }
								.buttonStyle(.bare)
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
/// セルで `+N` に省略された分も、セルには出さない正式名称と★の実数もここに出る。
/// 行を押すと、なぜ持ち株に関係するかを文で読める詳細へ進む
private struct DaySheet: View {
	let date: Date
	let events: [Event]
	let holdings: [Int]
	let stocks: [Stock]
	let themes: [Theme]

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
		// 詳細を開いたまま裏のカレンダーで別の日を押したとき、前の日の詳細を残さず
		// その日の一覧に戻す。日付が変わると NavigationStack ごと作り直される。
		// 同じ日付をもう一度押したときは変わらないので、詳細のまま残る
		.id(date)
	}

	private func row(for event: Event) -> some View {
		// 行に押せるものを2つ置くと、片方を押して両方が動くことがある。行は NavigationLink 1つにし、
		// 押せる出典のリンクは詳細にだけ置く
		NavigationLink {
			EventDetailView(
				event: event,
				relation: EventLayout.relationDetail(
					of: event, holdings: holdings, stocks: stocks, themes: themes))
		} label: {
			summary(of: event)
		}
		.padding(.vertical, 2)
	}

	private func summary(of event: Event) -> some View {
		VStack(alignment: .leading, spacing: Space.s4) {
			HStack(spacing: Space.s6) {
				EventStars(importance: event.importance)
				// 短縮ラベルは出さない。すぐ下の名称と同じことを示すため（#194）。
				// セルとの結び付きは、開いた日付の見出しが担う
				if let time = event.time {
					Text(time).font(.captionRegular).foregroundStyle(.secondary)
				}
			}
			Text(event.title)
			if let hint = EventLayout.relationHint(of: event, holdings: holdings, stocks: stocks) {
				Text(hint).font(.captionRegular).foregroundStyle(.secondary)
					// 市場の手がかりはそのまま読める。ほかは、何の名前かが分かるように添える
					.accessibilityLabel(spokenHint(hint, for: event))
			}
			// 出典の記載を条件とする出典を使っている（docs/reference/source-terms.md）ので、
			// 日付と名称が出るこの画面に名前を残す。押せるリンクは詳細に置く。
			// source が無い行には何も出さない
			if let source = event.source {
				Text("出典: \(source.name)").font(.captionRegular).foregroundStyle(.secondary)
			}
		}
	}

	private func spokenHint(_ hint: String, for event: Event) -> String {
		if case .market = event.target { return hint }
		return "関係する持ち株、\(hint)"
	}
}

/// 1日ぶんのセル
private struct DayCell: View {
	let day: Date
	/// 表示中の月の日か。42セルの前後の埋め草は日番号だけ出す。
	/// イベントまで出すと、前後の月のイベントが2つのページに現れ、月サマリの件数と合わなくなる
	let isInMonth: Bool
	let isToday: Bool
	let events: [Event]

	/// セルに出すのは2件まで
	private static let visibleCount = 2

	var body: some View {
		VStack(alignment: .leading, spacing: Space.s1) {
			dayNumber
			if isInMonth {
				ForEach(events.prefix(Self.visibleCount), id: \.id) { event in
					label(for: event)
				}
				if events.count > Self.visibleCount {
					Text("+\(events.count - Self.visibleCount)")
						.font(.cellLabel)
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
			.font(.caption2Regular)
			.foregroundStyle(isInMonth ? Color.primary : Color.secondary)
			.frame(width: 16, height: 16)
			.background {
				if isToday {
					Circle().fill(Color.accentColor.opacity(0.25))
				}
			}
	}

	/// ★3のラベルだけ左端に赤の細線と太字。★1・★2に差はつけない。
	/// セルの幅に★を3つは描けないため、セルでは「★3か否か」の2値にし、★の実数はシートに出す
	private func label(for event: Event) -> some View {
		HStack(spacing: Space.s1) {
			if event.importance == 3 {
				Rectangle().fill(Color.red).frame(width: 2)
			}
			Text(event.shortLabel)
				.font(.cellLabel)
				.fontWeight(event.importance == 3 ? .bold : .regular)
				.foregroundStyle(EventLayout.color(for: event.kind))
				.lineLimit(1)
		}
		.frame(height: 12)
	}
}
