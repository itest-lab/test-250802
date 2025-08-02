# 案件管理システム

このリポジトリには、以下の構成で動作する「案件管理システム」のサンプルコードが含まれています。

## フロントエンド (React)
- GitHub Pages にデプロイ
- 案件追加画面（バーコード/カメラ起動／手動入力）
- 追跡番号登録画面（1次元/2次元バーコード対応）
- モバイル端末のみカメラ起動ボタン表示

## バックエンド (Vercel Functions + Firebase)
- Firebase Authentication (ゲスト／メール登録／管理者権限)
- Firestore にデータ保存（cases, shipments コレクション）
- AES-256-GCM によるデータ暗号化
- スクレイピングによるステータス取得エンドポイント

### 環境変数
- `FIREBASE_SERVICE_ACCOUNT`：サービスアカウントJSON（文字列）
- `FIREBASE_PROJECT_ID`：Firebase プロジェクトID
- `ENCRYPTION_KEY`：32バイトのランダムな hex 文字列

## セットアップ
1. GitHub リポジトリにプッシュ
2. GitHub Pages で `frontend/build` をホスティング
3. Vercel に同リポジトリを連携し、API フォルダを Functions として設定
4. Vercel の環境変数に上記3つを設定
5. フロントエンド `npm install` → `npm run build` → デプロイ

詳細は各ディレクトリのコメントを参照してください。
"# test-250802" 
