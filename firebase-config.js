/*
 * firebase-config.js
 *
 * このファイルには Firebase プロジェクトの設定情報を記述します。
 * 下記のプレースホルダ（YOUR_API_KEY など）は Firebase コンソールで
 * 発行した値に置き換えてください。実際の資格情報を公開リポジトリに
 * コミットしないよう注意してください。GitHub Pages へデプロイする
 * 場合は、このファイルをバージョン管理から除外するか、環境変数を
 * 使って値を注入する手法が推奨されます。詳しくは Firebase の
 * ドキュメントをご参照ください。
 */

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Firebase を初期化します。このサンプルでは互換レイヤー（version 9
// compat）を使用していますが、必要に応じてモジュラー SDK に書き換える
// こともできます。
firebase.initializeApp(firebaseConfig);

// アプリ全体で使用する認証と Firestore へのグローバル参照
const auth = firebase.auth();
const db = firebase.firestore();