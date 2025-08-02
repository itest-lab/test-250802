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
- スクレイピングによるステータス取得エンドポイント（6キャリア対応）

## GitHubへのデプロイ
1. リポジトリを GitHub にプッシュ（`main` ブランチ）
2. GitHub Pages 用ワークフローを有効化  
   - `.github/workflows/pages.yml` を参照  
3. Vercel に同リポジトリを連携し、`api/` 配下を Functions としてデプロイ  
4. Vercel の環境変数に以下を設定  
   - `FIREBASE_SERVICE_ACCOUNT`  
   - `FIREBASE_PROJECT_ID`  
   - `ENCRYPTION_KEY`

## セットアップ
1. フロントエンド  
   ```bash
   cd frontend
   npm install
   npm run build
   ```
2. API  
   ```bash
   # Vercel CLI でもセットアップ可能
   vercel env add FIREBASE_SERVICE_ACCOUNT
   vercel env add FIREBASE_PROJECT_ID
   vercel env add ENCRYPTION_KEY
   ```

各コードはコメント参照の上、適宜カスタマイズしてください。
