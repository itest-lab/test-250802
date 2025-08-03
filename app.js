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
// QR/バーコードスキャナー用のグローバル変数
// 2D スキャン用（案件情報の開始コードやスタート画面）と 1D スキャン用（追跡番号）
let qrReader2d = null;
let qrReaderStart = null;
let qrReader1d = null;
// 現在スキャン対象となっている追跡番号入力欄
let currentBarcodeInput = null;

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
    // 一部のバーコードには "ZLIB64:" というプレフィックスが付与されているため、これを取り除く
    let base64 = str;
    if (typeof base64 === "string" && base64.startsWith("ZLIB64:")) {
      base64 = base64.substring(7);
    }
    // 空白や改行など不正な文字が含まれている場合は削除する
    base64 = base64.replace(/\s/g, "");
    const binaryStr = atob(base64);
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
  // 新規登録の準備として各入力欄を初期化
  resetAddCaseForms();
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
  // 発送情報テーブルを初期化（10 行）
  initShipmentsTable();
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
    // Enter キーで次の追跡番号入力へ移動する
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const currentRow = e.target.closest('tr');
        if (currentRow) {
          const nextRow = currentRow.nextElementSibling;
          if (nextRow) {
            const nextInputCell = nextRow.children[2];
            if (nextInputCell) {
              const nextInput = nextInputCell.querySelector('input');
              if (nextInput) nextInput.focus();
            }
          }
        }
      }
    });
    tdTrack.appendChild(inp);
    // PC ではカメラ列を表示しないため、画面幅に応じてカメラ列を追加
    const isPC = window.matchMedia('(min-width: 768px)').matches;
    if (!isPC) {
      const tdCam = document.createElement('td');
      tdCam.classList.add('camera-col');
      const btn = document.createElement('button');
      btn.textContent = '';
      btn.addEventListener('click', () => {
        // スマホではバーコードスキャンを開始し、読み取った値をこの行の追跡番号欄に設定
        start1dScanForInput(inp);
      });
      tdCam.appendChild(btn);
      tr.append(tdIdx, tdCo, tdTrack, tdCam);
    } else {
      tr.append(tdIdx, tdCo, tdTrack);
    }
    tbody.appendChild(tr);
  }
}

// —————————————
// 発送情報登録処理（運送会社未選択チェック）
// —————————————
async function saveCase() {
  const tbody = document.getElementById("shipmentsBody");
  const statusEl = document.getElementById("shipmentsStatus");
  if (statusEl) statusEl.textContent = "";
  // エラー表示をリセット
  document.querySelectorAll('#shipmentsBody tr').forEach(row => row.classList.remove('error'));
  const shipments = [];
  let hasError = false;
  for (const row of tbody.children) {
    const co = row.children[1].firstChild.value;
    const tn = row.children[2].firstChild.value.trim();
    // 追跡番号が入力されている場合は shipments に追加。未入力の場合は無視。
    if (tn) {
      // 運送会社が未選択の場合はエラー
      if (!co) {
        row.classList.add('error');
        hasError = true;
      }
      shipments.push({ carrier: co, trackingNumber: tn });
    }
  }
  if (hasError) {
    if (statusEl) statusEl.textContent = "追跡番号が入力されている行で運送会社を選択してください。";
    return;
  }
  // 案件情報を取得
  const orderNumber = toHalfWidth(document.getElementById('orderNumberInput').value.trim());
  const customer    = toHalfWidth(document.getElementById('customerInput').value.trim());
  const product     = toHalfWidth(document.getElementById('productInput').value.trim());
  // 必須チェック
  if (!orderNumber || !customer || !product) {
    if (statusEl) statusEl.textContent = '受注番号・得意先・品名を全て入力してください。';
    return;
  }
  try {
    await db.collection('cases').add({
      orderNumber,
      customer,
      product,
      shipments,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdBy: auth.currentUser ? auth.currentUser.uid : null
    });
    alert('登録しました');
    // フォームを初期化し、メニューに戻る
    resetAddCaseForms();
    showView('menuView');
    // 一覧を更新
    loadCasesList();
  } catch (e) {
    if (statusEl) statusEl.textContent = '登録に失敗しました: ' + e.message;
  }
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
    // 一括削除ボタンを追加
    const delSelected = document.createElement("button");
    delSelected.textContent = "選択削除";
    delSelected.addEventListener("click", e => {
      e.stopPropagation();
      deleteSelectedCases();
    });
    selectAllDiv.appendChild(delSelected);
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
    // 詳細情報を縦並びで表示
    const detailsDiv = document.getElementById('detailsInfo');
    detailsDiv.innerHTML = '';
    const infoItems = [
      { label: '受注番号', value: data.orderNumber || '' },
      { label: '得意先', value: data.customer || '' },
      { label: '品名', value: data.product || '' }
    ];
    infoItems.forEach(item => {
      const p = document.createElement('p');
      p.textContent = `${item.label}: ${item.value}`;
      detailsDiv.appendChild(p);
    });
    const shipmentsDiv = document.getElementById("shipmentsList");
    shipmentsDiv.innerHTML = "";
    // 発送情報があれば、追跡APIからステータスと時刻を取得して表示する
    if (data.shipments && Array.isArray(data.shipments)) {
      const carrierUrls = {
        yamato: "https://track.kuronekoyamato.co.jp/ytc/searchItem?number=",
        sagawa: "https://k2k.sagawa-exp.co.jp/p/sagawa/web/okurijosearch.do?okurijoNo=",
        seino:  "https://track.seino.co.jp/kamotsu/GempyoSndChnTrack?rno=",
        tonami: "https://toi.tonami.co.jp/tonami/TrackingServlet?wght_no1=",
        fukutsu:"https://corp.fukutsu.co.jp/apps/parcel-search/search/index?number=",
        hida:   ""
      };
      const statusPromises = data.shipments.map(async (ship, idx) => {
        const carrier = ship.carrier;
        const tracking = ship.trackingNumber || "";
        let status = "-";
        let time = "";
        // API 呼び出し
        if (carrier && tracking) {
          try {
            const response = await fetch(`https://track-api.hr46-ksg.workers.dev/?carrier=${carrier}&tracking=${tracking}`);
            if (response.ok) {
              const json = await response.json();
              // 応答が配列の場合も考慮
              if (json && (json.status || (json.data && json.data.status))) {
                status = json.status || (json.data && json.data.status) || status;
                time = json.time || (json.data && json.data.time) || time;
              }
            }
          } catch (e) {
            console.warn('tracking api error', e);
          }
        }
        const p = document.createElement('p');
        p.textContent = `${idx+1}. ${translateCarrier(carrier)}, ${tracking}：${status}${time ? ` (${time})` : ''}`;
        // クリックで各運送会社の追跡サイトを開く
        p.style.cursor = 'pointer';
        p.addEventListener('click', () => {
          const urlBase = carrierUrls[carrier] || '';
          if (urlBase) {
            const url = urlBase + encodeURIComponent(tracking);
            window.open(url, '_blank');
          }
        });
        shipmentsDiv.appendChild(p);
      });
      await Promise.all(statusPromises);
    }
    // 一般ユーザーでは案件削除ボタンを表示しない
    const user = auth.currentUser;
    const isAdminUser = user && ADMIN_UIDS.includes(user.uid);
    const delBtn = document.getElementById('deleteCaseButton');
    if (delBtn) {
      if (isAdminUser) {
        delBtn.classList.remove('hidden');
      } else {
        delBtn.classList.add('hidden');
      }
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
// 選択された案件の一括削除（管理者のみ）
// —————————————
async function deleteSelectedCases() {
  // 現在一覧に表示されている案件から選択されているものを収集
  const checkboxes = Array.from(document.querySelectorAll('.case-select'));
  const targetIds = checkboxes
    .filter(cb => cb.dataset.caseId && cb.checked)
    .map(cb => cb.dataset.caseId);
  if (targetIds.length === 0) {
    alert("削除する案件を選択してください");
    return;
  }
  if (!confirm(`選択された ${targetIds.length} 件の案件を削除しますか？`)) {
    return;
  }
  try {
    for (const id of targetIds) {
      await db.collection("cases").doc(id).delete();
    }
    alert("削除しました");
    loadCasesList();
  } catch (e) {
    alert("一括削除に失敗しました: " + e.message);
  }
}

// —————————————
// 案件追加フォーム（バーコード→案件入力→発送情報）を初期状態にする
// —————————————
function resetAddCaseForms() {
  // スタート画面
  const barcodeInput = document.getElementById('barcodeInput');
  if (barcodeInput) barcodeInput.value = '';
  const startStatus = document.getElementById('startStatus');
  if (startStatus) startStatus.textContent = '';
  // 案件情報入力
  ['orderNumberInput','customerInput','productInput'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const caseStatus = document.getElementById('caseStatus');
  if (caseStatus) caseStatus.textContent = '';
  // 発送情報入力
  const shipmentsBody = document.getElementById('shipmentsBody');
  if (shipmentsBody) shipmentsBody.innerHTML = '';
  const carrierAll = document.getElementById('carrierAllSelect');
  if (carrierAll) carrierAll.value = '';
  const shipmentsStatus = document.getElementById('shipmentsStatus');
  if (shipmentsStatus) shipmentsStatus.textContent = '';
  const caseSummary = document.getElementById('caseSummary');
  if (caseSummary) caseSummary.textContent = '';
}

// —————————————
// 発送情報テーブルを初期化（未行の場合 10 行を生成）
// —————————————
function initShipmentsTable() {
  const body = document.getElementById('shipmentsBody');
  if (!body) return;
  if (body.children.length === 0) {
    addShipmentsRows(10);
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
// QR/バーコードスキャン制御
// —————————————
/**
 * 2次元バーコード (ZLIB64 対応) を読み取り、新規案件として処理する。
 */
function start2dScan(containerId) {
  const scanContainer = document.getElementById(containerId);
  if (!scanContainer) return;
  scanContainer.classList.remove('hidden');
  // 既存のリーダを停止して破棄
  if (qrReader2d) {
    try { qrReader2d.stop(); } catch (e) {}
    qrReader2d = null;
  }
  // id は containerId と同じ要素にする
  qrReader2d = new Html5Qrcode(containerId);
  qrReader2d.start(
    { facingMode: 'environment' },
    { fps: 10, qrbox: 250 },
    (decodedText, decodedResult) => {
      // 読み取り成功時
      const text = toHalfWidth(decodedText.trim());
      // スタートビューの読み取りの場合は barcodeInput に入力
      if (containerId === 'startQrReader') {
        const barcodeInput = document.getElementById('barcodeInput');
        if (barcodeInput) barcodeInput.value = text;
      }
      // ZLIB64 処理
      processStartCode(text);
      qrReader2d.stop().then(() => {
        scanContainer.classList.add('hidden');
        qrReader2d = null;
      });
    },
    (errorMessage) => {
      // 読み取り失敗時は何もしない
    }
  );
}

/**
 * 1次元バーコード (追跡番号) を読み取り、指定された入力欄に結果を格納する。
 * @param {HTMLInputElement} inputElem
 */
function start1dScanForInput(inputElem) {
  const barcodeContainer = document.getElementById('barcodeReader');
  if (!barcodeContainer) return;
  // 既にスキャン中であれば無視
  if (currentBarcodeInput) return;
  currentBarcodeInput = inputElem;
  barcodeContainer.classList.remove('hidden');
  // 停止済みでなければ停止
  if (qrReader1d) {
    try { qrReader1d.stop(); } catch (e) {}
    qrReader1d = null;
  }
  qrReader1d = new Html5Qrcode('barcodeReader');
  qrReader1d.start(
    { facingMode: 'environment' },
    { fps: 10 },
    (decodedText, decodedResult) => {
      const text = toHalfWidth(decodedText.trim());
      if (currentBarcodeInput) {
        currentBarcodeInput.value = text;
      }
      qrReader1d.stop().then(() => {
        barcodeContainer.classList.add('hidden');
        qrReader1d = null;
        currentBarcodeInput = null;
      });
    },
    (error) => {
      // 読み取りエラーは無視
    }
  );
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
    // 新規案件追加時には各入力欄を初期化
    resetAddCaseForms();
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
    // 新規入力のためフォームを初期化
    resetAddCaseForms();
    showView("caseInputView");
    document.getElementById("orderNumberInput").focus();
    // 手動入力に切り替える際は 2 次元バーコード領域を隠し、ボタンの文言を更新
    const scanContainer = document.getElementById("scan2dContainer");
    if (scanContainer) {
      scanContainer.classList.add("hidden");
    }
    // ボタンの表示をバーコード入力に更新
    document.getElementById("switchInputModeButton").textContent = "バーコード入力";
  });

  // スタート画面：カメラ起動で 2次元バーコードを読み取る
  document.getElementById('barcodeCameraButton').addEventListener('click', () => {
    start2dScan('startQrReader');
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
      // スキャン表示時は手動入力へ切り替えるボタンを表示
      document.getElementById("switchInputModeButton").textContent = "手動入力に切り替え";
    } else {
      scanContainer.classList.add("hidden");
      // スキャンを閉じたらバーコード入力ボタンにする
      document.getElementById("switchInputModeButton").textContent = "バーコード入力";
    }
  });

  // 2次元スキャンボタン
  document.getElementById('scan2dButton').addEventListener('click', () => {
    start2dScan('qrReader');
  });

  // 案件情報：次へ
  document.getElementById("caseNextButton").addEventListener("click", () => {
    // 発送情報入力画面を表示し、サマリーと初期行を設定
    showView("shipmentsView");
    populateCaseSummary();
    initShipmentsTable();
  });

  // 案件情報：戻る
  document.getElementById("backToMenuFromCaseButton").addEventListener("click", () => {
    showView("menuView");
  });

  // 発送情報：行追加
  document.getElementById("addMoreShipmentsButton").addEventListener("click", () => addShipmentsRows(5));

  // 発送情報：登録
  document.getElementById("saveCaseButton").addEventListener("click", saveCase);

  // 発送情報：全体運送会社変更
  document.getElementById('carrierAllSelect').addEventListener('change', e => {
    const value = e.target.value;
    // すべての個別運送会社セレクトに値を反映
    document.querySelectorAll('#shipmentsBody select').forEach(sel => {
      sel.value = value;
    });
  });

  // 発送情報：戻る（案件情報入力へ）
  document.getElementById("backToCaseButton").addEventListener("click", () => {
    // 案件情報入力画面に戻る
    showView("caseInputView");
  });
  // 発送情報：メニューへ戻る
  document.getElementById("backToMenuFromShipmentsButton").addEventListener("click", () => {
    showView("menuView");
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