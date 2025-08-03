/*
 * app.js
 *
 * このファイルは案件管理システムのフロントエンドロジックを実装します。
 * Firebase の認証と Firestore を利用した案件の登録・一覧表示・詳細表示・削除
 * 機能を提供します。また、30 分間の操作がない場合に自動的にログアウトする
 * タイマーや、ZLIB64 圧縮バーコードのデコード関数、ユーザー登録（サインアップ）
 * のための画面や処理も含まれています。PC とスマートフォンでの表示差異を
 * 吸収するために CSS 側で条件付き表示制御を行います。
 */

// Firebase 初期化（ここで一度だけ読み込む）
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

// Firebase 認証と Firestore への参照を取得
const auth = firebase.auth();
const db   = firebase.firestore();

// 管理者 UID のリスト（ここに列挙されているユーザーのみ一括操作や削除が可能）
const ADMIN_UIDS = [
  "KXwhR1EgWGQS0ObjI4VDouVqkgC2",
  "V2yHq9bGjIMZFz93f9XnutOBohC2"
];

// 非アクティブタイマーと案件キャッシュ、詳細表示中の案件 ID
let inactivityTimer;
let casesCache = [];
let currentCaseId = null;

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
  const target = document.getElementById(id);
  if (target) {
    target.classList.remove("hidden");
  }
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
  // ログイン画面の入力欄をクリア
  ["emailInput","passwordInput"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  try {
    await auth.signOut();
  } catch(e) {
    console.error("signOut error:", e);
  }
  showView("loginView");
}

// —————————————
// ZLIB64 デコード関数
// —————————————
/**
 * Base64 文字列で表された ZLIB 圧縮データを解凍し、配列として返します。
 * デコードに失敗した場合は null を返します。
 * @param {string} str Base64 化された ZLIB 圧縮文字列
 * @returns {any[]|null}
 */
function decodeZlib64(str) {
  try {
    const binaryStr = atob(str);
    const bytes = Uint8Array.from(binaryStr, c => c.charCodeAt(0));
    const decompressed = pako.inflate(bytes);
    const dec = new TextDecoder();
    const jsonText = dec.decode(decompressed);
    return JSON.parse(jsonText);
  } catch (e) {
    console.error("decodeZlib64 error:", e);
    return null;
  }
}

/**
 * バーコード入力を処理し、受注番号・得意先・品名に展開する。
 * @param {string} code ZLIB64 エンコードされたバーコード
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

// —————————————
// 案件サマリーの表示
// —————————————
function populateCaseSummary() {
  const o = document.getElementById("orderNumberInput").value;
  const c = document.getElementById("customerInput").value;
  const p = document.getElementById("productInput").value;
  document.getElementById("caseSummary").textContent =
    `受注番号: ${o}\n得意先: ${c}\n品名: ${p}`;
}

// —————————————
// 発送情報行を追加
// —————————————
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
    btn.textContent = "";
    btn.addEventListener("click", () => {
      // TODO: QR リーダ起動 → processStartCode(decoded)
    });
    tdCam.appendChild(btn);
    tr.append(tdIdx, tdCo, tdTrack, tdCam);
    tbody.appendChild(tr);
  }
}

// —————————————
// 発送情報登録処理（運送会社未選択チェック）
// —————————————
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

// —————————————
// 案件一覧取得＆表示
// —————————————
async function loadCasesList() {
  const listElem = document.getElementById("casesList");
  listElem.innerHTML = "";
  casesCache = [];
  const snapshot = await db.collection("cases").orderBy("createdAt","desc").get();
  snapshot.forEach(docSnap => {
    casesCache.push({id: docSnap.id, data: docSnap.data()});
  });
  renderCasesList(casesCache);
}

/**
 * 案件一覧を描画する。管理者の場合はチェックボックスと削除ボタンを表示。
 * @param {Array<{id: string, data: any}>} list 描画対象の案件配列
 */
function renderCasesList(list) {
  const listElem = document.getElementById("casesList");
  listElem.innerHTML = "";
  const user = auth.currentUser;
  const isAdmin = user && ADMIN_UIDS.includes(user.uid);
  // 管理者の場合は全選択チェックボックスを最上部に追加
  if (isAdmin) {
    const selectAllDiv = document.createElement("div");
    selectAllDiv.classList.add("case-item");
    const selectAllCb = document.createElement("input");
    selectAllCb.type = "checkbox";
    selectAllCb.id = "selectAllCases";
    selectAllCb.classList.add("case-select");
    selectAllCb.addEventListener("change", () => {
      const checkboxes = document.querySelectorAll(".case-select");
      checkboxes.forEach(cb => {
        if (cb !== selectAllCb) cb.checked = selectAllCb.checked;
      });
    });
    const label = document.createElement("span");
    label.textContent = "全選択";
    selectAllDiv.append(selectAllCb, label);
    listElem.appendChild(selectAllDiv);
  }
  list.forEach(item => {
    const {id, data} = item;
    const div = document.createElement("div");
    div.classList.add("case-item");
    if (isAdmin) {
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.classList.add("case-select");
      cb.dataset.caseId = id;
      cb.addEventListener("click", e => {
        e.stopPropagation();
      });
      div.appendChild(cb);
    }
    const span = document.createElement("span");
    span.textContent = `${data.orderNumber || ""} | ${data.customer || ""} | ${data.product || ""}`;
    div.appendChild(span);
    if (isAdmin) {
      const delBtn = document.createElement("button");
      delBtn.textContent = "削除";
      delBtn.addEventListener("click", e => {
        e.stopPropagation();
        deleteCurrentCase(id);
      });
      div.appendChild(delBtn);
    }
    div.addEventListener("click", () => showCaseDetails(id));
    listElem.appendChild(div);
  });
}

// —————————————
// 案件一覧フィルタ処理
// —————————————
function filterCases() {
  const search = toHalfWidth(document.getElementById("searchInput").value.trim().toLowerCase());
  const startStr = document.getElementById("startDateInput").value;
  const endStr   = document.getElementById("endDateInput").value;
  const startDate = startStr ? new Date(startStr) : null;
  const endDate   = endStr ? new Date(endStr) : null;
  const filtered = casesCache.filter(item => {
    const data = item.data;
    const text = `${data.orderNumber || ""} ${data.customer || ""} ${data.product || ""}`.toLowerCase();
    if (search && !text.includes(search)) return false;
    let createdAt = null;
    if (data.createdAt) {
      if (typeof data.createdAt.toDate === "function") {
        createdAt = data.createdAt.toDate();
      } else if (data.createdAt.seconds) {
        createdAt = new Date(data.createdAt.seconds * 1000);
      } else {
        createdAt = new Date(data.createdAt);
      }
    }
    if (startDate && (!createdAt || createdAt < startDate)) return false;
    if (endDate && (!createdAt || createdAt > new Date(endDate.getTime() + 24*60*60*1000 - 1))) return false;
    return true;
  });
  renderCasesList(filtered);
}

// —————————————
// 案件詳細表示
// —————————————
async function showCaseDetails(caseId) {
  try {
    const docSnap = await db.collection("cases").doc(caseId).get();
    if (!docSnap.exists) {
      alert("案件が存在しません");
      return;
    }
    const data = docSnap.data();
    currentCaseId = caseId;
    document.getElementById("detailsInfo").textContent =
      `受注番号: ${data.orderNumber || ""}\n得意先: ${data.customer || ""}\n品名: ${data.product || ""}`;
    const shipmentsDiv = document.getElementById("shipmentsList");
    shipmentsDiv.innerHTML = "";
    if (data.shipments && Array.isArray(data.shipments)) {
      data.shipments.forEach((ship, idx) => {
        const p = document.createElement("p");
        p.textContent = `${idx+1}. 運送会社: ${translateCarrier(ship.carrier)}, 追跡番号: ${ship.trackingNumber || ""}`;
        shipmentsDiv.appendChild(p);
      });
    }
    showView("detailsView");
  } catch (e) {
    console.error(e);
    alert("詳細取得に失敗しました: " + e.message);
  }
}

// —————————————
// 削除処理（管理者のみ）
// —————————————
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

// —————————————
// 運送会社コード → 日本語名変換
// —————————————
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

  // サインアップ画面を表示
  document.getElementById("showSignupButton").addEventListener("click", () => {
    document.getElementById("signupEmailInput").value = "";
    document.getElementById("signupPasswordInput").value = "";
    document.getElementById("signupPasswordConfirmInput").value = "";
    document.getElementById("signupStatus").textContent = "";
    showView("signupView");
  });

  // サインアップ実行
  document.getElementById("signupButton").addEventListener("click", async () => {
    const email = toHalfWidth(document.getElementById("signupEmailInput").value.trim());
    const pw    = toHalfWidth(document.getElementById("signupPasswordInput").value.trim());
    const pwc   = toHalfWidth(document.getElementById("signupPasswordConfirmInput").value.trim());
    if (pw !== pwc) {
      alert("パスワードが一致しません");
      document.getElementById("signupStatus").textContent = "パスワードが一致しません";
      return;
    }
    try {
      await auth.createUserWithEmailAndPassword(email, pw);
      document.getElementById("signupStatus").textContent = "登録成功しました。ログインしてください。";
      showView("loginView");
    } catch (e) {
      console.error("signUp error:", e);
      document.getElementById("signupStatus").textContent = "登録失敗: " + e.message;
    }
  });

  // サインアップ画面から戻る
  document.getElementById("backToLoginFromSignupButton").addEventListener("click", () => {
    showView("loginView");
  });

  // メニュー：案件追加
  document.getElementById("menuAddCaseButton").addEventListener("click", () => {
    showView("addCaseStartView");
  });

  // メニュー：案件一覧
  document.getElementById("menuSearchCaseButton").addEventListener("click", () => {
    showView("listView");
    loadCasesList();
  });

  // グローバルログアウト
  document.getElementById("globalLogoutButton").addEventListener("click", performLogout);

  // 案件追加：手動入力モード切替（スタート画面から）
  document.getElementById("manualInputButton").addEventListener("click", () => {
    showView("caseInputView");
    document.getElementById("orderNumberInput").focus();
    // 手動入力に切り替える際は 2 次元バーコード領域を隠し、ボタンの文言を更新
    const scanContainer = document.getElementById("scan2dContainer");
    if (scanContainer) {
      scanContainer.classList.add("hidden");
    }
    document.getElementById("switchInputModeButton").textContent = "カメラ入力に切り替え";
  });

  // バーコード入力の Enter で変換処理を実行
  document.getElementById("barcodeInput").addEventListener("keydown", e => {
    if (e.key === "Enter") {
      processStartCode(toHalfWidth(e.target.value.trim()));
    }
  });

  // 2 次元バーコード／手動入力の切り替え
  document.getElementById("switchInputModeButton").addEventListener("click", () => {
    const scanContainer = document.getElementById("scan2dContainer");
    if (!scanContainer) return;
    const hidden = scanContainer.classList.contains("hidden");
    if (hidden) {
      scanContainer.classList.remove("hidden");
      document.getElementById("switchInputModeButton").textContent = "手動入力に切り替え";
    } else {
      scanContainer.classList.add("hidden");
      document.getElementById("switchInputModeButton").textContent = "カメラ入力に切り替え";
    }
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

  // 発送情報：戻る（案件情報入力へ）
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

  // 詳細画面：5件追加（発送情報追加機能は将来的に拡張予定）
  document.getElementById("addMoreShipmentsDetailsButton").addEventListener("click", () => addShipmentsRows(5));

  // 詳細画面：削除（管理者のみ）
  document.getElementById("deleteCaseButton").addEventListener("click", () => {
    if (currentCaseId) deleteCurrentCase(currentCaseId);
  });

  // 詳細画面：戻る
  document.getElementById("backToListButton").addEventListener("click", () => {
    showView("listView");
  });

  // 認証状態監視
  auth.onAuthStateChanged(user => {
    console.log("Auth State Changed:", user);
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
// DOMContentLoaded
// —————————————
window.addEventListener("DOMContentLoaded", init);