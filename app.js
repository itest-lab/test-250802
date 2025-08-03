// —————————————
// Firebase 初期化（ここで一度だけ読み込む）
// —————————————
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

// —————————————
// 設定
// —————————————
const ADMIN_UIDS = [
  "KXwhR1EgWGQS0ObjI4VDouVqkgC2",
  "V2yHq9bGjIMZFz93f9XnutOBohC2"
];
let inactivityTimer;

// —————————————
// 半角変換ユーティリティ
// —————————————
function toHalfWidth(str) {
  return str.replace(/[！-～]/g, ch =>
    String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)
  ).replace(/　/g, " ");
}

// —————————————
// 画面切り替え
// —————————————
function showView(id) {
  console.log("画面切り替え:", id);
  document.querySelectorAll(".view").forEach(sec => sec.classList.add("hidden"));
  document.getElementById(id).classList.remove("hidden");
}

// —————————————
// タイマー管理（30分でログアウト）
// —————————————
function resetInactivityTimer() {
  clearTimeout(inactivityTimer);
  inactivityTimer = setTimeout(performLogout, 30 * 60 * 1000);
}

// —————————————
// ログアウト処理
// —————————————
async function performLogout() {
  console.log("自動ログアウトまたは手動ログアウト実行");
  // 入力クリア
  ["emailInput","passwordInput"].forEach(id=>{
    const el = document.getElementById(id);
    if(el) el.value = "";
  });
  try {
    await auth.signOut();
  } catch(e) {
    console.error("signOut error:", e);
  }
  showView("loginView");
}

// —————————————
// 初期化
// —————————————
function init() {
  console.log("初期化開始");
  document.addEventListener("click", resetInactivityTimer);
  document.addEventListener("keydown", resetInactivityTimer);
  resetInactivityTimer();

  // ログイン
  document.getElementById("loginButton").addEventListener("click", async () => {
    console.log("ログインボタンクリック");
    const email = toHalfWidth(document.getElementById("emailInput").value.trim());
    const pwd   = toHalfWidth(document.getElementById("passwordInput").value.trim());
    console.log("入力値:", email, pwd);
    try {
      await auth.signInWithEmailAndPassword(email, pwd);
      console.log("signInWithEmailAndPassword 成功");
      document.getElementById("authStatus").textContent = "";
    } catch (e) {
      console.error("signIn error:", e);
      document.getElementById("authStatus").textContent = "ログインに失敗しました: " + e.message;
    }
  });

  // ゲストログイン
  document.getElementById("guestButton").addEventListener("click", async () => {
    console.log("ゲストログイン試行");
    try {
      await auth.signInAnonymously();
      document.getElementById("authStatus").textContent = "ゲストログイン成功";
    } catch (e) {
      console.error("匿名ログインエラー:", e);
      document.getElementById("authStatus").textContent = "ゲストログイン失敗: " + e.message;
    }
  });

  // 認証状態変化
  auth.onAuthStateChanged((user) => {
    console.log("Auth State Changed:", user);
    if (user) {
      showView("menuView");
      document.getElementById("globalLogoutButton").classList.remove("hidden");
    } else {
      showView("loginView");
      document.getElementById("globalLogoutButton").classList.add("hidden");
    }
  });

  // メニュー：案件追加
  document.getElementById("menuAddCaseButton").addEventListener("click", () => {
    showView("addCaseStartView");
  });

  // メニュー：案件一覧
  document.getElementById("menuSearchCaseButton").addEventListener("click", () => {
    showView("listView");
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

// —————————————
// ページ読み込み完了後に init を呼び出す
// —————————————
window.addEventListener("DOMContentLoaded", init);

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
