import IchikabuAPI
import SwiftUI

/// ★の実数。セル上は「★3か否か」の2値だが、シートと詳細では実数を出す。
/// 1〜3 に収めるのは、String(repeating:count:) が負の数で落ちるため。
/// openapi.yaml は 1〜3 と書いているが、生成コードは範囲を検査しない
struct EventStars: View {
	let importance: Int

	var body: some View {
		let count = min(max(importance, 0), 3)
		Text(String(repeating: "★", count: count))
			.font(.captionRegular)
			.foregroundStyle(.orange)
			.accessibilityLabel("重要度\(count)")
	}
}

/// 出典の1行。URLとして読めないときも名前だけは出す。
/// リンクごと消すと、出典を出していないのと同じ状態が静かにできてしまう
struct EventSourceView: View {
	let source: Event.sourcePayload

	var body: some View {
		if let url = URL(string: source.url) {
			Link(destination: url) {
				Text("出典: \(source.name)").font(.captionRegular)
			}
		} else {
			Text("出典: \(source.name)")
				.font(.captionRegular)
				.foregroundStyle(.secondary)
		}
	}
}

/// 「これから来るイベント」の1行。押すと詳細へ進む。銘柄の画面とテーマの画面が同じ作りで使う。
/// 詳細に渡す関係の文は、登録した銘柄とテーマの一覧から、ここで引く
struct UpcomingEventLink: View {
	let event: Event
	let today: Date
	@Environment(AppData.self) private var data

	var body: some View {
		NavigationLink {
			EventDetailView(
				event: event,
				relation: EventLayout.relationDetail(
					of: event, holdings: data.holdings, watching: data.watching, stocks: data.stocks, themes: data.themes))
		} label: {
			VStack(alignment: .leading, spacing: Space.s4) {
				HStack(spacing: Space.s6) {
					EventStars(importance: event.importance)
					Text(EventLayout.whenText(startDate: event.startDate, endDate: event.endDate, time: event.time, today: today))
						.font(.captionRegular)
						.foregroundStyle(.secondary)
				}
				Text(event.title)
			}
		}
	}
}

/// イベントの詳細。日付のシートの行を押すと開く。
/// 行には出さない、なぜ登録した銘柄に関係するかの文とメモを出す
struct EventDetailView: View {
	let event: Event
	/// 関係の文と関係する銘柄。nil なら見出しごと出さない
	let relation: EventLayout.RelationDetail?
	@Environment(AppData.self) private var data

	/// 日付に年を付けるかの基準。`CalendarView` の `today` と同じく、作ったときに1回だけ取る
	@State private var today = Date()

	var body: some View {
		List {
			Section {
				VStack(alignment: .leading, spacing: Space.s6) {
					EventStars(importance: event.importance)
					Text(event.title).font(.title3Regular).accessibilityAddTraits(.isHeader)
					Text(EventLayout.whenText(startDate: event.startDate, endDate: event.endDate, time: event.time, today: today)).font(.captionRegular).foregroundStyle(.secondary)
				}
			}
			if let relation {
				Section(relation.isRegistered ? "あなたの銘柄との関係" : "このイベントの対象") {
					Text(relation.sentence)
					ForEach(relation.stocks, id: \.id) { stock in
						NavigationLink {
							StockView(stock: stock)
						} label: {
							HStack {
								StockLabel(stock: stock)
								Spacer()
								// 色だけで示さず、文字で出す
								if let registration = data.registration(of: stock.id) {
									Text(registration.label).font(.captionRegular).foregroundStyle(.secondary)
								}
							}
							.accessibilityElement(children: .combine)
						}
					}
					// テーマのイベントは、そのテーマの画面へ進める。名前を引けないときは行ごと出さない
					if case .theme(let target) = event.target,
						let theme = data.themes.first(where: { $0.id == target.themeId })
					{
						NavigationLink {
							ThemeView(theme: theme)
						} label: {
							Text("テーマ: \(theme.name)")
						}
					}
				}
			}
			if let note = event.note {
				Section("メモ") { Text(note) }
			}
			if let source = event.source {
				Section("出典") { EventSourceView(source: source) }
			}
		}
		.listStyle(.plain)
		.navigationBarTitleDisplayMode(.inline)
	}
}
