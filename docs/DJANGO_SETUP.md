# 助じゅ～る

> この文書はDjango・SQLite認証を使用していた旧構成の説明です。現在の画面はFirebase AuthenticationとCloud Firestoreへ接続します。現在の手順は[Firebase・GitHub Pages版の説明](FIREBASE_SETUP.md)を参照してください。

日時が決まっていない予定を未確定トレイに置き、決まったらカレンダーへドラッグして管理するアプリです。
`@example.com` のデモアカウントでログインし、自分の予定だけを保存・編集できます。

## 技術と仕様

- 画面: 既存の HTML / CSS / JavaScript（フロントのビルド不要）
- サーバー: Python / Django 5.2
- DB: SQLite（`db.sqlite3`。Docker・PostgreSQLの準備は不要）
- 認証: ユーザー名 + 固定の `@example.com` とパスワード。メール送信・メール認証・メールでのパスワード再設定は対象外
- パスワードは6文字以上。一般的なもの・数字のみ・ユーザー名と同じものも使用できます。
- パスワードはハッシュ化。セッションCookieとCSRF対策を使用
- 予定の読み取り・変更・削除はサーバー側で所有者を確認
- 別の画面の更新と競合した場合は上書きせずエラーを表示。最新の内容を確認して再操作
- 通知はブラウザで許可した場合のみ。アプリを開いている間・再表示時に確認するもので、バックグラウンド配信ではありません

## Macで起動する

Python 3.12以上を準備してください（開発・確認環境は3.14）。

1. このリポジトリの `start.command` をダブルクリックします。
2. 初回は仮想環境と必要なライブラリを用意します。初回のダウンロードにはネット接続が必要です。
3. DBが作成され、ブラウザで `http://127.0.0.1:8000/` が開きます。
4. 「新規登録」でユーザー名（例: `alice`）とパスワードを登録します。`alice@example.com` になります。
5. 終了するには起動したターミナルで `Ctrl+C` を押します。

Macの設定でダブルクリック実行できない場合は、ターミナルでプロジェクトへ移動し `bash start.command` を実行してください。ポート8000が使用中の場合は、既存の開発サーバーを終了するか、下記の手動起動で別のポートを指定してください。

## Mac・Linuxのターミナルで起動する

リポジトリのルート（`manage.py` があるフォルダ）で実行します。

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

ブラウザで `http://127.0.0.1:8000/` を開きます。別のポートを使う場合は `python manage.py runserver 8001` です。

設定を変える場合は `.env.example` を `.env` にコピーして編集します。`start.command` は `.env` がない場合、ローカル用のランダムな秘密鍵を含む `.env` を作ります。

## Windowsで起動する（PowerShell）

### 初回の準備

Python 3.12以上を用意してください（開発・確認環境は3.14）。未インストールの場合は[Python公式サイト](https://www.python.org/downloads/windows/)から導入し、PowerShellを開き直します。

エクスプローラーでリポジトリのフォルダを開き、アドレスバーに `powershell` と入力してEnterを押します。`manage.py` と `requirements.txt` があるフォルダで、以下を1行ずつ実行してください。エラーが出た場合は、その行を解決してから次へ進みます。

```powershell
py --version
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe manage.py migrate
.\.venv\Scripts\python.exe manage.py runserver
```

`py --version` で3.12以上と表示されることを確認してください。`py` が見つからず `python --version` は動く場合は、先頭2行の `py` を `python` に置き換えます。

`Starting development server at http://127.0.0.1:8000/` と表示されたら、ブラウザで **http://127.0.0.1:8000/** を開きます。起動中はPowerShellを開いたままにしてください。

「新規登録」でユーザー名（例: `alice`）と6文字以上のパスワードを入力します。`@example.com` は画面に固定表示されるため、入力不要です。SQLiteのDBは自動で作られ、Dockerや別のDBソフトの準備は不要です。

この手順では仮想環境内の `python.exe` を直接指定するため、`Activate.ps1` の実行やPowerShellの実行ポリシー変更は不要です。[Python公式の仮想環境の説明](https://docs.python.org/3/library/venv.html#how-venvs-work)

### 2回目以降の起動・終了

同じフォルダでPowerShellを開き、次を実行します。

```powershell
.\.venv\Scripts\python.exe manage.py runserver
```

終了は **Ctrl+C** です。再起動する場合は、停止後に同じコマンドを実行します。停止しても登録済みのアカウント・予定は `db.sqlite3` に残ります。

Gitから更新を取得し、依存ライブラリやDBの構造が変更された場合は、サーバーを停止してから以下を実行し、再起動してください。

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe manage.py migrate
.\.venv\Scripts\python.exe manage.py runserver
```

### よくある問題

| 状況 | 対応 |
|---|---|
| `manage.py` や `requirements.txt` が見つからない | `Get-Location` と `Get-ChildItem` で現在地を確認し、両方のファイルがあるフォルダへ移動してください。 |
| `.venv\Scripts\python.exe` が見つからない | Windows上で `py -m venv .venv` を実行してください。Macの `.venv` をコピーして使うことはできません。 |
| `No module named django` | `.\.venv\Scripts\python.exe -m pip install -r requirements.txt` を実行してください。 |
| `no such table` | サーバーを停止し、`.\.venv\Scripts\python.exe manage.py migrate` を実行してください。 |
| ポート8000が使用中 | `.\.venv\Scripts\python.exe manage.py runserver 8001` で起動し、`http://127.0.0.1:8001/` を開いてください。 |
| `start.command` が開けない | `start.command` はMac用です。Windowsでは上記のPowerShell手順を使います。 |

`index.html` のダブルクリックではなく、起動したDjangoのURLをブラウザで開いてください。
この手順は既存コードとPython公式資料に基づいて記載しており、Windows実機での起動確認は未実施です。

## 予定の使い方

1. トレイに予定を追加します。
2. 月カレンダー・タイムラインへドラッグして日付・時刻を指定します。
3. 予定をクリックし、タイトル・メモ・所要時間・ステータスを編集して保存します。
4. タイムラインでは予定ブロック下端のドラッグでも所要時間を変更できます。
5. 「日時をクリア」でトレイへ戻せます。

日付・時刻は日本時間、時刻・所要時間は1時間単位です。予定が24時を超える場合は、その日の残り時間に所要時間を短縮します。
保存結果は画面上部に表示します。通信失敗時は「予定を再読み込み」で復帰できます。DBに反映済みなのに応答だけ失われる場合もあるため、再追加前に最新の予定を確認してください。

## 以前のlocalStorageの予定を取り込む

1. **以前と同じブラウザ・プロファイル・ファイルの場所**で `index.html` を直接開きます。
2. 「予定をJSONに書き出す」を押します。元のlocalStorageは削除しません。
3. Djangoのアプリを開いて対象のアカウントにログインします。
4. 「以前の予定を取り込む」でJSONを選び、件数を確認して「このアカウントに取り込む」を押します。

1回に1MB・1000件以内。同じアカウントに取り込み済みのIDはスキップします。データに不正がある場合は、ファイル全体の取り込みを取り消します。
ブラウザによって `file://` の保存先の扱いが異なるため、移動・名前変更したファイルからは以前のデータを読み出せない場合があります。以前GitHub Pagesで使っていたデータは、元のサイト側での書き出しが必要です。
`index.html` の直接起動は旧データの書き出し用です。ログインと予定編集にはDjango経由でアクセスしてください。

## チームで使う場合

各自のPCで起動すると、それぞれ別の `db.sqlite3` を使用します。同じサーバーへアクセスすれば、別のPCから同じアカウントの予定を開けます。別アカウントには予定を表示しません。
同じWi-Fiでの一時的なデモでは、サーバー役のPCの `.env` の `DJANGO_ALLOWED_HOSTS` にそのPCのLAN IPを追加し、`python manage.py runserver 0.0.0.0:8000` で起動します。各メンバーは `http://サーバー役のLAN-IP:8000/` を開きます。会場のネットワーク設定によっては端末同士の接続が制限されています。

これはローカル・デモ用構成です。公開する場合は永続ディスク、HTTPS、公開用サーバー設定、ログイン試行制限などを別途整えます。GitHub PagesではDjangoは動かないため、従来の静的公開ワークフローをテスト用CIに置き換えています。今回、外部への公開は行っていません。

## 確認コマンド

```bash
python manage.py check
python manage.py makemigrations --check --dry-run
python manage.py test
node --test tests/*.test.cjs
```

Node.jsはフロントの保存処理のテストにだけ使用します（Node 22以上）。アプリの起動には不要です。
テストは専用の一時DBを使い、手元の予定を変更しません。

手動では2つのアカウントを作り、ログイン切り替え、ドラッグ移動、詳細編集、リサイズ、削除、再ログイン後の保存状態を確認してください。ネット接続を切った際の保存エラーと再読み込みも確認できます。

## ファイルの役割

| 場所 | 役割 |
|---|---|
| `index.html` | カレンダー画面と操作処理 |
| `static/calendar-store.js` | API経由の保存・読み込み・失敗時の再同期 |
| `login/` | ユーザーモデル・登録・ログイン・ログアウト |
| `planner/` | 予定モデル・本人専用の予定API・JSON取り込み |
| `login/templates/login/auth.html` | 新規登録・ログイン画面 |
| `config/settings.py` | Django・SQLiteの設定 |
| `*/migrations/` | DBの構造を作成・更新する手順 |
| `start.command` | Mac用起動ファイル |

`.env`・`db.sqlite3`・`.venv` はGitに含めません。DBのバックアップが必要ならアプリを停止してから `db.sqlite3` を安全な場所にコピーしてください。予定とユーザーが保存されています。

## 人が判断する部分

予定を未確定・確定・完了にする判断は、利用者が詳細画面で選んで保存します。自動で状態は変更しません。
