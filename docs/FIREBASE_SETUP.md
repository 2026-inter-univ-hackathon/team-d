# Firebase・GitHub Pages版の設定と確認

現在の画面はFirebase Authenticationでログインし、Cloud Firestoreへユーザーごとの予定を保存します。GitHub Pagesへ公開するファイルは `dist/` に生成します。この手順では公開やpushは行いません。

## Firebase Consoleの設定

1. Webアプリを登録し、`apiKey`・`authDomain`・`projectId`・`appId` を `static/firebase-config.js` に設定します。
2. Authenticationのログイン方法で「メール/パスワード」を有効にします。
3. Firestore Databaseを本番環境モードで作成します。
4. `firebase/firestore.rules` の内容をFirestoreの「ルール」へ貼り付けて公開します。
5. Authenticationの「Settings」→「Authorized domains」に、ローカル確認用の `localhost` と `127.0.0.1` を追加します。

GitHub Pagesへ公開するときは、同じAuthorized domainsへ `GitHubユーザー名.github.io` を追加します。パスの `/リポジトリ名/` は含めません。

FirebaseのWeb設定値はブラウザへ公開される値です。サービスアカウント秘密鍵、SMTPパスワード、メールサービスの秘密APIキーは `firebase-config.js` に追加しません。

## Django経由でローカル確認する

Mac・Linuxでは、リポジトリのルートで次を実行します。

```bash
.venv/bin/python manage.py runserver
```

Windows PowerShellでは次を実行します。

```powershell
.\.venv\Scripts\python.exe manage.py runserver
```

ポート8000が使用中の場合は、コマンドの末尾に `8001` を追加します。ブラウザで `http://127.0.0.1:8000/signup/` または指定したポートのURLを開きます。

Djangoはこの確認方法ではHTMLを配信するためにだけ使用します。新規登録・ログインはFirebase Authentication、予定保存はFirestoreが処理します。

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
2. Firebase ConsoleのAuthenticationにユーザーが追加されたことを確認します。
3. 予定を作成し、Firestoreの `users/{UID}/events/{予定ID}` に保存されたことを確認します。
4. ログアウトし、同じメールアドレスとパスワードで再ログインします。
5. 別アカウントから最初のアカウントの予定が見えないことを確認します。

メールアドレス確認、パスワード再設定、通知メール、App Check、GitHub Pagesへの公開は別工程です。
