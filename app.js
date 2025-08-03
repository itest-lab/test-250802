// Firebase の初期化設定（compat 版 SDK を利用）
firebase.initializeApp({
  apiKey: "AIzaSyArSM1XI5MLkZDiDdzkLJxBwvjM4xGWS70",
  authDomain: "test-250724.firebaseapp.com",
  databaseURL: "https://test-250724-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "test-250724",
  storageBucket: "test-250724.firebasestorage.app",
  messagingSenderId: "252374655568",
  appId: "1:252374655568:web:3e583b46468714b7b7a755",
  measurementId: "G-5WGPKD9BP2"
});
const auth = firebase.auth();
const db   = firebase.firestore();

// 管理者 UID リスト（Firestore ルールと一致させてください）
const ADMIN_UIDS = [
  "KXwhR1EgWGQS0ObjI4VDouVqkgC2",
  "V2yHq9bGjIMZFz93f9XnutOBohC2"
];

// 自動ログアウト用タイマーID
let inactivityTimer;

/**
 * 全角文字を半角に変換するユーティリティ
 */
function toHalfWidth(str) {
  return str.replace(/[！-～]/g, ch =>
    String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)
  ).replace(/　/g, " ");
}

/**
 * ZLIB64 形式の文字列をデコードし、配列または文字列配列を返す
 */
function decodeZlib64(input) {
  if (!input.startsWith("ZLIB64:")) {
    // プレフィクスがない場合はそのまま文字列を配列に
    return [input];
  }
  try {
    const base64 = input.slice("ZLIB64:".length);
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    // pako で zlib 展開
    const inflated = pako.inflate(bytes);
    const decoded = new TextDecoder("utf-8").decode(inflated);
    // JSON 配列としてパースできればそれを返し、できなければ改行で分割
    try {
      return JSON.parse(decoded);
    } catch {
      return decoded.split(/\r?\n/);
    }
  } catch (e) {
    console.error("ZLIB64 デコードエラー:", e);
    return null;
  }
}

/**
 * 画面（section.view）の表示切り替え
 */
function showView(id) {
  document.querySelectorAll(".view").forEach(v => v.classList.add("hidden"));
  document.getElementById(id).classList.remove("hidden");
}

/**
 * 自動ログアウトタイマーをリセット（30分）および再設定
 */
function resetInactivityTimer() {
  clearTimeout(inactivityTimer);
  inactivityTimer = setTimeout(performLogout, 30 * 60 * 1000); // 30分
}

/**
 * ログアウト処理：フォームクリア＋Firebase サインアウト＋ログイン画面へ
 */
async function performLogout() {
  // メール／パスワード入力欄クリア
  ["emailInput", "passwordInput", "regEmailInput", "regPasswordInput", "regConfirmInput"]
    .forEach(id => document.getElementById(id)?.value = "");
  try {
    await auth.signOut();
  } catch (e) {
    console.error("サインアウトエラー:", e);
  }
  showView("loginView");
}

/**
 * 初期化：イベント登録、認証状態監視、タイマー設定
 */
function init() {
  // 無操作検知
  document.addEventListener("click", resetInactivityTimer);
  document.addEventListener("keydown", resetInactivityTimer);
  resetInactivityTimer();

  // ログイン実行
  document.getElementById("loginButton").addEventListener("click", async () => {
    const email = toHalfWidth(document.getElementById("emailInput").value.trim());
    const pwd   = toHalfWidth(document.getElementById("passwordInput").value.trim());
    try {
      await auth.signInWithEmailAndPassword(email, pwd);
      document.getElementById("authStatus").textContent = "";
    } catch (e) {
      document.getElementById("authStatus").textContent = "ログイン失敗: " + e.message;
    }
  });

  // ゲストログイン
  document.getElementById("guestButton").addEventListener("click", async () => {
    try {
      await auth.signInAnonymously();
      document.getElementById("authStatus").textContent = "";
    } catch (e) {
      document.getElementById("authStatus").textContent = "ゲストログイン失敗: " + e.message;
    }
  });

  // 新規登録画面へ遷移
  document.getElementById("goToRegisterButton").addEventListener("click", () => {
    showView("registerView");
  });
  // 新規登録キャンセル
  document.getElementById("cancelRegisterButton").addEventListener("click", () => {
    showView("loginView");
  });
  // 新規登録実行
  document.getElementById("registerSubmitButton").addEventListener("click", async () => {
    const email = toHalfWidth(document.getElementById("regEmailInput").value.trim());
    const pwd   = toHalfWidth(document.getElementById("regPasswordInput").value.trim());
    const conf  = toHalfWidth(document.getElementById("regConfirmInput").value.trim());
    if (pwd !== conf) {
      document.getElementById("registerStatus").textContent = "パスワードが一致しません";
      return;
    }
    try {
      await auth.createUserWithEmailAndPassword(email, pwd);
      document.getElementById("registerStatus").textContent = "登録完了！";
      showView("menuView");
    } catch (e) {
      document.getElementById("registerStatus").textContent = "登録失敗: " + e.message;
    }
  });

  // メニュー操作：案件追加
  document.getElementById("menuAddCaseButton").addEventListener("click", () => {
    showView("addCaseStartView");
  });
  // メニュー操作：案件検索
  document.getElementById("menuSearchCaseButton").addEventListener("click", () => {
    showView("listView");
    loadCasesList();
  });

  // グローバルログアウト
  document.getElementById("globalLogoutButton").addEventListener("click", performLogout);

  // 案件追加：手動入力モード切替
  document.getElementById("manualInputButton").addEventListener("click", () => {
    showView("caseInputView");
    document.getElementById("orderNumberInput").focus();
  });
  // 案件追加：Enter でバーコード処理
  document.getElementById("barcodeInput").addEventListener("keydown", e => {
    if (e.key === "Enter") {
      processStartCode(toHalfWidth(e.target.value.trim()));
    }
  });
  // 案件追加：カメラ起動（html5-qrcode）
  document.getElementById("barcodeCameraButton").addEventListener("click", () => {
    // TODO: html5-qrcode 起動 → 読み取り後 processStartCode(decoded) 呼び出し
  });

  // 案件情報：次へ
  document.getElementById("caseNextButton").addEventListener("click", () => {
    showView("shipmentsView");
    populateCaseSummary();
  });
  // 案件情報：戻る
  document.getElementById("backToMenuFromCaseButton").addEventListener("click", () => {
    showView("menuView");
  });

  // 発送情報：行追加
  document.getElementById("addMoreShipmentsButton").addEventListener("click", () => addShipmentsRows(5));
  // 発送情報：登録
  document.getElementById("saveCaseButton").addEventListener("click", saveCase);
  // 発送情報：戻る
  document.getElementById("backToMenuFromShipmentsButton").addEventListener("click", () => {
    showView("caseInputView");
  });

  // 案件一覧：更新
  document.getElementById("refreshListButton").addEventListener("click", loadCasesList);
  // 案件一覧：検索・日付範囲
  document.getElementById("searchInput").addEventListener("input", filterCases);
  document.getElementById("startDateInput").addEventListener("change", filterCases);
  document.getElementById("endDateInput").addEventListener("change", filterCases);
  // 案件一覧：戻る
  document.getElementById("backToMenuFromListButton").addEventListener("click", () => {
    showView("menuView");
  });

  // 詳細画面：5件追加
  document.getElementById("addMoreShipmentsDetailsButton").addEventListener("click", () => addShipmentsRows(5));
  // 詳細画面：削除（管理者のみ）
  document.getElementById("deleteCaseButton").addEventListener("click", deleteCurrentCase);
  // 詳細画面：戻る
  document.getElementById("backToListButton").addEventListener("click", () => {
    showView("listView");
  });

  // 認証状態監視：ログイン時はメニュー、ログアウト時はログイン画面
  auth.onAuthStateChanged(user => {
    if (user) {
      document.getElementById("globalLogoutButton").classList.remove("hidden");
      loadCasesList();
      showView("menuView");
    } else {
      document.getElementById("globalLogoutButton").classList.add("hidden");
      performLogout();
    }
  });
}

/**
 * ZLIB64 データを復元し、案件情報入力へ遷移
 */
function processStartCode(code) {
  const arr = decodeZlib64(code);
  if (!Array.isArray(arr) || arr.length < 3) {
    alert("バーコード解析に失敗しました");
    return;
  }
  const [orderNumber, customer, product] = arr;
  document.getElementById("orderNumberInput").value = orderNumber;
  document.getElementById("customerInput").value    = customer;
  document.getElementById("productInput").value     = product;
  showView("shipmentsView");
  populateCaseSummary();
}

/**
 * 案件サマリーの表示
 */
function populateCaseSummary() {
  const o = document.getElementById("orderNumberInput").value;
  const c = document.getElementById("customerInput").value;
  const p = document.getElementById("productInput").value;
  document.getElementById("caseSummary").textContent =
    `受注番号: ${o}\n得意先: ${c}\n品名: ${p}`;
}

/**
 * 発送情報行を追加
 */
function addShipmentsRows(count) {
  const tbody = document.getElementById("shipmentsBody");
  for (let i = 0; i < count; i++) {
    const tr = document.createElement("tr");
    const tdIdx = document.createElement("td");
    tdIdx.textContent = tbody.children.length + 1;
    const tdCo = document.createElement("td");
    const sel = document.createElement("select");
    ["","yamato","sagawa","seino","tonami","fukutsu","hida"].forEach(v => {
      const opt = document.createElement("option");
      opt.value = v;
      opt.textContent = v ? translateCarrier(v) : "";
      sel.appendChild(opt);
    });
    tdCo.appendChild(sel);
    const tdTrack = document.createElement("td");
    const inp = document.createElement("input");
    inp.type = "text";
    tdTrack.appendChild(inp);
    const tdCam = document.createElement("td");
    tdCam.classList.add("camera-col");
    const btn = document.createElement("button");
    btn.textContent = "📷";
    btn.addEventListener("click", () => {
      // TODO: QR リーダ起動 → processStartCode()
    });
    tdCam.appendChild(btn);
    tr.append(tdIdx, tdCo, tdTrack, tdCam);
    tbody.appendChild(tr);
  }
}

/**
 * 案件登録処理（運送会社未選択チェック）
 */
async function saveCase() {
  const tbody = document.getElementById("shipmentsBody");
  for (const row of tbody.children) {
    const co = row.children[1].firstChild.value;
    const tn = row.children[2].firstChild.value.trim();
    if (tn && !co) {
      alert("追跡番号が入力されています。運送会社を選択してください。");
      return;
    }
  }
  // Firestore 登録例:
  // await db.collection("cases").add({ orderNumber: ..., createdAt: firebase.firestore.FieldValue.serverTimestamp(), ... });
  // loadCasesList();
}

/**
 * 案件一覧取得＆表示
 * ※日付・検索フィルタは Firestore クエリの where 節を使うor取得後 JS filter 可能
 */
async function loadCasesList() {
  const listElem = document.getElementById("casesList");
  listElem.innerHTML = "";
  // 例: date-from 〜 date-to フィルタをクエリに追加
  // let q = db.collection("cases").orderBy("createdAt", "desc");
  // if (startDate) q = q.where("createdAt", ">=", startDateTs);
  // if (endDate)   q = q.where("createdAt", "<=", endDateTs);
  // const snapshot = await q.get();
  const snapshot = await db.collection("cases").orderBy("createdAt", "desc").get();
  snapshot.forEach(docSnap => {
    const data = docSnap.data();
    const div = document.createElement("div");
    div.classList.add("case-item");
    div.textContent = `${data.orderNumber} | ${data.customer} | ${data.product}`;
    // 管理者であれば削除ボタンを表示
    if (auth.currentUser && ADMIN_UIDS.includes(auth.currentUser.uid)) {
      const delBtn = document.createElement("button");
      delBtn.textContent = "削除";
      delBtn.addEventListener("click", () => deleteCurrentCase(docSnap.id));
      div.appendChild(delBtn);
    }
    listElem.appendChild(div);
  });
}

/**
 * 管理者のみ実行可能な削除処理
 */
async function deleteCurrentCase(caseId) {
  if (!confirm("本当に削除しますか？")) return;
  try {
    await db.collection("cases").doc(caseId).delete();
    alert("削除しました");
    loadCasesList();
  } catch (e) {
    alert("削除失敗: " + e.message);
  }
}

/**
 * 検索＆日付範囲フィルタ（実装例コメントあり）
 */
function filterCases() {
  // Firestore where 節を追加するか、取得後に JS filter() で絞り込む
}

/**
 * 運送会社コード → 日本語名変換
 */
function translateCarrier(code) {
  return {
    yamato: "ヤマト運輸",
    sagawa: "佐川急便",
    seino:  "西濃運輸",
    tonami: "トナミ運輸",
    fukutsu:"福山通運",
    hida:   "飛騨運輸"
  }[code] || "";
}

// 初期化呼び出し
init();
