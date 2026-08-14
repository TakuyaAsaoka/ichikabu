# iOS の画面を目視で確認する

`xcodebuild build test` は型と計算しか見ない。見た目を確かめるにはシミュレータで動かす。

## 手動でやる

```bash
cd server && pnpm dev              # APIを立てる。iOS は http://localhost:3000 を見る
xcrun simctl boot "iPhone 17"      # これでシミュレータのウィンドウが開く
open -a Simulator                  # 前面に出す
```

あとは Xcode で Run する。ビルド済みの `.app` があるなら次でも入る。

```bash
xcrun simctl install booted <パス>/Ichikabu.app
xcrun simctl launch booted com.takuyaasaoka.ichikabu
```

サインインの情報は `server/.env.local` の `SEED_USERS` の1人目。

## ウィンドウが開かないとき

**`xcrun simctl boot` を先に実行する。** ウィンドウを開くのはこのコマンドで、`open -a Simulator` ではない。既に起動している Simulator.app に `open -a` を重ねても、アプリが前面に来るだけでデバイスのウィンドウは開かない。

確かめ方。

```bash
osascript -e 'tell application "System Events" to tell application process "Simulator" to get count of windows'
```

`0` ならウィンドウが無い。`boot` が済んでいるかを `xcrun simctl list devices booted` で見る。

この結果が `0` でも権限の問題とは限らない。権限を切り分けるなら、ウィンドウを持っている別のアプリで同じことを試す（`Google Chrome` 等）。そちらが `1` 以上を返すなら権限は足りている。

## 画面を操作する

`xcrun simctl` にタップの手段は無い。`System Events` の `click at` も Simulator には効かない（`-25204`）。macOS の `CGEventPost` を直接呼ぶ。

```python
import ctypes, ctypes.util, time

lib = ctypes.cdll.LoadLibrary(ctypes.util.find_library("ApplicationServices"))

class CGPoint(ctypes.Structure):
    _fields_ = [("x", ctypes.c_double), ("y", ctypes.c_double)]

lib.CGEventCreateMouseEvent.restype = ctypes.c_void_p
lib.CGEventCreateMouseEvent.argtypes = [ctypes.c_void_p, ctypes.c_uint32, CGPoint, ctypes.c_uint32]
lib.CGEventPost.argtypes = [ctypes.c_uint32, ctypes.c_void_p]

def post(kind, x, y):          # 5=移動 1=左押す 2=左離す 6=左ドラッグ
    e = lib.CGEventCreateMouseEvent(None, kind, CGPoint(x, y), 0)
    lib.CGEventPost(0, e)
    lib.CFRelease(e)
```

文字の入力は `osascript -e 'tell application "System Events" to keystroke "..."'` でよい。

**クリックの前に必ず前面へ上げる。** 手前に別のウィンドウがあると、そちらがクリックを受け取る。`activate` だけでは上がらないことがあるので `AXRaise` も送る。

```bash
osascript -e 'tell application "Simulator" to activate' \
  -e 'delay 0.6' \
  -e 'tell application "System Events" to tell application process "Simulator" to perform action "AXRaise" of window 1'
```

## 座標の求め方

**`screencapture` でウィンドウの矩形を撮り、その画像から読む。** 画像の座標に矩形の原点を足すと画面座標になる（1対1で対応する）。

```bash
osascript -e 'tell application "System Events" to tell application process "Simulator" to get {position, size} of window 1'
# → 761, 79, 456, 972
screencapture -x -R 761,79,456,972 win.png
```

`xcrun simctl io booted screenshot` で撮った画像から逆算してはいけない。あちらはデバイスの画面だけで、ウィンドウの枠とタイトルバーが入らないため、換算するとずれる（実際にY方向へ43pxずれた）。
