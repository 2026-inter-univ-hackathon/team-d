> **9/24（木）12:00 のコード提出では、この README を埋めた状態で出してください。**
> **「どう開発したか」は 9/24 の審査で見られます。** 埋めておくと、そのままピッチの材料になります。

# （プロダクト名）

（一言で何か。1行で書く）

## 何を作ったか

（誰の・何が・どう解決されるのか。3〜5行）

## 使った技術

- HTML / CSS / JavaScript（素のまま）
- Firebase Authentication
- Cloud Firestore
- Firebase App Check
- GitHub Pages

予定はログインしたユーザーごとにCloud Firestoreへ保存します。

## どう開発したか

**9/4 にやったこと**

- 前半は **ペアプログラミング**（ドライバーとナビの2人で書き、10分で交代）
- 後半は役割を固定して仕上げ

**開発期間（9/5〜9/24）にやったこと**

- （ブランチの切り方、PR のレビュー、詰まったときにどうしたか。3〜5行）

> **コミット履歴や PR のスクリーンショットを1枚貼ってください。**
> 口で言うより、**残っている記録がそのまま証拠になります。**

## 動かし方

Python 3がある環境で、次のコマンドを実行します。追加ライブラリのインストールは不要です。

```bash
python3 scripts/run_local.py
```

Windowsでは `py scripts\run_local.py` を実行します。起動後、ブラウザで `http://127.0.0.1:8080/login.html` を開きます。

## AI に任せなかった部分

（最後の判断を人が持つようにした場所と、その理由）

## チーム

| 名前 | 大学 |
| --- | --- |
|  |  |

## 旧Django・SQLite版

以前のDjango・SQLite版の記録は、[Django・SQLite版の説明](docs/DJANGO_SETUP.md)を参照してください。現在の画面はDjangoを使用しません。

## Firebase・GitHub Pages版

現在のFirebase Authentication・Cloud Firestore構成と、GitHub Pages用ファイルの生成方法は、[Firebase・GitHub Pages版の説明](docs/FIREBASE_SETUP.md)を参照してください。
