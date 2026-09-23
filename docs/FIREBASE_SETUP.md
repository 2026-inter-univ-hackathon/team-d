# Firebase・GitHub Pages版の設定と確認

現在の画面はFirebase Authenticationでログインし、Cloud Firestoreへユーザーごとの予定を保存します。GitHub Pagesへ公開するファイルは `dist/` に生成します。この手順では公開やpushは行いません。

## Firebase Consoleの設定

1. Webアプリを登録し、`apiKey`・`authDomain`・`projectId`・`appId` を `static/firebase-config.js` に設定します。
2. Authenticationのログイン方法で「メール/パスワード」を有効にします。
3. Firestore Databaseを本番環境モードで作成します。
4. `firebase/firestore.rules` の内容をFirestoreの「ルール」へ貼り付けて公開します。
5. Authenticationの「Settings」→「Authorized domains」に、ローカル確認用の `localhost` と `127.0.0.1` を追加します。
6. Google CloudのFraud Defenseで、スコアベースのWebキーに `2026-inter-univ-hackathon.github.io` を登録します。
7. Firebase Consoleの「App Check」でWebアプリをreCAPTCHA Enterpriseへ登録し、同じサイトキーを設定します。

GitHub Pagesへ公開するときは、同じAuthorized domainsへ `GitHubユーザー名.github.io` を追加します。パスの `/リポジトリ名/` は含めません。

FirebaseのWeb設定値とreCAPTCHA Enterpriseのサイトキーはブラウザへ公開される値です。サービスアカウント秘密鍵、SMTPパスワード、メールサービスの秘密APIキー、App Checkのデバッグトークンは `firebase-config.js` に追加しません。

## App Checkの設定

`static/firebase-config.js` の `FIREBASE_APP_CHECK_CONFIG.siteKey` には、Google Cloudで作成してFirebase App Checkへ登録したサイトキーを設定します。画面はFirebase App CheckをAuthenticationとFirestoreより先に初期化し、トークンを自動更新します。

最初はFirebase ConsoleのApp Checkで強制適用をオフにします。正常なリクエストが記録されることを確認してから、Firestore、Authenticationの順で強制適用を有効にします。強制適用を有効にすると、有効なApp Checkトークンがない通信は拒否されます。

### ローカル確認用のデバッグトークン

`localhost` または `127.0.0.1` で開いた場合だけ、画面はApp Checkのデバッグプロバイダーを有効にします。

1. 開発者ツールのConsoleを開いた状態でローカル画面を読み込みます。
2. Consoleに表示されたApp Checkのデバッグトークンをコピーします。
3. Firebase Consoleの「App Check」→対象Webアプリのメニュー→「デバッグトークンを管理」で登録します。
4. 画面を再読み込みし、ログインと予定操作を確認します。

デバッグトークンはブラウザ内に保存されます。ソースコード、Git、チャットには貼り付けません。GitHub Pagesではデバッグプロバイダーを使用しません。また、本番用reCAPTCHAキーの許可ドメインへ `localhost` を追加しません。

## ローカルで確認する

Pythonの標準機能だけでGitHub Pages用ファイルを生成し、ローカルサーバーを起動します。Djangoや追加ライブラリのインストールは不要です。

Mac・Linuxでは、リポジトリのルートで次を実行します。Macでは `start.command` をダブルクリックしても起動できます。

```bash
python3 scripts/run_local.py
```

Windows PowerShellでは次を実行します。

```powershell
py scripts\run_local.py
```

ブラウザで `http://127.0.0.1:8080/login.html` が自動的に開きます。ポート8080が使用中の場合は、次のように別の番号を指定します。

```bash
python3 scripts/run_local.py --port 8090
```

Windowsでは `py scripts\run_local.py --port 8090` です。新規登録・ログインはFirebase Authentication、予定保存はFirestoreが処理します。

## GitHub Pages用ファイルを生成する

Mac・Linuxでは次を実行します。

```bash
.venv/bin/python scripts/build_pages.py
```

Windows PowerShellでは次を実行します。

```powershell
.\.venv\Scripts\python.exe scripts\build_pages.py
```

Firebase設定の4項目が空の場合、生成は停止します。成功すると `dist/` に次の静的ファイルが作られます。

```text
dist/
├── .nojekyll
├── index.html
├── login.html
├── signup.html
└── static/
    ├── app-config.js
    ├── firebase-config.js
    ├── firebase-events.js
    ├── calendar-store.js
    └── login/
```

`dist/` は生成物のためGitの管理対象外です。生成処理はDjango APIのURLを必要としません。

## 生成物をローカルで確認する

Mac・Linuxでは次を実行します。

```bash
python3 -m http.server 8080 --directory dist
```

Windows PowerShellでは次を実行します。

```powershell
py -m http.server 8080 --directory dist
```

ブラウザで `http://127.0.0.1:8080/signup.html` を開きます。`index.html` をダブルクリックする方法ではログイン・予定編集を確認できません。

## 確認項目

1. 実際のメールアドレス、ユーザー名、6文字以上のパスワードで登録します。
2. 届いた確認メール内のリンクを開きます。未確認の間は予定へアクセスできません。
3. ログインし、Firebase ConsoleのAuthenticationでユーザーが確認済みになったことを確認します。
4. 予定を作成し、Firestoreの `users/{UID}/events/{予定ID}` に保存されたことを確認します。
5. ログアウトし、同じメールアドレスとパスワードで再ログインします。
6. ログイン画面の「パスワード再設定メールを送る」を確認します。
7. 別アカウントから最初のアカウントの予定が見えないことを確認します。
8. Firebase ConsoleのApp Checkメトリクスで、FirestoreとAuthenticationの有効なリクエストを確認します。

予定の通知メール、App Checkの強制適用、GitHub Pagesへの公開は別工程です。
