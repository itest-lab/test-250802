# 案件管理システム

## 構成
- **フロントエンド**: React アプリ (GitHub Pages でホスティング)
  - Firebase SDK により Authentication と Firestore の読み取りを実装
  - 各画面: 案件追加、追跡番号追加、案件一覧、案件詳細
- **バックエンド**: Vercel Functions (API のみ)
  - Firebase Admin SDK で ID トークン検証・Firestore 書き込み
  - 暗号化・スクレイピング用
- **デプロイ**
  - フロント: GitHub Actions → gh-pages ブランチ
  - API: Vercel 連携
- **Secrets**
  - Firebase サービスアカウント JSON
  - Firebase プロジェクト ID
  - AES-256-GCM 用 ENCRYPTION_KEY

## セットアップ
1. GitHub リポジトリにプッシュ
2. GitHub Pages 用 Workflow を有効化
3. Vercel でプロジェクトリンク & Secrets 設定
4. フロントエンド:
   ```bash
   cd frontend
   npm install
   npm run build
   ```
5. デプロイ
   ```bash
   npm run deploy   # GitHub Pages
   ```

各コードは components 以下などにコメントで説明を記載しています。
