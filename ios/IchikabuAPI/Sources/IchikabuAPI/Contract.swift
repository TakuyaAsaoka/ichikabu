// このターゲットの中身は openapi.yaml から生成される。
// ただし SwiftPM は Swift ファイルが1つも無いターゲットをエラーにするため、
// 生成された型に短い別名を付けるこのファイルを置いている。
//
// ここは SwiftPM の要求を満たすための最小限にとどめる。生成された型は原則そのまま使う。
// 別名を並べていくと、契約が変わるたびにこのファイルも直す二重作業になる。
// **アプリが叩かない経路の型には別名を付けない。** `GET /api/health` がそうで、
// 叩くのは配信先を確かめる人（curl と iPhone のブラウザ。→ docs/guides/deploy.md §7）。

/// `GET /api/events` が返すイベント
public typealias Event = Components.Schemas.Event

/// `GET /api/stocks` が返す銘柄
public typealias Stock = Components.Schemas.Stock
