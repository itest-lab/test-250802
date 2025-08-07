// main.js

// --- Firebase 初期化 ---
const firebaseConfig = {
  apiKey:            "AIzaSyArSM1XI5MLkZDiDdzkLJxBwvjM4xGWS70",
  authDomain:        "test-250724.firebaseapp.com",
  databaseURL:       "https://test-250724-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId:         "test-250724",
  storageBucket:     "test-250724.appspot.com",
  messagingSenderId: "252374655568",
  appId:             "1:252374655568:web:3e583b46468714b7b7a755",
  measurementId:     "G-5WGPKD9BP2"
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();

// デバイス判定（モバイル）
const isMobileDevice = /Mobi|Android/i.test(navigator.userAgent);


// セッション永続化をブラウザのセッション単位に設定
auth.setPersistence(firebase.auth.Auth.Persistence.SESSION)
  .catch(err => {
    console.error("永続化設定エラー:", err);
  });

const db = firebase.database();

// キャリアラベル
const carrierLabels = {
  yamato:  "ヤマト運輸",
  fukutsu: "福山通運",
  seino:   "西濃運輸",
  tonami:  "トナミ運輸",
  hida:    "飛騨運輸",
  sagawa:  "佐川急便"
};

// 各社の追跡ページURL
const carrierUrls = {
  yamato:  "https://member.kms.kuronekoyamato.co.jp/parcel/detail?pno=",
  fukutsu: "https://corp.fukutsu.co.jp/situation/tracking_no_hunt/",
  seino:   "https://track.seino.co.jp/cgi-bin/gnpquery.pgm?GNPNO1=",
  tonami:  "https://trc1.tonami.co.jp/trc/search3/excSearch3?id[0]=",
  // 飛騨運輸の追跡ページはAPI非対応のため固定URLに遷移させる
  hida:    "http://www.hida-unyu.co.jp/WP_HIDAUNYU_WKSHO_GUEST/KW_UD04015.do?_Action_=a_srcAction",
  sagawa:  "https://k2k.sagawa-exp.co.jp/p/web/okurijosearch.do?okurijoNo="
};

let isAdmin = false;
let sessionTimer;
let currentOrderId = null;

// --- DOM取得 ---
const loginView             = document.getElementById("login-view");
const mainView              = document.getElementById("main-view");
const loginErrorEl          = document.getElementById("login-error");
const emailInput            = document.getElementById("email");
const passwordInput         = document.getElementById("password");
const loginBtn              = document.getElementById("login-btn");
const signupBtn             = document.getElementById("signup-btn");
const guestBtn              = document.getElementById("guest-btn");
const resetBtn              = document.getElementById("reset-btn");
const logoutBtn             = document.getElementById("logout-btn");

// 新規登録ビュー関連
const signupView            = document.getElementById("signup-view");
const signupEmail           = document.getElementById("signup-email");
const signupPassword        = document.getElementById("signup-password");
const signupConfirmPassword = document.getElementById("signup-confirm-password");
const signupConfirmBtn      = document.getElementById("signup-confirm-btn");
const backToLoginBtn        = document.getElementById("back-to-login-btn");
const signupErrorEl         = document.getElementById("signup-error");

const navAddBtn             = document.getElementById("nav-add-btn");
const navSearchBtn          = document.getElementById("nav-search-btn");

const scanModeDiv           = document.getElementById("scan-mode");
const manualModeDiv         = document.getElementById("manual-mode");
const startManualBtn        = document.getElementById("start-manual-btn");
const caseBarcodeInput      = document.getElementById("case-barcode");
const manualOrderIdInput    = document.getElementById("manual-order-id");
const manualCustomerInput   = document.getElementById("manual-customer");
const manualTitleInput      = document.getElementById("manual-title");
const manualConfirmBtn      = document.getElementById("manual-confirm-btn");
const startScanBtn          = document.getElementById("start-scan-btn");

const caseDetailsDiv        = document.getElementById("case-details");
const detailOrderId         = document.getElementById("detail-order-id");
const detailCustomer        = document.getElementById("detail-customer");
const detailTitle           = document.getElementById("detail-title");

const fixedCarrierCheckbox  = document.getElementById("fixed-carrier-checkbox");
const fixedCarrierSelect    = document.getElementById("fixed-carrier-select");
const trackingRows          = document.getElementById("tracking-rows");
const addTrackingRowBtn     = document.getElementById("add-tracking-row-btn");
const confirmAddCaseBtn     = document.getElementById("confirm-add-case-btn");
const addCaseMsg            = document.getElementById("add-case-msg");
const anotherCaseBtn        = document.getElementById("another-case-btn");

const searchView            = document.getElementById("search-view");
const searchInput           = document.getElementById("search-input");
const startDateInput        = document.getElementById("start-date");
const endDateInput          = document.getElementById("end-date");
const searchBtn             = document.getElementById("search-btn");
const listAllBtn            = document.getElementById("list-all-btn");
const searchResults         = document.getElementById("search-results");
const deleteSelectedBtn     = document.getElementById("delete-selected-btn");

// 一覧表示用 全選択チェックボックス関連
const selectAllContainer    = document.getElementById("select-all-container");
const selectAllCheckbox     = document.getElementById("select-all-checkbox");

// 全選択チェックボックスの挙動
if (selectAllCheckbox) {
  selectAllCheckbox.onchange = () => {
    const check = selectAllCheckbox.checked;
    const boxes = searchResults.querySelectorAll(".select-case-checkbox");
    boxes.forEach(cb => {
      cb.checked = check;
    });
  };
}

const caseDetailView        = document.getElementById("case-detail-view");
const detailInfoDiv         = document.getElementById("detail-info");
const detailShipmentsUl     = document.getElementById("detail-shipments");
const showAddTrackingBtn    = document.getElementById("show-add-tracking-btn");
const addTrackingDetail     = document.getElementById("add-tracking-detail");
const detailTrackingRows    = document.getElementById("detail-tracking-rows");
const detailAddRowBtn       = document.getElementById("detail-add-tracking-row-btn");
const confirmDetailAddBtn   = document.getElementById("confirm-detail-add-btn");
const detailAddMsg          = document.getElementById("detail-add-msg");
const cancelDetailAddBtn    = document.getElementById("cancel-detail-add-btn");
const fixedCarrierCheckboxDetail = document.getElementById("fixed-carrier-checkbox-detail");
const fixedCarrierSelectDetail   = document.getElementById("fixed-carrier-select-detail");
const backToSearchBtn       = document.getElementById("back-to-search-btn");
const anotherCaseBtn2       = document.getElementById("another-case-btn-2");

// --- セッションタイムスタンプ管理 ---
// 10分以内のリロードはセッション維持する
const SESSION_LIMIT_MS = 10 * 60 * 1000;
function clearLoginTime() {
  localStorage.removeItem('loginTime');
}
function markLoginTime() {
  localStorage.setItem('loginTime', Date.now().toString());
}
function isSessionExpired() {
  const t = parseInt(localStorage.getItem('loginTime') || '0', 10);
  return (Date.now() - t) > SESSION_LIMIT_MS;
}

// ページ読み込み時にセッション期限切れならサインアウト
if (isSessionExpired()) {
  auth.signOut().catch(err => {
    console.warn("セッションタイムアウト時サインアウト失敗:", err);
  });
  clearLoginTime();
}

function showView(id){
  document.querySelectorAll(".subview").forEach(el=>el.style.display="none");
  const target = document.getElementById(id);
  if (target) target.style.display = "block";
  // 画面ごとに最上部入力要素へフォーカス
  switch(id){
    case "add-case-view":
      if(scanModeDiv.style.display !== "none"){
//        caseBarcodeInput.focus();
      } else if(manualModeDiv.style.display !== "none"){
//        manualOrderIdInput.focus();
      }
      break;
    case "search-view":
//      searchInput.focus();
      break;
    case "case-detail-view":
//      showAddTrackingBtn.focus();
      break;
  }
}

// ページロード直後にメール入力へフォーカス
if(loginView.style.display !== "none"){
//  emailInput.focus();
}

// --- 認証監視 ---
auth.onAuthStateChanged(async user => {
  if (user) {
    try {
      // Realtime DB の admins/{uid} が true なら管理者扱い
      const snap = await db.ref(`admins/${user.uid}`).once("value");
      isAdmin = snap.val() === true;
    } catch (e) {
      console.error("管理者判定エラー:", e);
      isAdmin = false;
    }

    loginView.style.display = "none";
    signupView.style.display = "none";
    mainView.style.display = "block";
    showView("add-case-view");
    initAddCaseView();
    startSessionTimer();
    // 管理者の場合は一括削除ボタンの表示を更新
    deleteSelectedBtn.style.display = isAdmin ? "block" : "none";
  } else {
    // ログアウト時
    isAdmin = false;
    loginView.style.display = "block";
    signupView.style.display = "none";
    mainView.style.display = "none";
    clearLoginTime();
  }
});

// --- 認証操作 ---
loginBtn.onclick = async () => {
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  loginErrorEl.textContent = "";
  clearLoginTime();
  try {
    await auth.signInWithEmailAndPassword(email, password);
    markLoginTime();
  } catch (e) {
    loginErrorEl.textContent = e.message;
  }
};
signupBtn.onclick = () => {
  // 新規登録ページへ切り替え
  loginView.style.display = "none";
  signupView.style.display = "block";
  // 入力欄の初期化とエラークリア
  signupEmail.value = emailInput.value.trim() || "";
  signupPassword.value = "";
  signupConfirmPassword.value = "";
  signupErrorEl.textContent = "";
};
guestBtn.onclick = () => {
  auth.signInAnonymously()
    .catch(e => loginErrorEl.textContent = e.message);
};
resetBtn.onclick = () => {
  const email = emailInput.value.trim();
  auth.sendPasswordResetEmail(email)
    .then(() => loginErrorEl.textContent = "再発行メール送信")
    .catch(e => loginErrorEl.textContent = e.message);
};
logoutBtn.onclick = async () => {
  try {
    await auth.signOut();
  } catch (e) {
    console.error("サインアウトエラー:", e);
  }
  // メール・パスワード欄をクリア
  emailInput.value    = "";
  passwordInput.value = "";
  // セッションタイムスタンプ削除
  clearLoginTime();
  // localStorage をまるごとクリア
  localStorage.clear();
};

// ログイン状態が変わったときに呼ばれるリスナー
auth.onAuthStateChanged(user => {
  const statusContainer = document.getElementById('login-status-container');
  statusContainer.textContent = '';  // まずクリア

  if (user) {
    // ログイン中
    // user.email や user.uid など好きな情報を表示できます
    statusContainer.textContent = `${user.email} でログイン中`;
  } else {
    // 未ログイン時はなにも表示しない or 別文言を出してもOK
    statusContainer.textContent = 'ログインしてください';
  }
});

// 新規登録ビュー: 登録処理
signupConfirmBtn.onclick = async () => {
  const email = signupEmail.value.trim();
  const pass  = signupPassword.value;
  const confirmPass = signupConfirmPassword.value;
  signupErrorEl.textContent = "";
  if (!email || !pass || !confirmPass) {
    signupErrorEl.textContent = "全て入力してください";
    return;
  }
  if (pass !== confirmPass) {
    signupErrorEl.textContent = "パスワードが一致しません";
    return;
  }
  try {
    await auth.createUserWithEmailAndPassword(email, pass);
    markLoginTime();
    // アカウント作成後、Firebase の onAuthStateChanged によりメインビューへ遷移
  } catch (e) {
    signupErrorEl.textContent = e.message;
  }
};

// 新規登録ビュー: ログイン画面へ戻る
backToLoginBtn.onclick = () => {
  signupView.style.display = "none";
  loginView.style.display  = "block";
  signupErrorEl.textContent = "";
  loginErrorEl.textContent = "";
};

// --- ナビゲーション ---
navAddBtn.addEventListener("click", () => {
  showView("add-case-view");
  initAddCaseView();
});
navSearchBtn.addEventListener("click", () => {
  showView("search-view");
  // ナビゲーションから検索を開いたときは検索条件をクリアして全件表示
  searchInput.value = "";
  startDateInput.value = "";
  endDateInput.value = "";
  searchAll();
});

// --- 追跡行生成 ---
function createTrackingRow(context="add"){
  const row = document.createElement("div");
  row.className = "tracking-row";
  // 運送会社セレクトの付与
  if (context === "add") {
    if (!fixedCarrierCheckbox.checked) {
      const sel = document.createElement("select");
      sel.innerHTML = `
        <option value="">運送会社選択してください</option>
        <option value="yamato">ヤマト運輸</option>
        <option value="fukutsu">福山通運</option>
        <option value="seino">西濃運輸</option>
        <option value="tonami">トナミ運輸</option>
        <option value="hida">飛騨運輸</option>
        <option value="sagawa">佐川急便</option>`;
      row.appendChild(sel);
    }
  } else {
    if (!fixedCarrierCheckboxDetail.checked) {
      const sel = document.createElement("select");
      sel.innerHTML = `
        <option value="">運送会社選択してください</option>
        <option value="yamato">ヤマト運輸</option>
        <option value="fukutsu">福山通運</option>
        <option value="seino">西濃運輸</option>
        <option value="tonami">トナミ運輸</option>
        <option value="hida">飛騨運輸</option>
        <option value="sagawa">佐川急便</option>`;
      row.appendChild(sel);
    }
  }
  const inp = document.createElement("input");
  inp.type = "text";
  // 入力案内をわかりやすく
  inp.placeholder = "追跡番号を入力してください";
  inp.inputMode = "numeric";
  const uniqueId = `tracking-${Date.now()}-${Math.floor(Math.random()*1000)}`;
  inp.id = uniqueId;
  inp.addEventListener("input", e => {
    e.target.value = e.target.value.replace(/\D/g, "");
  });
  inp.addEventListener("keydown", e => {
    if(e.key === "Enter" || e.key === "Tab"){
      e.preventDefault();
      // いま見えているテキスト入力欄数を覚えておく
      const inputs = Array.from(
        row.parentElement.querySelectorAll('input[type="text"]')
      );
      const countBefore = inputs.length;
      const idx = inputs.indexOf(inp);
  
      if (idx !== -1 && idx < countBefore - 1) {
        // 最後以外なら普通に次へ
        inputs[idx + 1].focus();
      } else {
        // 最後の欄なら行追加
        if (context === "detail") {
          detailAddRowBtn.click();
        } else {
          addTrackingRowBtn.click();
        }
        // 行追加後、元の最後の次の欄（= countBefore 番目）にフォーカス
        setTimeout(() => {
          const newInputs = Array.from(
            row.parentElement.querySelectorAll('input[type="text"]')
          );
          if (newInputs[countBefore]) {
            newInputs[countBefore].focus();
          }
        }, 0);
      }
    }
  });
  row.appendChild(inp);

  // リアルタイムで運送会社未選択行を強調する
  function updateMissingHighlight() {
    // 追跡番号が入力されているか？
    const tnVal = inp.value.trim();
    // コンテキストごとに固定キャリアの有無を考慮
    let carrierVal;
    if (context === "add") {
      carrierVal = fixedCarrierCheckbox.checked ? fixedCarrierSelect.value : row.querySelector("select")?.value;
    } else {
      carrierVal = fixedCarrierCheckboxDetail.checked ? fixedCarrierSelectDetail.value : row.querySelector("select")?.value;
    }
    if (tnVal && !carrierVal) {
      row.classList.add('missing-carrier');
    } else {
      row.classList.remove('missing-carrier');
    }
  }
  // 入力やセレクト変更時に強調を更新
  inp.addEventListener('input', updateMissingHighlight);
  // select は row 内に存在する場合のみ
  const selEl = row.querySelector('select');
  if (selEl) {
    selEl.addEventListener('change', updateMissingHighlight);
  }
  return row;
}

// --- 詳細画面：一括運送会社指定 ---
fixedCarrierCheckboxDetail.onchange = () => {
  fixedCarrierSelectDetail.style.display = fixedCarrierCheckboxDetail.checked ? "inline-block" : "none";
  // 既に追加済みの行についても select を追加／削除
  Array.from(detailTrackingRows.children).forEach(row => {
    const sel = row.querySelector("select");
    if (fixedCarrierCheckboxDetail.checked) {
      if (sel) row.removeChild(sel);
    } else {
      if (!sel) {
        const newSel = document.createElement("select");
        newSel.innerHTML = `
          <option value="">運送会社選択してください</option>
          <option value="yamato">ヤマト運輸</option>
          <option value="fukutsu">福山通運</option>
          <option value="seino">西濃運輸</option>
          <option value="tonami">トナミ運輸</option>
          <option value="hida">飛騨運輸</option>
          <option value="sagawa">佐川急便</option>`;
        row.insertBefore(newSel, row.firstChild);
      }
    }
  });
};

// --- 初期化：案件追加 ---
function initAddCaseView(){
  scanModeDiv.style.display     = "block";
  manualModeDiv.style.display   = "none";
  caseDetailsDiv.style.display  = "none";
  caseBarcodeInput.value        = "";
  manualOrderIdInput.value      = "";
  manualCustomerInput.value     = "";
  manualTitleInput.value        = "";
  addCaseMsg.textContent        = "";
  fixedCarrierCheckbox.checked  = false;
  fixedCarrierSelect.style.display = "none";
  fixedCarrierSelect.value      = "";
  trackingRows.innerHTML        = "";
  for(let i=0;i<10;i++) trackingRows.appendChild(createTrackingRow());
}

// --- 行追加・固定キャリア切替 ---
addTrackingRowBtn.onclick = () => {
  for(let i=0;i<10;i++) trackingRows.appendChild(createTrackingRow());
};
fixedCarrierCheckbox.onchange = () => {
  fixedCarrierSelect.style.display = fixedCarrierCheckbox.checked ? "block" : "none";
  Array.from(trackingRows.children).forEach(row => {
    const sel = row.querySelector("select");
    if(fixedCarrierCheckbox.checked){
      if(sel) row.removeChild(sel);
    } else {
      if(!sel){
        // create a select only, not entire row
        const newSel = document.createElement("select");
        newSel.innerHTML = `
          <option value="">運送会社選択してください</option>
          <option value="yamato">ヤマト運輸</option>
          <option value="fukutsu">福山通運</option>
          <option value="seino">西濃運輸</option>
          <option value="tonami">トナミ運輸</option>
          <option value="hida">飛騨運輸</option>
          <option value="sagawa">佐川急便</option>`;
        row.insertBefore(newSel, row.firstChild);
      }
    }
  });
};

// --- IME無効化 ---
caseBarcodeInput.addEventListener("compositionstart", e => e.preventDefault());

// --- QR→テキスト展開＆表示 ---
caseBarcodeInput.addEventListener("keydown", e => {
  if(e.key !== "Enter") return;
  const raw = caseBarcodeInput.value.trim();
  if(!raw) return;
  let text;
  try{
    if(raw.startsWith("ZLIB64:")){
      const b64 = raw.slice(7);
      const bin = atob(b64);
      const arr = new Uint8Array([...bin].map(c=>c.charCodeAt(0)));
      const dec = pako.inflate(arr);
      text = new TextDecoder().decode(dec);
    } else {
      text = raw;
    }
  }catch(err){
    alert("QRデコード失敗: "+err.message);
    return;
  }
  text = text.trim().replace(/「[^」]*」/g, "");
  const matches = Array.from(text.matchAll(/"([^"]*)"/g), m=>m[1]);
  detailOrderId.textContent  = matches[0] || "";
  detailCustomer.textContent = matches[1] || "";
  detailTitle.textContent    = matches[2] || "";
  scanModeDiv.style.display = "none";
  caseDetailsDiv.style.display = "block";
});

// --- 手動確定 ---
startManualBtn.onclick = () => {
  scanModeDiv.style.display = "none";
  manualModeDiv.style.display = "block";
};
startScanBtn.onclick = () => {
  manualModeDiv.style.display = "none";
  scanModeDiv.style.display = "block";
};
manualConfirmBtn.onclick = () => {
  if(!manualOrderIdInput.value || !manualCustomerInput.value || !manualTitleInput.value){
    alert("必須項目を入力");
    return;
  }
  detailOrderId.textContent  = manualOrderIdInput.value.trim();
  detailCustomer.textContent = manualCustomerInput.value.trim();
  detailTitle.textContent    = manualTitleInput.value.trim();
  manualModeDiv.style.display = "none";
  caseDetailsDiv.style.display = "block";
};

// --- 登録 ---
confirmAddCaseBtn.onclick = async () => {
  const orderId  = detailOrderId.textContent.trim();
  const customer = detailCustomer.textContent.trim();
  const title    = detailTitle.textContent.trim();
  if (!orderId || !customer || !title) {
    addCaseMsg.textContent = "情報不足";
    return;
  }
  // 既存データ取得
  const snap = await db.ref(`shipments/${orderId}`).once("value");
  const existObj = snap.val() || {};
  const existSet = new Set(Object.values(existObj).map(it => `${it.carrier}:${it.tracking}`));
  const items = [];
  let missingCarrier = false;
  // 行ごとの強調を初期化
  Array.from(trackingRows.children).forEach(row => {
    row.classList.remove('missing-carrier');
  });
  Array.from(trackingRows.children).forEach(row => {
    const tn = row.querySelector("input").value.trim();
    const carrier = fixedCarrierCheckbox.checked ? fixedCarrierSelect.value : row.querySelector("select")?.value;
    if (tn && !carrier) {
      missingCarrier = true;
      // 視覚的に強調
      row.classList.add('missing-carrier');
    }
    if (!tn || !carrier) return; // 入力不足はスキップ
    const key = `${carrier}:${tn}`;
    if (existSet.has(key)) return;
    existSet.add(key);
    items.push({ carrier, tracking: tn });
  });
  if (missingCarrier) {
    addCaseMsg.textContent = "運送会社を選択してください";
    return;
  }
  if (items.length === 0) {
    alert("新規追跡なし");
    return;
  }
  // ケース情報を保存
  await db.ref(`cases/${orderId}`).set({
    注番: orderId,
    得意先: customer,
    品名: title,
    createdAt: Date.now()
  });
  // 新規追跡を登録
  for (const it of items) {
    await db.ref(`shipments/${orderId}`).push({
      carrier: it.carrier,
      tracking: it.tracking,
      createdAt: Date.now()
    });
  }
  // 完了メッセージをクリアし、詳細画面へ遷移
  addCaseMsg.textContent = "登録完了";
  // 追加完了後に詳細画面を表示
  await showCaseDetail(orderId, { 得意先: customer, 品名: title });
};

// --- 別案件追加ボタン ---
anotherCaseBtn.onclick = () => {
  showView("add-case-view");
  initAddCaseView();
};
anotherCaseBtn2.onclick = () => {
  showView("add-case-view");
  initAddCaseView();
};

// --- 検索結果描画 ---
function renderSearchResults(list){
  searchResults.innerHTML = "";
  // 更新前にチェックボックスイベントをリセット
  list.forEach(item => {
    const li = document.createElement("li");
    // attach orderId to li
    li.dataset.orderId = item.orderId;
    if(isAdmin){
      // 先頭に複数選択用チェックボックス
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "select-case-checkbox";
      checkbox.dataset.orderId = item.orderId;
      li.appendChild(checkbox);
    }
    // テキスト表示
    const span = document.createElement("span");
    span.textContent = `${item.orderId} / ${item.得意先} / ${item.品名}`;
    li.appendChild(span);
    // 行クリックで詳細表示。ただしチェックボックスをクリックしたときは除外
    li.onclick = (e) => {
      if(e.target instanceof HTMLInputElement) return;
      showCaseDetail(item.orderId, item);
    };
    searchResults.appendChild(li);
  });
  // 管理者のみ削除ボタンを表示
  deleteSelectedBtn.style.display = isAdmin ? "block" : "none";

  // 管理者のみ全選択チェックボックスを表示
  if (isAdmin) {
    selectAllContainer.style.display = "block";
  } else {
    selectAllContainer.style.display = "none";
  }
  // 全選択状態をリセット
  if (selectAllCheckbox) selectAllCheckbox.checked = false;

  // 各チェックボックスの状態変更で全選択の状態を更新
  const boxes = searchResults.querySelectorAll(".select-case-checkbox");
  boxes.forEach(cb => {
    cb.onchange = updateSelectAllState;
  });
  // 初期表示時に全選択状態を更新
  updateSelectAllState();
}

// --- 検索／全件 ---
function searchAll(kw=""){
  db.ref("cases").once("value").then(snap => {
    const data = snap.val() || {};
    const res = [];
    const startVal = startDateInput.value;
    const endVal   = endDateInput.value;
    let startTs = null;
    let endTs   = null;
    if (startVal) {
      // 開始日は 00:00:00
      startTs = new Date(startVal + 'T00:00:00').getTime();
    }
    if (endVal) {
      // 終了日は 23:59:59
      const d = new Date(endVal + 'T23:59:59');
      endTs = d.getTime();
    }
    Object.entries(data).forEach(([orderId,obj]) => {
      // キーワード一致判定
      const matchKw = !kw || orderId.includes(kw) || obj.得意先.includes(kw) || obj.品名.includes(kw);
      if (!matchKw) return;
      // 期間絞り込み
      if (startTs !== null && obj.createdAt < startTs) return;
      if (endTs !== null && obj.createdAt > endTs) return;
      res.push({ orderId, ...obj });
    });
    // 新→古順にソート
    res.sort((a,b) => b.createdAt - a.createdAt);
    renderSearchResults(res);
  });
}

// 全選択チェックボックスの状態を更新する関数
function updateSelectAllState() {
  if (!isAdmin) return;
  const boxes = searchResults.querySelectorAll(".select-case-checkbox");
  const checked = searchResults.querySelectorAll(".select-case-checkbox:checked");
  // 全てのチェックボックスがオンの場合のみチェック状態にする
  if (boxes.length > 0 && boxes.length === checked.length) {
    selectAllCheckbox.checked = true;
  } else {
    selectAllCheckbox.checked = false;
  }
}

searchBtn.onclick = () => {
  // キーワードと期間の両方が入力されている場合はリセットして一覧表示
  const kw = searchInput.value.trim();
  const hasKw = kw.length > 0;
  const hasPeriod = startDateInput.value || endDateInput.value;
  showView("search-view");
  if (hasKw && hasPeriod) {
    // 検索条件をクリアして全件表示
    searchInput.value = "";
    startDateInput.value = "";
    endDateInput.value = "";
    searchAll();
  } else {
    searchAll(kw);
  }
};
listAllBtn.onclick = () => {
  // 検索条件をすべてリセットして全件表示
  searchInput.value = "";
  startDateInput.value = "";
  endDateInput.value = "";
  showView("search-view");
  searchAll();
};

// 選択削除ボタンの処理（管理者のみ）
deleteSelectedBtn.onclick = async () => {
  const checkboxes = searchResults.querySelectorAll(".select-case-checkbox:checked");
  const count = checkboxes.length;
  if (count === 0) return;
  if (count === 1) {
    const orderId = checkboxes[0].dataset.orderId;
    if (!confirm(`「${orderId}」を削除しますか？`)) return;
  } else {
    // 複数選択時は一度だけ確認
    if (!confirm('選択案件を削除しますか？')) return;
  }
  for (const cb of checkboxes) {
    const orderId = cb.dataset.orderId;
    try {
      await db.ref(`cases/${orderId}`).remove();
      await db.ref(`shipments/${orderId}`).remove();
    } catch (e) {
      console.error(e);
    }
    cb.closest('li').remove();
  }
  // 削除後に全選択状態を更新
  updateSelectAllState();
};

// --- 詳細＋ステータス取得 ---
async function showCaseDetail(orderId, obj){
  showView("case-detail-view");
  detailInfoDiv.innerHTML = `<div>受注番号: ${orderId}</div><div>得意先:   ${obj.得意先}</div><div>品名: ${obj.品名}</div>`;
  detailShipmentsUl.innerHTML = "";
  currentOrderId = orderId;
  addTrackingDetail.style.display = "none";
  detailTrackingRows.innerHTML = "";
  detailAddMsg.textContent = "";
  detailAddRowBtn.disabled = false;
  confirmDetailAddBtn.disabled = false;
  cancelDetailAddBtn.disabled = false;
  const snap = await db.ref(`shipments/${orderId}`).once("value");
  const list = snap.val() || {};
  for (const key of Object.keys(list)) {
    const it = list[key];
    const label = carrierLabels[it.carrier] || it.carrier;
    const a = document.createElement("a");
    // hida は固定 URL のため追跡番号を追加しない
    if (it.carrier === 'hida') {
      a.href = carrierUrls[it.carrier];
    } else {
      a.href = carrierUrls[it.carrier] + encodeURIComponent(it.tracking);
    }
    a.target = "_blank";
    a.textContent = `${label}：${it.tracking}：読み込み中…`;
    const li = document.createElement("li");
    li.appendChild(a);
    detailShipmentsUl.appendChild(li);
    try {
      const json = await fetchStatus(it.carrier, it.tracking);
      const { status, time } = json;
      a.textContent = formatShipmentText(it.carrier, it.tracking, status, time);
    } catch (err) {
      console.error("fetchStatus error:", err);
      a.textContent = `${label}：${it.tracking}：取得失敗`;
    }
  }
}

backToSearchBtn.onclick = () => showView("search-view");

// ─────────────────────────────────────────────────────────────────
// ３）２次元コード読み取り (jsQR)
// ─────────────────────────────────────────────────────────────────
const canvas = document.createElement('canvas');
async function start2DScanner(inputId) {
  const video = document.getElementById('video2d');
  video.style.display = 'block';
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
  video.srcObject = stream;
  video.play();
  scan2D(video, inputId);
}
function stop2DScanner() {
  const video = document.getElementById('video2d');
  (video.srcObject?.getTracks() || []).forEach(t => t.stop());
  video.srcObject = null;
  video.style.display = 'none';
}
function scan2D(video, inputId) {
  if (video.readyState === video.HAVE_ENOUGH_DATA) {
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(img.data, img.width, img.height);
    if (code) {
      document.getElementById(inputId).value = code.data;
      stop2DScanner();
      return;
    }
  }
  requestAnimationFrame(() => scan2D(video, inputId));
}

// ─────────────────────────────────────────────────────────────────
// ４）１次元バーコード読み取り (QuaggaJS)
// ─────────────────────────────────────────────────────────────────
function start1DScanner(inputId) {
  const video = document.getElementById('video1d');
  video.style.display = 'block';
  Quagga.init({
    inputStream: {
      name: "Live",
      type: "LiveStream",
      target: video,
      constraints: { facingMode: "environment" }
    },
    decoder: {
      readers: [
        "code_128_reader",
        "ean_reader",
        "ean_8_reader",
        "upc_reader",
        "upc_e_reader"
      ]
    }
  }, err => {
    if (err) return console.error(err);
    Quagga.start();
  });
  Quagga.onDetected(result => {
    const code = result.codeResult?.code;
    if (code) {
      document.getElementById(inputId).value = code;
      Quagga.stop();
      video.style.display = 'none';
    }
  });
}

// ─────────────────────────────────────────────────────────────────
// ５）セッションタイムアウト（10分）
// ─────────────────────────────────────────────────────────────────
function resetSessionTimer() {
  clearTimeout(sessionTimer);
  sessionTimer = setTimeout(() => {
    alert('セッションが10分を超えました。再度ログインしてください。');
    auth.signOut();
    // メール・パスワード欄をクリア
    emailInput.value    = "";
    passwordInput.value = "";
  }, SESSION_LIMIT_MS);
}
function startSessionTimer() {
  resetSessionTimer();
  ['click','keydown','touchstart'].forEach(evt => document.addEventListener(evt, resetSessionTimer));
}

// ─────────────────────────────────────────────────────────────────
// 詳細画面：追跡番号追加フォーム操作
// ─────────────────────────────────────────────────────────────────
// 「追跡番号追加」ボタン
showAddTrackingBtn.onclick = () => {
  addTrackingDetail.style.display = "block";
  detailTrackingRows.innerHTML = "";
  // 初回は5行追加
  for (let i = 0; i < 5; i++) {
    detailTrackingRows.appendChild(createTrackingRow("detail"));
  }
  // ボタンを非表示
  showAddTrackingBtn.style.display = "none";
};
// 「＋追跡番号行を5行ずつ追加」
detailAddRowBtn.onclick = () => {
  for (let i = 0; i < 5; i++) {
    detailTrackingRows.appendChild(createTrackingRow("detail"));
  }
};
// 「キャンセル」
cancelDetailAddBtn.onclick = () => {
  addTrackingDetail.style.display = "none";
  detailTrackingRows.innerHTML = "";
  detailAddMsg.textContent = "";
  showAddTrackingBtn.style.display = "inline-block";
};

// fetchStatus ヘルパー
async function fetchStatus(carrier, tracking) {
  // hida の API は非対応なので status/time は返さない
  if (carrier === 'hida') {
    return { status: '非対応', time: null };
  }
  const url = `https://track-api.hr46-ksg.workers.dev/?carrier=${encodeURIComponent(carrier)}&tracking=${encodeURIComponent(tracking)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// 時間ラベルの生成
function getTimeLabel(carrier, status, time) {
  // time が無い場合や既に「：」が含まれている場合はラベルを付与しない
  if (!time || time.includes('：')) {
    return '';
  }        
  // 西濃運輸は常に「最新日時:」
  if (carrier === 'seino') {
    if (status === '配達済みです') {
      return '配達日時:';
    }
    return '最新日時:';
  }
  // ヤマト・トナミは配達完了（またはお届け完了）の場合に「配達日時:」
  if (carrier === 'yamato' || carrier === 'tonami') {
    if (status === '配達完了' || status === 'お届け完了' || status === '配達済み') {
      return '配達日時:';
    }
    return '予定日時:';
  }
  // その他のキャリア：status に「配達完了」が含まれていれば配達日時、それ以外は予定日時
  if (status && status.includes('配達完了')) {
    return '配達日時:';
  }
  return '予定日時:';
}

// テキスト組み立て
function formatShipmentText(carrier, tracking, status, time) {
  const label = carrierLabels[carrier] || carrier;
  // hida は非対応
  if (carrier === 'hida') {
    return `${label}：${tracking}：${status}`;
  }
  const timeLabel = getTimeLabel(carrier, status, time);
  if (time) {
    if (timeLabel) {
      return `${label}：${tracking}：${status}　${timeLabel}${time}`;
    } else {
      return `${label}：${tracking}：${status}　${time}`;
    }
  }
  return `${label}：${tracking}：${status}`;
}

// 「追加登録」
confirmDetailAddBtn.onclick = async () => {
  if (!currentOrderId) return;
  const snap = await db.ref(`shipments/${currentOrderId}`).once("value");
  const existObj = snap.val() || {};
  const existSet = new Set(Object.values(existObj).map(it => `${it.carrier}:${it.tracking}`));
  const newItems = [];
  let missingCarrier = false;
  // 行ごとの強調を初期化
  detailTrackingRows.querySelectorAll(".tracking-row").forEach(row => {
    row.classList.remove('missing-carrier');
  });
  detailTrackingRows.querySelectorAll(".tracking-row").forEach(row => {
    const tn = row.querySelector("input").value.trim();
    if (!tn) return;
    const carrier = fixedCarrierCheckboxDetail.checked ? fixedCarrierSelectDetail.value : row.querySelector("select")?.value;
    if (!carrier) {
      missingCarrier = true;
      // 視覚的に強調
      row.classList.add('missing-carrier');
      return;
    }
    const key = `${carrier}:${tn}`;
    if (existSet.has(key)) return;
    existSet.add(key);
    newItems.push({ carrier, tracking: tn });
  });
  if (missingCarrier) {
    detailAddMsg.textContent = "運送会社を選択してください";
    return;
  }
  if (newItems.length === 0) {
    alert("新規の追跡番号がありません（既に登録済み）");
    return;
  }
  // DB へ登録
  for (const it of newItems) {
    await db.ref(`shipments/${currentOrderId}`).push({ carrier: it.carrier, tracking: it.tracking, createdAt: Date.now() });
  }
  // UI 更新
  const anchorEls = newItems.map(it => {
    const label = carrierLabels[it.carrier] || it.carrier;
    const a = document.createElement("a");
    if (it.carrier === 'hida') {
      a.href = carrierUrls[it.carrier];
    } else {
      a.href = carrierUrls[it.carrier] + encodeURIComponent(it.tracking);
    }
    a.target = "_blank";
    a.textContent = `${label}：${it.tracking}：読み込み中…`;
    const li = document.createElement("li");
    li.appendChild(a);
    detailShipmentsUl.appendChild(li);
    return a;
  });
  // フォームを閉じる
  addTrackingDetail.style.display  = "none";
  detailTrackingRows.innerHTML     = "";
  showAddTrackingBtn.style.display = "inline-block";
  detailAddMsg.textContent         = "追加しました";
  // fetch status and update text
  newItems.forEach((it, idx) => {
    const a = anchorEls[idx];
    fetchStatus(it.carrier, it.tracking)
      .then(json => {
        const { status, time } = json;
        a.textContent = formatShipmentText(it.carrier, it.tracking, status, time);
      })
      .catch(err => {
        console.error("fetchStatus error:", err);
        const label = carrierLabels[it.carrier] || it.carrier;
        a.textContent = `${label}：${it.tracking}：取得失敗`;
      });
  });
};


// --- カメラプレビューオーバーレイ制御 ---
const cameraOverlay = document.getElementById('camera-overlay');
const videoStream = document.getElementById('video-stream');
const toggleLightBtn = document.getElementById('toggle-light');
const closeCameraBtn = document.getElementById('close-camera');
let currentStream = null;
let torchOn = false;

// スキャンモード：カメラ起動
const btnScan2D = document.getElementById('btnScan2D');
if (btnScan2D) {
  btnScan2D.onclick = () => openOverlay('2D', 'case-barcode');
}

// 追跡番号行：カメラ起動ボタンクリック（Event Delegation）
document.addEventListener('click', e => {
  if (e.target && e.target.classList.contains('camera-btn') && e.target.dataset.inputId) {
    openOverlay('1D', e.target.dataset.inputId);
  }
});

async function openOverlay(type, inputId) {
  try {
    cameraOverlay.classList.remove('hidden');
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    currentStream = stream;
    videoStream.srcObject = stream;
    if (type === '2D') {
      scan2D(videoStream, inputId);
    } else {
      start1DScanner(inputId);
    }
  } catch (err) {
    console.error('カメラ起動エラー:', err);
  }
}

toggleLightBtn.onclick = async () => {
  if (!currentStream) return;
  const [track] = currentStream.getVideoTracks();
  const caps = track.getCapabilities();
  if (caps.torch) {
    torchOn = !torchOn;
    await track.applyConstraints({ advanced: [{ torch: torchOn }] });
    toggleLightBtn.textContent = torchOn ? 'ライトOFF' : 'ライトON';
  }
};

closeCameraBtn.onclick = () => {
  if (currentStream) {
    currentStream.getTracks().forEach(t => t.stop());
    currentStream = null;
  }
  cameraOverlay.classList.add('hidden');
};
