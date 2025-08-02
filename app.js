// Firebase の初期化
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-app-compat.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  signInAnonymously,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/9.6.10/firebase-auth-compat.js";
import {
  getFirestore,
  collection,
  addDoc,
  doc,
  deleteDoc,
  getDocs,
  query,
  orderBy,
  serverTimestamp,
  where,
  updateDoc
} from "https://www.gstatic.com/firebasejs/9.6.10/firebase-firestore-compat.js";

// Firebase プロジェクト設定（実際の値に置き換えてください）
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

// Firebase アプリと各サービスを初期化
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

// 管理者 UID リスト（Firestoreルールと一致させてください）
const ADMIN_UIDS = ["KXwhR1EgWGQS0ObjI4VDouVqkgC2", "V2yHq9bGjIMZFz93f9XnutOBohC2"];

/**
 * ZLIB64形式の文字列をデコード
 * @param {string} str - 入力バーコード文字列（ZLIB64:xxxx）
 * @returns {Array|null} - JSON配列または文字列配列、失敗時は null
 */
function decodeBarcode(str) {
  if (!str) return null;
  const prefix = "ZLIB64:";
  if (str.startsWith(prefix)) {
    try {
      const b64 = str.slice(prefix.length);
      const raw = atob(b64);
      const u8  = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) {
        u8[i] = raw.charCodeAt(i);
      }
      // pako.inflate で zlib 圧縮解除
      const inflated = pako.inflate(u8);
      const decoded  = new TextDecoder("utf-8").decode(inflated);
      // JSON 形式であればパース、なければ改行で配列化
      try {
        return JSON.parse(decoded);
      } catch {
        return decoded.split(/\r?\n/);
      }
    } catch (e) {
      console.error("デコードエラー:", e);
      return null;
    }
  } else {
    // プレフィクス無しは単一要素の配列として返す
    return [str];
  }
}

// ページ読み込み後に初期化
document.addEventListener("DOMContentLoaded", init);

function init() {
  // ビュー要素の取得
  const loginView        = document.getElementById("loginView");
  const registerView     = document.getElementById("registerView");
  const menuView         = document.getElementById("menuView");
  const addCaseStartView = document.getElementById("addCaseStartView");
  const caseInputView    = document.getElementById("caseInputView");
  const shipmentsView    = document.getElementById("shipmentsView");
  const listView         = document.getElementById("listView");
  const detailsView      = document.getElementById("detailsView");
  const globalLogoutBtn  = document.getElementById("globalLogoutButton");

  // グローバルログアウト：認証解除
  if (globalLogoutBtn) {
    globalLogoutBtn.addEventListener("click", () => signOut(auth));
  }

  // --- ログイン処理 ---
  document.getElementById("loginButton").addEventListener("click", () => {
    const email = document.getElementById("emailInput").value.trim();
    const pass  = document.getElementById("passwordInput").value;
    signInWithEmailAndPassword(auth, email, pass)
      .catch(e => document.getElementById("authStatus").textContent = e.message);
  });
  // ゲストログイン
  document.getElementById("guestButton").addEventListener("click", () => {
    signInAnonymously(auth)
      .catch(e => document.getElementById("authStatus").textContent = e.message);
  });
  // 新規登録画面へ遷移
  document.getElementById("goToRegisterButton").addEventListener("click", () => {
    showView(registerView);
  });

  // --- 新規登録処理 ---
  document.getElementById("registerSubmitButton").addEventListener("click", () => {
    const email = document.getElementById("regEmailInput").value.trim();
    const pass  = document.getElementById("regPasswordInput").value;
    const conf  = document.getElementById("regConfirmInput").value;
    if (pass !== conf) {
      document.getElementById("registerStatus").textContent = "パスワードが一致しません";
      return;
    }
    createUserWithEmailAndPassword(auth, email, pass)
      .catch(e => document.getElementById("registerStatus").textContent = e.message);
  });
  // 登録キャンセル
  document.getElementById("cancelRegisterButton").addEventListener("click", () => {
    showView(loginView);
  });

  // --- ビュー遷移ボタン ---
  document.getElementById("backToMenuFromStartButton").addEventListener("click", () => showView(menuView));
  document.getElementById("backToMenuFromCaseButton").addEventListener("click", () => showView(menuView));
  document.getElementById("backToMenuFromShipmentsButton").addEventListener("click", () => showView(menuView));
  document.getElementById("backToMenuFromListButton").addEventListener("click", () => showView(menuView));

  // --- メニュー操作 ---
  document.getElementById("menuAddCaseButton").addEventListener("click",    () => showView(addCaseStartView));
  document.getElementById("menuSearchCaseButton").addEventListener("click", () => { showView(listView); loadCases(); });

  // --- バーコード入力開始 ---
  document.getElementById("barcodeCameraButton").addEventListener("click", startBarcodeScanner);
  document.getElementById("manualInputButton").addEventListener("click",    () => showView(caseInputView));
  document.getElementById("barcodeInput").addEventListener("keydown", e => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleBarcodeInput();
    }
  });

  // --- 案件情報画面 次へ ---
  document.getElementById("caseNextButton").addEventListener("click", () => {
    showView(shipmentsView);
    populateShipmentsSummary();
  });

  // --- 発送情報保存 ---
  document.getElementById("saveCaseButton").addEventListener("click", saveCaseToFirestore);

  // --- 一覧画面更新・フィルタ ---
  document.getElementById("refreshListButton").addEventListener("click", loadCases);
  document.getElementById("searchInput").addEventListener("input", filterCases);
  document.getElementById("startDateInput").addEventListener("change", filterCases);
  document.getElementById("endDateInput").addEventListener("change", filterCases);

  // --- 詳細画面の削除ボタン ---
  document.getElementById("deleteCaseButton").addEventListener("click", deleteCurrentCase);

  // --- 認証状態監視 ---
  onAuthStateChanged(auth, user => {
    if (user) {
      globalLogoutBtn.classList.remove("hidden");
      showView(menuView);
    } else {
      globalLogoutBtn.classList.add("hidden");
      showView(loginView);
    }
  });
}

// --- ビュー切替 ---
function showView(viewElem) {
  document.querySelectorAll("section.view").forEach(sec => sec.classList.add("hidden"));
  viewElem.classList.remove("hidden");
}

/**
 * バーコード文字列を解析し、案件情報へマッピング
 */
function handleBarcodeInput() {
  const v   = document.getElementById("barcodeInput").value.trim();
  const arr = decodeBarcode(v);
  if (!arr) {
    alert("バーコード解析に失敗しました");
    return;
  }
  if (Array.isArray(arr)) {
    document.getElementById("orderNumberInput").value = arr[0] || "";
    document.getElementById("customerInput").value    = arr[1] || "";
    document.getElementById("productInput").value     = arr[2] || "";
  }
  showView(shipmentsView);
  populateShipmentsSummary();
}

// --- 発送情報サマリーを表示 ---
// 受注番号・得意先・品名を「発送情報入力」画面に表示します
function populateShipmentsSummary() {
  const sumEl = document.getElementById("caseSummary");
  const o = document.getElementById("orderNumberInput").value;
  const c = document.getElementById("customerInput").value;
  const p = document.getElementById("productInput").value;
  sumEl.textContent = `受注番号: ${o}\n得意先: ${c}\n品名: ${p}`;
}

// --- html5-qrcode を用いたバーコード（QR含む）スキャナー起動 ---
// スマホ・PC どちらでも動作するように html5-qrcode ライブラリを使います
let html5QrcodeScanner;
function startBarcodeScanner() {
  const readerEl = document.getElementById("startQrReader");
  // ビュー切替
  showView(addCaseStartView);
  readerEl.classList.remove("hidden");
  // html5-qrcode インスタンス生成
  if (!html5QrcodeScanner) {
    html5QrcodeScanner = new Html5Qrcode("startQrReader");
  }
  // カメラ起動
  Html5Qrcode.getCameras().then(cameras => {
    const cameraId = cameras[0].id;
    html5QrcodeScanner.start(
      cameraId,
      { fps: 10, qrbox: { width: 250, height: 250 } },
      (decoded) => {
        // デコードしたバーコード文字列を処理
        html5QrcodeScanner.stop().then(() => {
          readerEl.classList.add("hidden");
          document.getElementById("barcodeInput").value = decoded;
          handleBarcodeInput();
        });
      },
      (error) => {
        // スキャン失敗は無視
      }
    );
  }).catch(err => {
    alert("カメラの初期化に失敗しました: " + err);
  });
}

// --- 発送行（テーブルの行）を5件ずつ追加 ---
// 画面下部「5件追加」ボタンを押すたびに行を追加します
function addMoreShipmentRows(count = 5) {
  const tbody = document.getElementById("shipmentsBody");
  for (let i = 0; i < count; i++) {
    const tr = document.createElement("tr");
    // セル：連番
    const tdNo = document.createElement("td");
    tdNo.textContent = tbody.children.length + 1;
    tr.appendChild(tdNo);
    // セル：運送会社セレクト
    const tdCo = document.createElement("td");
    const sel = document.createElement("select");
    sel.innerHTML = `
      <option value="">選択してください</option>
      <option value="yamato">ヤマト</option>
      <option value="sagawa">佐川</option>
      <option value="seino">西濃</option>
      <option value="tonami">トナミ</option>
      <option value="fukutsu">福山通運</option>
      <option value="hida">飛騨</option>`;
    tdCo.appendChild(sel);
    tr.appendChild(tdCo);
    // セル：追跡番号入力
    const tdTrack = document.createElement("td");
    const inp = document.createElement("input");
    inp.type = "text";
    inp.className = "trackingInput halfwidth";
    tdTrack.appendChild(inp);
    tr.appendChild(tdTrack);
    // セル：カメラ（スマホのみ表示）
    const tdCam = document.createElement("td");
    const btnCam = document.createElement("button");
    btnCam.textContent = "📷";
    btnCam.addEventListener("click", () => {
      startShipmentScanner(inp);
    });
    tdCam.appendChild(btnCam);
    tr.appendChild(tdCam);
    tbody.appendChild(tr);
  }
}

// --- 発送行スキャナー起動（個別） ---
// 各行の「📷」を押したときにその行のinputへ読み取り結果を入れます
function startShipmentScanner(targetInput) {
  const readerEl = document.getElementById("barcodeReader");
  readerEl.classList.remove("hidden");
  const scanner = new Html5Qrcode("barcodeReader");
  Html5Qrcode.getCameras().then(cameras => {
    const camId = cameras[0].id;
    scanner.start(
      camId,
      { fps: 10, qrbox: 200 },
      (decoded) => {
        scanner.stop().then(() => {
          readerEl.classList.add("hidden");
          targetInput.value = decoded.trim();
        });
      },
      () => {}
    );
  }).catch(err => alert("カメラ起動エラー: " + err));
}

// --- Firestore に案件＋発送情報を登録 ---
// 「登録」ボタン実行時に呼び出されます
async function saveCaseToFirestore() {
  // 案件情報取得
  const orderNo = document.getElementById("orderNumberInput").value.trim();
  const customer= document.getElementById("customerInput").value.trim();
  const product = document.getElementById("productInput").value.trim();
  if (!orderNo || !customer || !product) {
    alert("受注番号・得意先・品名を入力してください");
    return;
  }
  // 発送情報：全行登録
  const rows = Array.from(document.getElementById("shipmentsBody").children);
  const shipments = [];
  for (const tr of rows) {
    const sel = tr.children[1].firstElementChild.value;
    const track = tr.children[2].firstElementChild.value.trim();
    // 追跡番号ありで運送会社未選択ならエラー
    if (track && !sel) {
      alert("追跡番号が入力されています。運送会社を選択してください");
      return;
    }
    if (sel && track) {
      shipments.push({ carrier: sel, tracking: track });
    }
  }
  // Firestore ドキュメント作成
  try {
    const docRef = await addDoc(collection(db, "cases"), {
      orderNumber: orderNo,
      customer:    customer,
      product:     product,
      shipments:   shipments,
      createdAt:   serverTimestamp()
    });
    alert("登録完了: ID=" + docRef.id);
    loadCases();
    showView(menuView);
  } catch (e) {
    alert("登録エラー: " + e.message);
  }
}

// --- Firestore から案件一覧取得と表示 ---
// 検索／フィルタなしで全件取得し、管理者は削除ボタンも表示
async function loadCases() {
  const qSnap = await getDocs(query(collection(db, "cases"), orderBy("createdAt", "desc")));
  const list = document.getElementById("casesList");
  list.innerHTML = "";
  qSnap.forEach(docSnap => {
    const d = docSnap.data();
    const div = document.createElement("div");
    div.className = "case-item";
    // 管理者ならチェックボックスを追加
    if (auth.currentUser && ADMIN_UIDS.includes(auth.currentUser.uid)) {
      const chk = document.createElement("input");
      chk.type = "checkbox";
      chk.value = docSnap.id;
      chk.className = "case-select";
      div.appendChild(chk);
    }
    const span = document.createElement("span");
    const dateStr = d.createdAt ? d.createdAt.toDate().toLocaleString() : "";
    span.textContent = `${d.orderNumber} | ${d.customer} | ${d.product} (${dateStr})`;
    div.appendChild(span);
    // 管理者は個別削除ボタンも
    if (auth.currentUser && ADMIN_UIDS.includes(auth.currentUser.uid)) {
      const btn = document.createElement("button");
      btn.textContent = "削除";
      btn.addEventListener("click", () => deleteCase(docSnap.id));
      div.appendChild(btn);
    }
    list.appendChild(div);
  });
}

/**
 * 単一案件削除処理（管理者のみ実行可能）
 * @param {string} caseId - 削除対象ドキュメントのID
 */
async function deleteCase(caseId) {
  if (!confirm("この案件を削除してもよろしいですか？")) return;
  try {
    await deleteDoc(doc(db, "cases", caseId));
    alert("削除しました");
    loadCases(); // 一覧を再読み込み
  } catch (e) {
    alert("削除エラー: " + e.message);
  }
}

/**
 * 検索キーワードと日付範囲で一覧をフィルタリング
 */
async function filterCases() {
  const kw = document.getElementById("searchInput").value.trim().toLowerCase();
  const sd = document.getElementById("startDateInput").value; // YYYY-MM-DD
  const ed = document.getElementById("endDateInput").value;   // YYYY-MM-DD

  // ベースクエリ：作成日時降順
  let baseQuery = query(collection(db, "cases"), orderBy("createdAt", "desc"));
  const qSnap = await getDocs(baseQuery);

  const list = document.getElementById("casesList");
  list.innerHTML = "";

  qSnap.forEach(docSnap => {
    const d = docSnap.data();
    // キーワードフィルタ
    if (kw) {
      const combined = `${d.orderNumber} ${d.customer} ${d.product}`.toLowerCase();
      if (!combined.includes(kw)) return;
    }
    // 日付範囲フィルタ
    const createdAt = d.createdAt ? d.createdAt.toDate().toISOString().slice(0,10) : "";
    if (sd && createdAt < sd) return;
    if (ed && createdAt > ed) return;

    // 表示要素生成
    const div = document.createElement("div");
    div.className = "case-item";
    // 管理者チェックボックス
    if (auth.currentUser && ADMIN_UIDS.includes(auth.currentUser.uid)) {
      const chk = document.createElement("input");
      chk.type = "checkbox";
      chk.value = docSnap.id;
      chk.className = "case-select";
      div.appendChild(chk);
    }
    const span = document.createElement("span");
    const dateStr = d.createdAt ? d.createdAt.toDate().toLocaleString() : "";
    span.textContent = `${d.orderNumber} | ${d.customer} | ${d.product} (${dateStr})`;
    div.appendChild(span);
    // 管理者削除ボタン
    if (auth.currentUser && ADMIN_UIDS.includes(auth.currentUser.uid)) {
      const btn = document.createElement("button");
      btn.textContent = "削除";
      btn.addEventListener("click", () => deleteCase(docSnap.id));
      div.appendChild(btn);
    }
    list.appendChild(div);
  });
}

/**
 * 詳細画面へ遷移し、案件詳細と発送情報を取得・表示
 * @param {string} caseId - 詳細表示するドキュメントID
 */
async function showCaseDetails(caseId) {
  try {
    const docSnap = await getDoc(doc(db, "cases", caseId));
    if (!docSnap.exists()) {
      alert("該当する案件がありません");
      return;
    }
    const d = docSnap.data();
    // 情報画面
    const info = document.getElementById("detailsInfo");
    info.innerHTML = `
      <p><strong>受注番号:</strong> ${d.orderNumber}</p>
      <p><strong>得意先:</strong> ${d.customer}</p>
      <p><strong>品名:</strong> ${d.product}</p>
    `;
    // 発送情報リスト
    const listEl = document.getElementById("shipmentsList");
    listEl.innerHTML = "";
    (d.shipments || []).forEach((sh, idx) => {
      const div = document.createElement("div");
      div.innerHTML = `
        <p>
          ${idx + 1}. ${translateCarrier(sh.carrier)} / ${sh.tracking}
          <button data-carrier="${sh.carrier}" data-tracking="${sh.tracking}" class="trackBtn">ステータス取得</button>
          <span class="status"></span>
        </p>
      `;
      listEl.appendChild(div);
    });
    // 発送情報追加
    document.getElementById("addMoreShipmentsDetailsButton").onclick = () => {
      // 仮置きで addMoreShipmentRows(5) を呼びなら追加
      addMoreShipmentRows(5);
    };
    // 案件削除
    document.getElementById("deleteCaseButton").onclick = () => deleteCase(caseId);

    // ステータス取得ボタン
    listEl.querySelectorAll(".trackBtn").forEach(btn => {
      btn.addEventListener("click", async () => {
        const car = btn.dataset.carrier;
        const trk = btn.dataset.tracking;
        const staEl = btn.nextElementSibling;
        staEl.textContent = "取得中...";
        try {
          const res = await fetch(`${window.TRACKING_API_URL}?carrier=${encodeURIComponent(car)}&tracking=${encodeURIComponent(trk)}`);
          const data = await res.json();
          staEl.textContent = `${data.state || data.status} (${data.time || data.deliveredAt || ""})`;
        } catch (e) {
          staEl.textContent = "取得失敗";
        }
      });
    });

    showView(detailsView);
  } catch (e) {
    alert("詳細取得エラー: " + e.message);
  }
}

/************* 補助関数 *************/

/**
 * 運送会社コードを日本語文字列に変換
 * @param {string} code - 'yamato', 'sagawa', etc.
 * @returns {string}
 */
function translateCarrier(code) {
  switch (code) {
    case "yamato": return "ヤマト運輸";
    case "sagawa": return "佐川急便";
    case "seino":  return "西濃運輸";
    case "tonami": return "トナミ運輸";
    case "fukutsu":return "福山通運";
    case "hida":   return "飛騨運輸";
    default:       return code;
  }
}

