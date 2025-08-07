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

// セッション永続化をブラウザのセッション単位に設定
auth.setPersistence(firebase.auth.Auth.Persistence.SESSION)
  .catch(err => console.error("永続化設定エラー:", err));

const db = firebase.database();

// ================================================================
// 画面要素取得
// ================================================================
const loginView             = document.getElementById("login-view");
const signupView            = document.getElementById("signup-view");
const mainView              = document.getElementById("main-view");
const loginErrorEl          = document.getElementById("login-error");
const emailInput            = document.getElementById("email");
const passwordInput         = document.getElementById("password");
const loginBtn              = document.getElementById("login-btn");
const signupBtn             = document.getElementById("signup-btn");
const guestBtn              = document.getElementById("guest-btn");
const resetBtn              = document.getElementById("reset-btn");
const logoutBtn             = document.getElementById("logout-btn");

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

const selectAllContainer    = document.getElementById("select-all-container");
const selectAllCheckbox     = document.getElementById("select-all-checkbox");

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

// 管理者フラグ
let isAdmin = false;
// 現在編集中の受注番号
let currentOrderId = null;

// セッションタイムアウト用定数
const SESSION_LIMIT_MS = 10 * 60 * 1000;

// ================================================================
//  ユーティリティ関数群
// ================================================================

// 画面サブビュー切り替え
function showView(id) {
  document.querySelectorAll(".subview, .view").forEach(el => el.style.display = "none");
  const target = document.getElementById(id);
  if (target) target.style.display = "block";
}

// ログインタイムスタンプ管理（リロード判定用）
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

// 無操作タイマー管理
let inactivityTimer = null;
function resetInactivityTimer() {
  clearTimeout(inactivityTimer);
  inactivityTimer = setTimeout(doLogout, SESSION_LIMIT_MS);
}
function initInactivityMonitor() {
  resetInactivityTimer();
  ['click','keydown','mousemove','touchstart'].forEach(evt =>
    document.addEventListener(evt, resetInactivityTimer, { passive: true })
  );
}
function clearInactivityTimer() {
  clearTimeout(inactivityTimer);
  inactivityTimer = null;
}

// ログアウト共通処理
function doLogout() {
  auth.signOut();
}

// モバイル判定
function isMobileDevice() {
  const ua = navigator.userAgent || navigator.vendor || window.opera;
  return /android|iPad|iPhone|iPod/i.test(ua);
}

// mm → px
function mmToPx(mm) {
  return mm * (96 / 25.4);
}

// カメラ読み取り機能 (html5-qrcode)
let html5QrCode = null, scanningInputId = null, torchOn = false;
async function selectBackCamera() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const backs = devices.filter(d =>
      d.kind === 'videoinput' && /back|rear|environment/i.test(d.label)
    );
    if (backs.length > 1) return backs[1].deviceId;
    if (backs.length === 1) return backs[0].deviceId;
  } catch {}
  return null;
}
async function startScanning(formats, inputId) {
  if (!isMobileDevice()) {
    alert('このデバイスではカメラ機能を利用できません');
    return;
  }
  // 重複起動防止
  if (html5QrCode) {
    await html5QrCode.stop().catch(()=>{});
    html5QrCode.clear();
    html5QrCode = null;
  }
  scanningInputId = inputId;
  // オーバーレイサイズ
  const margin = mmToPx(5)*2;
  let w = window.innerWidth - margin;
  let h = window.innerHeight - margin;
  const ratio = 9/16;
  if (w/h > ratio) w = h*ratio; else h = w/ratio;
  const sc = document.getElementById('scanner-container');
  if (sc) { sc.style.width = w+'px'; sc.style.height = h+'px'; }
  const overlay = document.getElementById('scanner-overlay');
  if (overlay) { overlay.style.display = 'flex'; document.body.style.overflow = 'hidden'; }
  html5QrCode = new Html5Qrcode('video-container', false);
  const backId = await selectBackCamera();
  const constraints = backId ? { deviceId:{exact:backId} } : { facingMode:{exact:'environment'} };
  const config = { fps:10, formatsToSupport:formats, experimentalFeatures:{useBarCodeDetectorIfSupported:true} };
  const onSuccess = decoded => {
    const inputEl = document.getElementById(inputId);
    if (!inputEl) { stopScanning(); return; }
    if (formats.length===1 && formats[0]===Html5QrcodeSupportedFormats.CODABAR) {
      if (decoded.length>=2) {
        const pre = decoded[0], suf = decoded[decoded.length-1];
        if (/[ABCD]/i.test(pre) && /[ABCD]/i.test(suf)) {
          const trimmed = decoded.substring(1,decoded.length-1);
          inputEl.value = trimmed;
          inputEl.dispatchEvent(new Event('input',{bubbles:true}));
          inputEl.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
          stopScanning();
        }
      }
    } else {
      inputEl.value = decoded;
      inputEl.dispatchEvent(new Event('input',{bubbles:true}));
      inputEl.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
      stopScanning();
    }
  };
  await html5QrCode.start(constraints, config, onSuccess, ()=>{}).catch(e=>{
    console.error(e);
    alert('カメラ起動に失敗しました');
    stopScanning();
  });
  // タップでオートフォーカス
  const vc = document.getElementById('video-container');
  if (vc) vc.addEventListener('click',async()=>{
    await html5QrCode.applyVideoConstraints({advanced:[{focusMode:'single-shot'}]}).catch(()=>{});
  });
}
async function stopScanning() {
  if (html5QrCode) {
    await html5QrCode.stop().catch(()=>{});
    html5QrCode.clear();
    html5QrCode = null;
  }
  const overlay = document.getElementById('scanner-overlay');
  if (overlay) overlay.style.display = 'none';
  document.body.style.overflow = '';
  torchOn = false;
}
async function toggleTorch() {
  if (!html5QrCode) return;
  try {
    const settings = html5QrCode.getRunningTrackSettings();
    if (!('torch' in settings)) { alert('ライト非対応'); return; }
    torchOn = !torchOn;
    await html5QrCode.applyVideoConstraints({advanced:[{torch:torchOn}]}).catch(()=>{});
  } catch(e){ console.warn(e); }
}

// カメラ UI 初期化
window.addEventListener('DOMContentLoaded',()=>{
  document.getElementById('close-button')?.addEventListener('click', stopScanning);
  document.getElementById('torch-button')?.addEventListener('click', toggleTorch);
  const caseCamBtn = document.getElementById('case-camera-btn');
  if (caseCamBtn) {
    if (isMobileDevice()) {
      caseCamBtn.style.display = 'block';
      caseCamBtn.addEventListener('click',()=>{
        startScanning(
          [Html5QrcodeSupportedFormats.QR_CODE,Html5QrcodeSupportedFormats.PDF_417],
          'case-barcode'
        );
      });
    } else {
      caseCamBtn.style.display = 'none';
    }
  }
});

// ================================================================
//  単一の認証状態監視 & 画面制御
// ================================================================
auth.onAuthStateChanged(async user => {
  // リロード直後のセッション期限チェック
  if (!user && isSessionExpired()) {
    await auth.signOut().catch(()=>{});
    clearLoginTime();
  }

  if (user) {
    // ── ログイン時処理 ──
    // タイムスタンプ記録
    markLoginTime();
    // 画面切り替え
    loginView.style.display   = 'none';
    signupView.style.display  = 'none';
    mainView.style.display    = 'block';
    showView('add-case-view');
    // 管理者判定
    try {
      const snap = await db.ref(`admins/${user.uid}`).once('value');
      isAdmin = snap.val() === true;
    } catch {
      isAdmin = false;
    }
    // ボタン表示更新
    deleteSelectedBtn.style.display = isAdmin ? 'block' : 'none';
    selectAllContainer.style.display = isAdmin ? 'block' : 'none';
    // 無操作タイマー開始
    initInactivityMonitor();
    // 初期ビュー処理
    initAddCaseView();

  } else {
    // ── ログアウト時処理 ──
    isAdmin = false;
    clearInactivityTimer();
    clearLoginTime();
    // 画面切り替え
    mainView.style.display    = 'none';
    signupView.style.display  = 'none';
    loginView.style.display   = 'block';
  }
});

// ================================================================
//  ログイン／ログアウト／サインアップ／ゲスト／パスリセット
// ================================================================
loginBtn.addEventListener('click', async () => {
  loginErrorEl.textContent = "";
  clearLoginTime();
  try {
    await auth.signInWithEmailAndPassword(emailInput.value.trim(), passwordInput.value);
    // markLoginTime and view switch happen in onAuthStateChanged
  } catch (e) {
    loginErrorEl.textContent = e.message;
  }
});
logoutBtn.addEventListener('click', doLogout);
signupBtn.addEventListener('click', () => {
  loginView.style.display  = 'none';
  signupView.style.display = 'block';
  signupEmail.value = emailInput.value.trim();
  signupPassword.value = "";
  signupConfirmPassword.value = "";
  signupErrorEl.textContent = "";
});
signupConfirmBtn.addEventListener('click', async () => {
  signupErrorEl.textContent = "";
  const email = signupEmail.value.trim();
  const pass  = signupPassword.value;
  const conf  = signupConfirmPassword.value;
  if (!email||!pass||!conf) {
    signupErrorEl.textContent = "全て入力してください";
    return;
  }
  if (pass !== conf) {
    signupErrorEl.textContent = "パスワードが一致しません";
    return;
  }
  try {
    await auth.createUserWithEmailAndPassword(email, pass);
    // onAuthStateChanged will handle view switch
  } catch (e) {
    signupErrorEl.textContent = e.message;
  }
});
backToLoginBtn.addEventListener('click', () => {
  signupView.style.display = 'none';
  loginView.style.display  = 'block';
  signupErrorEl.textContent = "";
  loginErrorEl.textContent  = "";
});
guestBtn.addEventListener('click', () => {
  auth.signInAnonymously().catch(e => loginErrorEl.textContent = e.message);
});
resetBtn.addEventListener('click', () => {
  auth.sendPasswordResetEmail(emailInput.value.trim())
    .then(() => loginErrorEl.textContent = "再発行メール送信")
    .catch(e => loginErrorEl.textContent = e.message);
});

// ================================================================
//  ナビゲーション
// ================================================================
navAddBtn.addEventListener("click", () => {
  showView("add-case-view");
  initAddCaseView();
});
navSearchBtn.addEventListener("click", () => {
  showView("search-view");
  searchInput.value = "";
  startDateInput.value = "";
  endDateInput.value = "";
  searchAll();
});

// ================================================================
//  追跡行生成
// ================================================================
function createTrackingRow(context="add") {
  const row = document.createElement("div");
  row.className = "tracking-row";

  // 運送会社セレクト
  if ((context==="add" && !fixedCarrierCheckbox.checked) ||
      (context==="detail" && !fixedCarrierCheckboxDetail.checked)) {
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

  // 追跡番号入力欄
  const inp = document.createElement("input");
  inp.type = "text";
  inp.placeholder = "追跡番号を入力してください";
  inp.inputMode = "numeric";
  const uniqueId = `${context}-tracking-${Date.now()}-${Math.floor(Math.random()*10000)}`;
  inp.id = uniqueId;
  inp.addEventListener("input", e => {
    e.target.value = e.target.value.replace(/\D/g, "");
  });
  inp.addEventListener("keydown", e => {
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      const inputs = Array.from(row.parentElement.querySelectorAll('input[type="text"]'));
      const idx = inputs.indexOf(inp);
      if (idx < inputs.length - 1) {
        inputs[idx + 1].focus();
      } else {
        if (context === "detail") detailAddRowBtn.click();
        else addTrackingRowBtn.click();
        setTimeout(() => {
          const newInputs = Array.from(row.parentElement.querySelectorAll('input[type="text"]'));
          newInputs[inputs.length]?.focus();
        }, 0);
      }
    }
  });
  row.appendChild(inp);

  // カメラ起動ボタン（モバイル限定）
  if (isMobileDevice()) {
    const camBtn = document.createElement('button');
    camBtn.type = 'button';
    camBtn.textContent = 'カメラ起動';
    camBtn.className = 'camera-btn';
    camBtn.addEventListener('click', () => {
      startScanning([Html5QrcodeSupportedFormats.CODABAR], uniqueId);
    });
    row.appendChild(camBtn);
  }

  // 運送会社未選択強調ロジック
  function updateHighlight() {
    const tn = inp.value.trim();
    const carrier = (context==="add" && fixedCarrierCheckbox.checked)
      ? fixedCarrierSelect.value
      : (context==="detail" && fixedCarrierCheckboxDetail.checked)
        ? fixedCarrierSelectDetail.value
        : row.querySelector("select")?.value;
    if (tn && !carrier) row.classList.add('missing-carrier');
    else row.classList.remove('missing-carrier');
  }
  inp.addEventListener('input', updateHighlight);
  row.querySelector("select")?.addEventListener('change', updateHighlight);

  return row;
}

// ================================================================
//  「案件追加」ビュー初期化
// ================================================================
function initAddCaseView() {
  scanModeDiv.style.display       = "block";
  manualModeDiv.style.display     = "none";
  caseDetailsDiv.style.display    = "none";
  caseBarcodeInput.value          = "";
  manualOrderIdInput.value        = "";
  manualCustomerInput.value       = "";
  manualTitleInput.value          = "";
  addCaseMsg.textContent          = "";
  fixedCarrierCheckbox.checked    = false;
  fixedCarrierSelect.style.display= "none";
  fixedCarrierSelect.value        = "";
  trackingRows.innerHTML          = "";
  for (let i = 0; i < 10; i++) {
    trackingRows.appendChild(createTrackingRow("add"));
  }
}

// 固定キャリア切替
fixedCarrierCheckbox.addEventListener('change', () => {
  fixedCarrierSelect.style.display = fixedCarrierCheckbox.checked ? 'block' : 'none';
  Array.from(trackingRows.children).forEach(row => {
    const sel = row.querySelector('select');
    if (fixedCarrierCheckbox.checked) {
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
});

// 行追加ボタン
addTrackingRowBtn.addEventListener('click', () => {
  for (let i = 0; i < 10; i++) {
    trackingRows.appendChild(createTrackingRow("add"));
  }
});

// ================================================================
//  登録処理
// ================================================================
confirmAddCaseBtn.addEventListener('click', async () => {
  const orderId  = detailOrderId.textContent.trim();
  const customer = detailCustomer.textContent.trim();
  const title    = detailTitle.textContent.trim();
  if (!orderId || !customer || !title) {
    addCaseMsg.textContent = "情報不足";
    return;
  }
  // 既存追跡取得
  const snap = await db.ref(`shipments/${orderId}`).once("value");
  const exist = snap.val() || {};
  const existSet = new Set(Object.values(exist).map(it => `${it.carrier}:${it.tracking}`));
  const items = [];
  let missingCarrier = false;
  trackingRows.querySelectorAll('.tracking-row').forEach(row => row.classList.remove('missing-carrier'));
  trackingRows.querySelectorAll('.tracking-row').forEach(row => {
    const tn = row.querySelector('input').value.trim();
    const carrier = fixedCarrierCheckbox.checked ? fixedCarrierSelect.value : row.querySelector('select')?.value;
    if (tn && !carrier) {
      missingCarrier = true;
      row.classList.add('missing-carrier');
    }
    if (!tn || !carrier) return;
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
  // ケース情報登録
  await db.ref(`cases/${orderId}`).set({
    注番: orderId,
    得意先: customer,
    品名: title,
    createdAt: Date.now()
  });
  // 追跡登録
  for (const it of items) {
    await db.ref(`shipments/${orderId}`).push({
      carrier: it.carrier,
      tracking: it.tracking,
      createdAt: Date.now()
    });
  }
  addCaseMsg.textContent = "登録完了";
  await showCaseDetail(orderId, { 得意先: customer, 品名: title });
});

// 別案件追加
anotherCaseBtn.addEventListener('click', () => {
  showView("add-case-view");
  initAddCaseView();
});
anotherCaseBtn2.addEventListener('click', () => {
  showView("add-case-view");
  initAddCaseView();
});

// ================================================================
//  検索・一覧描画
// ================================================================
function updateSelectAllState() {
  if (!isAdmin) return;
  const boxes   = searchResults.querySelectorAll(".select-case-checkbox");
  const checked = searchResults.querySelectorAll(".select-case-checkbox:checked");
  selectAllCheckbox.checked = boxes.length > 0 && boxes.length === checked.length;
}

selectAllCheckbox?.addEventListener('change', () => {
  const check = selectAllCheckbox.checked;
  searchResults.querySelectorAll(".select-case-checkbox").forEach(cb => { cb.checked = check; });
  updateSelectAllState();
});

function renderSearchResults(list) {
  searchResults.innerHTML = "";
  list.forEach(item => {
    const li = document.createElement("li");
    li.dataset.orderId = item.orderId;
    if (isAdmin) {
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.className = "select-case-checkbox";
      cb.dataset.orderId = item.orderId;
      cb.addEventListener('change', updateSelectAllState);
      li.appendChild(cb);
    }
    const span = document.createElement("span");
    span.textContent = `${item.orderId} / ${item.得意先} / ${item.品名}`;
    li.appendChild(span);
    li.addEventListener('click', e => {
      if (e.target.tagName !== 'INPUT') {
        showCaseDetail(item.orderId, item);
      }
    });
    searchResults.appendChild(li);
  });
  deleteSelectedBtn.style.display  = isAdmin ? 'block' : 'none';
  selectAllContainer.style.display = isAdmin ? 'block' : 'none';
  updateSelectAllState();
}

function searchAll(kw="") {
  db.ref("cases").once("value").then(snap => {
    const data = snap.val() || {};
    const res  = [];
    let startTs = null, endTs = null;
    if (startDateInput.value) {
      startTs = new Date(startDateInput.value + 'T00:00:00').getTime();
    }
    if (endDateInput.value) {
      endTs = new Date(endDateInput.value + 'T23:59:59').getTime();
    }
    Object.entries(data).forEach(([orderId,obj]) => {
      const matchKw = !kw || orderId.includes(kw) || obj.得意先.includes(kw) || obj.品名.includes(kw);
      if (!matchKw) return;
      if (startTs !== null && obj.createdAt < startTs) return;
      if (endTs   !== null && obj.createdAt > endTs)   return;
      res.push({ orderId, ...obj });
    });
    res.sort((a,b) => b.createdAt - a.createdAt);
    renderSearchResults(res);
  });
}

searchBtn.addEventListener('click', () => {
  const kw        = searchInput.value.trim();
  const hasKw     = kw.length > 0;
  const hasPeriod = startDateInput.value || endDateInput.value;
  showView("search-view");
  if (hasKw && hasPeriod) {
    searchInput.value = "";
    startDateInput.value = "";
    endDateInput.value = "";
    searchAll();
  } else {
    searchAll(kw);
  }
});
listAllBtn.addEventListener('click', () => {
  searchInput.value = "";
  startDateInput.value = "";
  endDateInput.value = "";
  showView("search-view");
  searchAll();
});

deleteSelectedBtn.addEventListener('click', async () => {
  const checked = Array.from(searchResults.querySelectorAll(".select-case-checkbox:checked"));
  if (checked.length === 0) return;
  if (checked.length === 1 || confirm('選択案件を削除しますか？')) {
    for (const cb of checked) {
      const orderId = cb.dataset.orderId;
      await db.ref(`cases/${orderId}`).remove();
      await db.ref(`shipments/${orderId}`).remove();
      cb.closest('li').remove();
    }
    updateSelectAllState();
  }
});

// ================================================================
//  詳細表示＋ステータス取得
// ================================================================
const carrierLabels = {
  yamato:  "ヤマト運輸",
  fukutsu: "福山通運",
  seino:   "西濃運輸",
  tonami:  "トナミ運輸",
  hida:    "飛騨運輸",
  sagawa:  "佐川急便"
};
const carrierUrls = {
  yamato:  "https://member.kms.kuronekoyamato.co.jp/parcel/detail?pno=",
  fukutsu: "https://corp.fukutsu.co.jp/situation/tracking_no_hunt/",
  seino:   "https://track.seino.co.jp/cgi-bin/gnpquery.pgm?GNPNO1=",
  tonami:  "https://trc1.tonami.co.jp/trc/search3/excSearch3?id[0]=",
  hida:    "http://www.hida-unyu.co.jp/WP_HIDAUNYU_WKSHO_GUEST/KW_UD04015.do?_Action_=a_srcAction",
  sagawa:  "https://k2k.sagawa-exp.co.jp/p/web/okurijosearch.do?okurijoNo="
};

function getTimeLabel(carrier, status, time) {
  if (!time || time.includes('：')) return '';
  if (carrier === 'seino') {
    return status === '配達済みです' ? '配達日時:' : '最新日時:';
  }
  if (carrier === 'yamato' || carrier === 'tonami') {
    return /配達完了|お届け完了|配達済み/.test(status) ? '配達日時:' : '予定日時:';
  }
  return status.includes('配達完了') ? '配達日時:' : '予定日時:';
}
function formatShipmentText(carrier, tracking, status, time) {
  const label = carrierLabels[carrier] || carrier;
  if (carrier === 'hida') {
    return `${label}：${tracking}：${status}`;
  }
  const tl = getTimeLabel(carrier, status, time);
  return time ? `${label}：${tracking}：${status}　${tl}${time}` 
              : `${label}：${tracking}：${status}`;
}
async function fetchStatus(carrier, tracking) {
  if (carrier === 'hida') return { status:'非対応', time:null };
  const res = await fetch(`https://track-api.hr46-ksg.workers.dev/?carrier=${encodeURIComponent(carrier)}&tracking=${encodeURIComponent(tracking)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function showCaseDetail(orderId, obj) {
  showView("case-detail-view");
  detailInfoDiv.innerHTML = `
    <div>受注番号: ${orderId}</div>
    <div>得意先:   ${obj.得意先}</div>
    <div>品名:     ${obj.品名}</div>`;
  detailShipmentsUl.innerHTML = "";
  currentOrderId = orderId;
  addTrackingDetail.style.display  = "none";
  detailTrackingRows.innerHTML     = "";
  detailAddMsg.textContent         = "";
  detailAddRowBtn.disabled         = false;
  confirmDetailAddBtn.disabled     = false;
  cancelDetailAddBtn.disabled      = false;

  const snap = await db.ref(`shipments/${orderId}`).once("value");
  const list = snap.val() || {};
  for (const key in list) {
    const it = list[key];
    const a = document.createElement("a");
    a.target = "_blank";
    a.textContent = `${carrierLabels[it.carrier] || it.carrier}：${it.tracking}：読み込み中…`;
    if (it.carrier === 'hida') {
      a.href = carrierUrls[it.carrier];
    } else {
      a.href = carrierUrls[it.carrier] + encodeURIComponent(it.tracking);
    }
    const li = document.createElement("li");
    li.appendChild(a);
    detailShipmentsUl.appendChild(li);
    fetchStatus(it.carrier, it.tracking)
      .then(json => {
        a.textContent = formatShipmentText(it.carrier, it.tracking, json.status, json.time);
      })
      .catch(() => {
        a.textContent = `${carrierLabels[it.carrier] || it.carrier}：${it.tracking}：取得失敗`;
      });
  }
}

// --- 詳細画面で追跡番号追加 ---
showAddTrackingBtn.addEventListener('click', () => {
  addTrackingDetail.style.display = "block";
  detailTrackingRows.innerHTML = "";
  for (let i = 0; i < 5; i++) {
    detailTrackingRows.appendChild(createTrackingRow("detail"));
  }
  showAddTrackingBtn.style.display = "none";
});
detailAddRowBtn.addEventListener('click', () => {
  for (let i = 0; i < 5; i++) {
    detailTrackingRows.appendChild(createTrackingRow("detail"));
  }
});
cancelDetailAddBtn.addEventListener('click', () => {
  addTrackingDetail.style.display = "none";
  detailTrackingRows.innerHTML = "";
  detailAddMsg.textContent = "";
  showAddTrackingBtn.style.display = "inline-block";
});
fixedCarrierCheckboxDetail.addEventListener('change', () => {
  fixedCarrierSelectDetail.style.display = fixedCarrierCheckboxDetail.checked ? "inline-block" : "none";
  Array.from(detailTrackingRows.children).forEach(row => {
    const sel = row.querySelector("select");
    if (fixedCarrierCheckboxDetail.checked) {
      if (sel) row.removeChild(sel);
    } else if (!sel) {
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
  });
});
confirmDetailAddBtn.addEventListener('click', async () => {
  if (!currentOrderId) return;
  const snap = await db.ref(`shipments/${currentOrderId}`).once("value");
  const exist = snap.val() || {};
  const existSet = new Set(Object.values(exist).map(it => `${it.carrier}:${it.tracking}`));
  const newItems = [];
  let missingCarrier = false;
  detailTrackingRows.querySelectorAll(".tracking-row").forEach(row => row.classList.remove('missing-carrier'));
  detailTrackingRows.querySelectorAll(".tracking-row").forEach(row => {
    const tn = row.querySelector("input").value.trim();
    if (!tn) return;
    const carrier = fixedCarrierCheckboxDetail.checked
      ? fixedCarrierSelectDetail.value
      : row.querySelector("select")?.value;
    if (!carrier) {
      missingCarrier = true;
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
  // DB 登録＆UI 更新
  for (const it of newItems) {
    await db.ref(`shipments/${currentOrderId}`).push({
      carrier: it.carrier,
      tracking: it.tracking,
      createdAt: Date.now()
    });
  }
  const anchors = newItems.map(it => {
    const a = document.createElement("a");
    a.target = "_blank";
    if (it.carrier === 'hida') {
      a.href = carrierUrls[it.carrier];
    } else {
      a.href = carrierUrls[it.carrier] + encodeURIComponent(it.tracking);
    }
    a.textContent = `${carrierLabels[it.carrier] || it.carrier}：${it.tracking}：読み込み中…`;
    const li = document.createElement("li");
    li.appendChild(a);
    detailShipmentsUl.appendChild(li);
    return a;
  });
  addTrackingDetail.style.display = "none";
  detailTrackingRows.innerHTML = "";
  showAddTrackingBtn.style.display = "inline-block";
  detailAddMsg.textContent = "追加しました";

  anchors.forEach((a, idx) => {
    const it = newItems[idx];
    fetchStatus(it.carrier, it.tracking)
      .then(json => {
        a.textContent = formatShipmentText(it.carrier, it.tracking, json.status, json.time);
      })
      .catch(() => {
        a.textContent = `${carrierLabels[it.carrier] || it.carrier}：${it.tracking}：取得失敗`;
      });
  });
});
