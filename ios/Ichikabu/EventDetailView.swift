import IchikabuAPI
import SwiftUI

/// ★の実数。セル上は「★3か否か」の2値だが、シートと詳細では実数を出す。
/// 1〜3 に収めるのは、String(repeating:count:) が負の数で落ちるため。
/// openapi.yaml は 1〜3 と書いているが、生成コードは範囲を検査しない
struct EventStars: View {
	let importance: Int

	var body: some View {
		Text(String(repeating: "★", count: min(max(importance, 0), 3)))
			.font(.captionRegular)
			.foregroundStyle(.orange)
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

	var body: some View {
		List {
			Section {
				VStack(alignment: .leading, spacing: Space.s6) {
					EventStars(importance: event.importance)
					Text(event.title).font(.title3Regular)
					Text(when).font(.captionRegular).foregroundStyle(.secondary)
				}
			}
			if let relation {
				Section("あなたの持ち株との関係") {
					Text(relation.sentence)
					ForEach(relation.stocks, id: \.id) { stock in
						VStack(alignment: .leading, spacing: Space.s2) {
							Text(stock.name)
							Text("\(stock.market.rawValue) \(stock.ticker)")
								.font(.captionRegular)
								.foregroundStyle(.secondary)
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
		.navigationBarTitleDisplayMode(.inline)
	}

	/// 日付（期間なら終わりまで）と時刻
	private var when: String {
		var text = dateText(event.startDate)
		if let end = event.endDate, end != event.startDate {
			text += " 〜 \(dateText(end))"
		}
		if let time = event.time { text += " \(time)" }
		return text
	}

	/// `2026-09-16` を `9月16日 (水)` にする。読めなければそのまま出す
	private func dateText(_ key: String) -> String {
		let parts = key.split(separator: "-").compactMap { Int($0) }
		guard parts.count == 3,
			let date = EventLayout.calendar.date(
				from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
		else { return key }
		return EventLayout.dayTitle(for: date)
	}
}
