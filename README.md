# 予定管理アプリ「助じゅ～る」

「未定の予定」を一元管理。

## 何を作ったか

（誰の・何が・どう解決されるのか。3〜5行）

## 使った技術

- HTML / CSS / JavaScript（素のまま）
- Firebase Authentication（ユーザー認証）
- Cloud Firestore（ユーザー情報・予定情報を記録）
- Firebase App Check（セキュリティ）
- EmailJS（予定の通知メール送信）
- GitHub Pages（フロントのデプロイ）

予定はログインしたユーザーごとにCloud Firestoreへ保存します。

## どう開発したか

**9/4 にやったこと**

- 前半は **ペアプログラミング**（ドライバーとナビの2人で書き、10分で交代）
- 後半は役割を固定して仕上げ

**開発期間（9/5〜9/24）にやったこと**

- 担当したユーザー・実装した機能ごとにブランチを分け、個別に作業を進める
- バックエンド部分のPRをメンターがレビューし、修正を進めていく
- UI修正はメンターが一任
- UI修正・追加機能のPRを先にマージ
- バックエンド部分のPRはコンフリクト解消後に最後にマージ

![PRのスクリーンショット](https://github.com/2026-inter-univ-hackathon/team-d/blob/b64f983f55f5a38e61e2cd9ab7affde2fe42ab1e/docs/PR_capture.png)

## 動かし方

Python 3がある環境で、次のコマンドを実行します。追加ライブラリのインストールは不要です。

```bash
python3 scripts/run_local.py
```

Windowsでは `py scripts\run_local.py` を実行します。起動後、ブラウザで `http://127.0.0.1:8080/login.html` を開きます。

## AI に任せなかった部分

予定が未定であるか、確定であるかの判断

## チーム

| 名前 | 大学 | 担当 |
| ---- | ---- | ---- |
| 中村聡太 | 東京海洋大学 | メンター・UI周り |
| 宮嶋洋太 | 東京海洋大学 | 発表・報告 |
| 深栖凛 | 東京海洋大学 | 予定周りの機能実装 |
| 斎藤至道 | 東京海洋大学 | テスター・エラー報告 |
| 砂山光 | 東京海洋大学 | バックエンド実装 |
| 田村健人 | 東京海洋大学 | メンバー |
| 恩田梨那  | 東京海洋大学 | 運営 |

## Firebase・GitHub Pages版

現在のFirebase Authentication・Cloud Firestore構成と、GitHub Pages用ファイルの生成方法は、[Firebase・GitHub Pages版の説明](docs/FIREBASE_SETUP.md)を参照してください。
