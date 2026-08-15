/**
 * 公開API（`/api/events`・`/api/stocks`）が返すキャッシュのヘッダ
 * （公開APIのキャッシュ 設計書）。
 *
 * この2本は引数を取らず、誰が呼んでも同じ配列が返る（ログイン廃止 設計書 §5）。
 * だからCDNに載せられる。載せると2回目以降は関数が起動せず、
 * 1リクエストあたりの費用が17分の1になる。
 *
 * `Netlify-Vary` は書かない。`@netlify/plugin-nextjs` が毎回この見出しを
 * 自分で組み立て、こちらが書いた値は消されずに**足される**
 * （`dist/run/headers.js` の `setVaryHeaders`）。既定で
 * `query=__nextDataReq|_rsc` になっており、クエリ文字列は既に鍵から外れている。
 * ここに欄を足すと、その名前で鍵を割れる相手が増えるだけになる
 */
export const PUBLIC_API_CACHE_HEADERS = {
  // 端末には持たせない。管理UIで直した内容が、端末に残った古い写しのせいで
  // 出ないままになるのを避ける。キャッシュはCDNの1箇所だけに置く
  "Cache-Control": "public, max-age=0, must-revalidate",
  // CDNは5分保つ。管理UIで直してから端末に出るまでの遅れになる。
  // 期限が切れたあとの10分は古い写しを返しつつ裏で取り直すので、
  // 期限切れの1回目に当たった利用者を待たせない。
  //
  // `durable` を自分で書く。`@netlify/plugin-nextjs` は自動で足すが、
  // 足す3か所とも「応答が `netlify-cdn-cache-control` を持っていないこと」を
  // 条件にしている（`dist/run/headers.js`）。こちらが書いた時点で1つも通らない。
  // 無いとエッジの1台ごとに写しが要り、写しの無い台に当たるたび関数が起動する
  "Netlify-CDN-Cache-Control":
    "public, durable, s-maxage=300, stale-while-revalidate=600",
};
