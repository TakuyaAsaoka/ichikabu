# 出典の利用条件（原文）

[全体設計書](../records/specs/2026-08-02-1-ichikabu-design.md) §5.1 の出典表は、各出典の可否を**要約した文**で持っている。元のページが書き換わると判断の根拠が消えるため、条文そのものをここに残す。

**対象は §5.1 の表で「使う」になっている出典だけ。** 「使わない」と決めた出典（日銀・JPX・株探等）は、判断の要約が §5.1 にあり、実際に使っていないので原文が要る場面が無い。必要になったときに足す。各社のIRページも対象外で、条件が付かない出典なので条文が存在しない。

**引用の確からしさは出典ごとに違う。** 各節の「取得方法」を見ること。ページの取得に使った道具が要約を挟む場合があり、1文字まで同じだと目視で確かめたものと、そうでないものが混在している。

---

## 日本の府省（内閣府・総務省・財務省）

| 項目 | 内容 |
|---|---|
| 条文 | 公共データ利用規約（第1.0版）／デジタル庁 |
| URL | https://www.digital.go.jp/resources/open_data/public_data_license_v1.0 |
| 確認日 | 2026-08-11 |
| 取得方法 | ページ取得の道具（要約を挟む）。**下の引用は逐語であることを目視で確かめていない**。全文は上のURLを見ること |

内閣府のページ（https://www.cao.go.jp/notice/rule.html ）は、自身の利用条件として「公共データ利用規約（第1.0版）（デジタル庁）が適用される」と述べている。つまり条文の本体はデジタル庁にあり、府省はそれを採用している。§5.1 が「内閣府・総務省・財務省が同じ規約を採用していることを確認済み」と書いているのはこの構造を指す。

### 抜粋

> どなたでも以下の1.1.から1.7.に定める利用ルールに従って、複製、公衆送信、翻訳・変形等の翻案等、自由に利用できます。商用利用も可能です。

**1.1. 出典の記載について**

> 出典を記載してください。

編集・加工して利用する場合は、編集・加工等を行ったこと及びその主体を記載することが求められる。加工した情報を未加工のように示すことは禁じられている。

**1.2. 第三者の権利を侵害しないようにしてください**

> 第三者が著作権その他の権利を有しているものについては、特に権利処理済であることが明示されているものを除き、利用者の責任で、当該第三者から利用の許諾を得てください。

**1.6. 免責について**

> 国は、利用者が本コンテンツを用いて行う一切の行為について何ら責任を負うものではありません。

### 読み取った条件

| 項目 | 内容 |
|---|---|
| 商用 | 可（明記されている） |
| 条件 | 出典の記載 |
| 満たし方 | `event.source_name` と `event.source_url` に入れ、iOS のシートに出す（→ [出典表示設計書](../records/specs/2026-08-11-41-event-source-design.md)） |

### 総務省統計局の自前のページ

統計局はデジタル庁の規約を指すだけでなく、自分のページでも同じ趣旨を述べている。

| 項目 | 内容 |
|---|---|
| 条文 | サイトの利用について |
| URL | https://www.stat.go.jp/info/riyou.html |
| 確認日 | 2026-08-12 |
| 取得方法 | ページ取得の道具（要約を挟む）。**下の引用は逐語であることを目視で確かめていない**。全文は上のURLを見ること |

#### 抜粋

出典の記載を求める節（見出しの番号は原文のものか、道具が付けたものか区別が付かなかったため落とした）。

> コンテンツを利用する際は出典を記載してください。出典の記載方法は以下のとおりです。

出典の書き方の例として「出典：統計局ホームページ（URL）」、編集・加工して使う場合は「『統計データ』（統計局）（URL）をもとに作成」が挙げられている。

> 数値データ、単純な表・グラフは著作権の対象ではありませんので、本利用規約の適用はなく、自由に利用できます。

次の引用は途中を省いている（`…` の部分）。省かれた部分に条件が書かれていないかは確かめていない。

> 本利用規約は…クリエイティブ・コモンズ表示4.0国際（CC BY）と互換性があり、本利用規約が適用されるコンテンツはCC BYに従うことで利用できます。

**商用利用が可であることの引用は取れていない。** 道具が返したのは要約で、原文の一文として置けるものが無かった。上の CC BY 互換の記述から読み取っている（CC BY は商用利用を制限しない）。デジタル庁の公共データ利用規約（上記）には「商用利用も可能です」が原文で入っており、統計局はその規約を採用しているため、条件としては同じところに行き着く。

#### 読み取った条件

| 項目 | 内容 |
|---|---|
| 商用 | 可 |
| 条件 | 出典の記載 |
| ライセンス互換 | **CC BY 4.0 と互換**と明記されている |
| 公表予定そのものの扱い | **公表日という数値データは著作権の対象ではない**と読める。ただし条件を満たすほうが安全なので、他の出典と同じく出典の表示名を入れる |

### 公表予定の配信

| 項目 | 内容 |
|---|---|
| 確認日 | 2026-08-12 |
| 総務省統計局 | **XML を10本配信している**（`https://www.stat.go.jp/data/kouhyou/` 配下。一覧は [公表スケジュール](https://www.stat.go.jp/data/guide/3.html)）。消費者物価指数のもの（`e-stat_cpi.xml`）は中身を確認済みで、公表日・公表時刻・全国と東京都区部の区別が入っている。掲載は約16ヶ月先まで、公表時刻は 8:30 |
| 内閣府 ESRI（GDP速報） | **無い。** [公表予定](https://www.esri.cao.go.jp/jp/sna/kouhyou/kouhyou_top.html) は HTML の表のみ。**先6件しか載っていない**（1次・2次速報あわせて）。公表時刻は 8:50 |
| 財務省貿易統計 | **無い。** [公表予定](https://www.customs.go.jp/toukei/calendar/calend.htm) は HTML の表のみ。掲載は約16ヶ月先まで、公表時刻は 8:50 |

### プログラムからの取得

| 項目 | 内容 |
|---|---|
| 確認日 | 2026-08-12 |
| 確認したこと | 各サイトの `robots.txt` |
| `www.stat.go.jp` | `User-agent: *` と `Disallow: /library/opac/` の2行だけ。**公表予定の置き場（`/data/kouhyou/`）は対象外** |
| `www.esri.cao.go.jp` | **`robots.txt` が無い**（HTTP 404） |
| `www.customs.go.jp` | `Disallow:` が空＝全許可。`Sitemap:` も公開している |

**3つとも、取得を禁じる記述が見当たらなかった。** BLS（下記）とは正反対である。この結果を根拠に、全体設計書 §2.1 が「配信されている構造化データを読むのは可」と決めている。

ただし内閣府の「`robots.txt` が無い」は、**禁じていないことの証明ではない**。置いていないだけで、別の場所に方針が書かれている可能性は残る。内閣府は公表予定を配信しておらず §2.1 の条件1で対象外になるため、今のところ実害は無い。配信が始まったら、`robots.txt` 以外の場所も見て確かめ直す。

---

## FRB（連邦準備制度理事会）

| 項目 | 内容 |
|---|---|
| 条文 | Disclaimer の Copyright/trademark の節 |
| URL | https://www.federalreserve.gov/disclaimer.htm |
| 確認日 | 2026-08-11 |
| 取得方法 | ページ取得の道具（要約を挟む）。ただし下の1文目は、検索結果に出た同じ文と一致することを確かめた |

### 引用

> Unless otherwise indicated, information on Board's website is in the public domain and may be copied and distributed without permission. Please cite to the Board as the source of the information.

（特に断りのない限り、Board のサイトの情報はパブリックドメイン（誰でも自由に使える状態）であり、許可なく複製・配布できる。出所として Board を記載してほしい）

> For any photo, graphic, or other material that is identified as being associated with a non-Board (such as materials with a copyright or trademark) permission to copy and distribute such photo, graphic, or material must be obtained from the non-Board source.

（Board 以外に由来すると示されている写真・図版等については、その出所から許可を得ること）

### 読み取った条件

| 項目 | 内容 |
|---|---|
| 商用 | 除外する記述が無い（日銀と違う点） |
| 条件 | 出所として Federal Reserve Board を記載する |
| 例外 | 第三者に由来する写真・図版。日程の転記には関わらない |
| 日程の掲載場所 | https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm 。HTMLとPDFのみで、ICS・CSV等の機械で読める形は無い |

### プログラムからの取得

**確かめていない。** 公表予定を機械で読める形で配信していないため（上表）、全体設計書 §2.1 の条件1を満たさず、取得の可否を確かめても判断が変わらない。配信が始まったら確かめる。

---

## BLS（米労働統計局）

| 項目 | 内容 |
|---|---|
| 条文 | BLS Copyright Information |
| URL | https://www.bls.gov/opub/copyright-information.htm |
| 確認日 | 2026-08-11 |
| 取得方法 | **人がブラウザで開いて写した。** `bls.gov` はプログラムからのアクセスに HTTP 403 を返し、`robots.txt` すら取得できない。下の引用は画面からそのまま写したもの |

### 引用

> The Bureau of Labor Statistics (BLS) is a Federal government agency and everything that we publish, both in hard copy and electronically, is in the public domain, except for previously copyrighted photographs and illustrations. You are free to use our public domain material without specific permission, although we do ask that you cite the Bureau of Labor Statistics as the source.

（BLS は連邦政府機関であり、紙・電子を問わず刊行するものはすべてパブリックドメインである。ただし以前から著作権のある写真・イラストを除く。パブリックドメインの資料は特別な許可なく使ってよいが、出所として Bureau of Labor Statistics を記載してほしい）

> The public domain use of our materials includes linking to our website. You do not need to obtain special permission from the BLS to link to our site.

（リンクを張ることも自由で、特別な許可は要らない）

> The BLS emblem, and its variations, which are displayed on the BLS website, as well as on BLS publications and other BLS products, are federally registered trademarks. Unauthorized use of the BLS emblem is prohibited. All rights reserved.

（BLS のエンブレムとその変形は連邦の登録商標であり、無断使用は禁じられている）

### 読み取った条件

| 項目 | 内容 |
|---|---|
| 商用 | 除外する記述が無い |
| 条件 | 出所として Bureau of Labor Statistics を記載する |
| 例外1 | 以前から著作権のある写真・イラスト。日付の転記には関わらない |
| 例外2 | **エンブレムは登録商標。使わない**（企業ロゴを使わないのと同じ扱い → §5.1） |
| 日程の掲載場所 | CPI は https://www.bls.gov/schedule/news_release/cpi.htm 、雇用統計は https://www.bls.gov/schedule/news_release/empsit.htm |
| 機械で読める形 | **ICS を配信している**（https://www.bls.gov/schedule/news_release/bls.ics ）。ただし**プログラムからの取得は BLS が禁止している**（→ 下の「プログラムからの取得」） |

### プログラムからの取得

| 項目 | 内容 |
|---|---|
| 確認日 | 2026-08-11 |
| 確認したこと | ICS（https://www.bls.gov/schedule/news_release/bls.ics ）を `curl` で取得できるか |
| 結果 | **HTTP 403。** `curl` の既定の User-Agent でも、ブラウザと同じ User-Agent でも同じ。返ってきたのはエラー画面ではなく、下の方針文が書かれたページ |

> Automated retrieval programs (commonly called "robots" or "bots") can cause delays and interfere with other customers' timely access to information. Therefore, bot activity that doesn't conform to BLS usage policy is prohibited.

（自動で取りに行くプログラム（いわゆる「ロボット」「ボット」）は遅延を起こし、他の利用者が必要なときに情報を得るのを妨げうる。よって BLS の利用方針に沿わないボットの動きは禁止する）

**禁止されているのは取得方法だけで、中身の利用は上表のとおり自由である。** 人がブラウザで開いて写し、出所を書いて載せるのは条件を満たす。現に CPI・雇用統計の日程はその形で入れている（Issue #55）。

---

## 更新するとき

1. 条文のページを開き直す
2. 変わっていなければ確認日だけを新しくする
3. 変わっていれば、**古い引用を消さずに残し**、新しい引用を下に足して両方の確認日を書く。いつからいつまでどの条件だったかが分かる形にする
4. 条件が変わったら、全体設計書 §5.1 の表の可否と根拠も直す

**条文と一緒に、次の2つも開き直す。** どちらも条文ではないが、全体設計書 §2.1 の判断はこの2つに載っている。

| 見るもの | どこ |
|---|---|
| 公表予定の配信の有無（形・掲載期間・公表時刻） | 各出典の「公表予定の配信」の節 |
| プログラムからの取得の可否（`robots.txt` と利用条件） | 各出典の「プログラムからの取得」の節 |

変わっていたら、全体設計書 §5.1 の表だけでなく **§2.1 の当てはめ表**も直す。特に `robots.txt` は後から足されることがあり、今「無い」ものが「ある」に変わりうる。
