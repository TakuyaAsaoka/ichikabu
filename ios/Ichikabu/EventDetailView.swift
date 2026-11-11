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

/// イベントの詳細。日付のシートの行を押すと開く。
/// 行には出さない、なぜ持ち株に関係するかの文とメモを出す
struct EventDetailView: View {
	let event: Event
	/// 関係の文と持ち株。nil なら見出しごと出さない
	let relation: EventLayout.RelationDetail?

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
				Section(relation.isHeld ? "あなたの持ち株との関係" : "このイベントの対象") {
					Text(relation.sentence)
					ForEach(relation.stocks, id: \.id) { stock in
						NavigationLink {
							StockView(stock: stock)
						} label: {
							VStack(alignment: .leading, spacing: Space.s2) {
								Text(stock.name)
								Text("\(stock.market.rawValue) \(stock.ticker)")
									.font(.captionRegular)
									.foregroundStyle(.secondary)
							}
							.accessibilityElement(children: .combine)
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
