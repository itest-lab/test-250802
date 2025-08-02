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
  apiKey: "AIzaSyArSM1XI5MLkZDiDdzkLJxBwvjM4xGWS70",
  authDomain: "test-250724.firebaseapp.com",
  databaseURL: "https://test-250724-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "test-250724",
  storageBucket: "test-250724.firebasestorage.app",
  messagingSenderId: "252374655568",
  appId: "1:252374655568:web:3e583b46468714b7b7a755",
  measurementId: "G-5WGPKD9BP2"
};

// Firebase を初期化します。このサンプルでは互換レイヤー（version 9
// compat）を使用していますが、必要に応じてモジュラー SDK に書き換える
// こともできます。
firebase.initializeApp(firebaseConfig);

// アプリ全体で使用する認証と Firestore へのグローバル参照
const auth = firebase.auth();
const db = firebase.firestore();