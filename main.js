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
const db = firebase.database();

// セッション永続化をブラウザのセッション単位に設定
auth.setPersistence(firebase.auth.Auth.Persistence.SESSION)
  .catch(err => console.error("永続化設定エラー:", err));

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

// ================================================================
//  スマホ向けカメラ読み取り機能（html5-qrcode）
// ================================================================

// モバイル端末判定関数
function isMobileDevice() {
  const ua = navigator.userAgent || navigator.vendor || window.opera;
  return /android|iPad|iPhone|iPod/i.test(ua);
}

// html5-qrcode 用の変数
let html5QrCode = null;
let torchOn = false;

// mm→px
function mmToPx(mm) { return mm * (96 / 25.4); }

// 背面カメラを選択（複数ある場合は 2 番目を優先）
async function selectBackCamera() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const backs = devices.filter(d => d.kind === 'videoinput' && /back|rear|environment/i.test(d.label));
    if (backs.length > 1) return backs[1].deviceId;
    if (backs.length === 1) return backs[0].deviceId;
  } catch (_) {}
  return null;
}

// スキャン開始
async function startScanning(formats, inputId) {
  if (!isMobileDevice()) {
    alert('このデバイスではカメラ機能を利用できません');
    return;
  }
  if (html5QrCode) {
    try { await html5QrCode.stop(); html5QrCode.clear(); } catch (_) {}
    html5QrCode = null;
  }

  // オーバーレイサイズ調整
  const margin = mmToPx(5) * 2;
  const vw = window.innerWidth, vh = window.innerHeight, ratio = 9/16;
  let w = vw - margin, h = vh - margin;
  if (w / h > ratio) w = h * ratio; else h = w / ratio;
  const sc = document.getElementById('scanner-container');
  if (sc) { sc.style.width = w + 'px'; sc.style.height = h + 'px'; }

  const overlay = document.getElementById('scanner-overlay');
  if (overlay) { overlay.style.display = 'flex'; document.body.style.overflow = 'hidden'; }

  html5QrCode = new Html5Qrcode('video-container', false);
  const backId = await selectBackCamera();
  const constraints = backId ? { deviceId: { exact: backId } } : { facingMode: { exact: 'environment' } };
  const config = {
    fps: 10,
    formatsToSupport: formats,
    experimentalFeatures: { useBarCodeDetectorIfSupported: true },
    useBarCodeDetectorIfSupported: true
  };
  const onSuccess = decoded => {
    try {
      const inputEl = document.getElementById(inputId);
      if (!inputEl) { stopScanning(); return; }
      // CODABAR の A/B/C/D を両端から除去
      if (formats.length === 1 && formats[0] === Html5QrcodeSupportedFormats.CODABAR) {
        if (decoded && decoded.length >= 2) {
          const pre = decoded[0], suf = decoded[decoded.length - 1];
          if (/[ABCD]/i.test(pre) && /[ABCD]/i.test(suf)) {
            inputEl.value = decoded.substring(1, decoded.length - 1);
            inputEl.dispatchEvent(new Event('input', { bubbles: true }));
            inputEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
            stopScanning();
          }
        }
      } else {
        inputEl.value = decoded;
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        inputEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        stopScanning();
      }
    } catch (err) { console.error(err); stopScanning(); }
  };
  try {
    await html5QrCode.start(constraints, config, onSuccess, () => {});
  } catch (e) {
    console.error(e);
    alert('カメラ起動に失敗しました');
    stopScanning();
  }

  const videoContainer = document.getElementById('video-container');
  if (videoContainer) {
    videoContainer.addEventListener('click', async () => {
      if (html5QrCode) {
        try { await html5QrCode.applyVideoConstraints({ advanced: [{ focusMode: 'single-shot' }] }); } catch (_) {}
      }
    });
  }
}

// スキャン停止
async function stopScanning() {
  if (html5QrCode) {
    try { await html5QrCode.stop(); html5QrCode.clear(); } catch (_) {}
    html5QrCode = null;
  }
  const overlay = document.getElementById('scanner-overlay');
  if (overlay) overlay.style.display = 'none';
  document.body.style.overflow = '';
  torchOn = false;
}

// ライトON/OFF
async function toggleTorch() {
  if (!html5QrCode) return;
  try {
    const settings = html5QrCode.getRunningTrackSettings();
    if (!('torch' in settings)) { alert('このデバイスはライトに対応していません'); return; }
    torchOn = !torchOn;
    await html5QrCode.applyVideoConstraints({ advanced: [{ torch: torchOn }] });
  } catch (e) { console.warn(e); }
}

// DOMContentLoaded: カメラボタン初期化
window.addEventListener('DOMContentLoaded', () => {
  const closeBtn = document.getElementById('close-button');
  if (closeBtn) closeBtn.addEventListener('click', () => stopScanning());
  const torchBtn = document.getElementById('torch-button');
  if (torchBtn) torchBtn.addEventListener('click', () => toggleTorch());

  const caseCameraBtn = document.getElementById('case-camera-btn');
  if (caseCameraBtn) {
    if (isMobileDevice()) {
      caseCameraBtn.style.display = 'block';
      caseCameraBtn.addEventListener('click', () => {
        startScanning([Html5QrcodeSupportedFormats.QR_CODE, Html5QrcodeSupportedFormats.PDF_417], 'case-barcode');
      });
    } else {
      caseCameraBtn.style.display = 'none';
    }
  }
});

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
const manualPlateDateInput  = document.getElementById("manual-plate-date");
const manualConfirmBtn      = document.getElementById("manual-confirm-btn");
const startScanBtn          = document.getElementById("start-scan-btn");

const caseDetailsDiv        = document.getElementById("case-details");
const detailOrderId         = document.getElementById("detail-order-id");
const detailCustomer        = document.getElementById("detail-customer");
const detailTitle           = document.getElementById("detail-title");
const detailPlateDate       = document.getElementById("detail-plate-date");

const fixedCarrierCheckbox  = document.getElementById("fixed-carrier-checkbox");
const fixedCarrierSelect    = document.getElementById("fixed-carrier-select");
const trackingRows          = document.getElementById("tracking-rows");
const addTrackingRowBtn     = document.getElementById("add-tracking-row-btn");
const confirmAddCaseBtn     = document.getElementById("confirm-add-case-btn");
const addCaseMsg            = document.getElementById("add-case-msg");
const anotherCaseBtn        = document.getElementById("another-case-btn");

const searchView            = document.getElementById("search-view");
const searchInput           = document.getElementById("search-input");
const searchDateType        = document.getElementById("search-date-type");
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
    boxes.forEach(cb => { cb.checked = check; });
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
const SESSION_LIMIT_MS = 10 * 60 * 1000;
function clearLoginTime() { localStorage.removeItem('loginTime'); }
function markLoginTime()  { localStorage.setItem('loginTime', Date.now().toString()); }
function isSessionExpired(){
  const t = parseInt(localStorage.getItem('loginTime') || '0', 10);
  return (Date.now() - t) > SESSION_LIMIT_MS;
}

// ページ読み込み時にセッション期限切れならサインアウト（ログイン中のみ）
if (auth && auth.currentUser && isSessionExpired()) {
  auth.signOut().catch(err => console.warn("セッションタイムアウト時サインアウト失敗:", err));
  try { localStorage.removeItem('loginTime'); } catch (_) {}
  clearLoginTime();
}

function showView(id){
  document.querySelectorAll(".subview").forEach(el=>el.style.display="none");
  const target = document.getElementById(id);
  if (target) target.style.display = "block";
}

// ログイン状態ラベル
auth.onAuthStateChanged(user => {
  const statusContainer = document.getElementById('login-status-container');
  statusContainer.textContent = '';
  if (user) statusContainer.textContent = (user.email || '匿名') + ' でログイン中';
  else statusContainer.textContent = 'ログインしてください';
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
  loginView.style.display = "none";
  signupView.style.display = "block";
  signupEmail.value = emailInput.value.trim() || "";
  signupPassword.value = "";
  signupConfirmPassword.value = "";
  signupErrorEl.textContent = "";
};
guestBtn.onclick = () => { auth.signInAnonymously().catch(e => loginErrorEl.textContent = e.message); };
resetBtn.onclick = () => {
  const email = emailInput.value.trim();
  auth.sendPasswordResetEmail(email)
    .then(() => loginErrorEl.textContent = "再発行メール送信")
    .catch(e => loginErrorEl.textContent = e.message);
};
logoutBtn.onclick = async () => {
  try { await auth.signOut(); } catch (e) { console.error("サインアウトエラー:", e); }
  emailInput.value = ""; passwordInput.value = ""; clearLoginTime(); localStorage.clear();
};

// 新規登録処理
signupConfirmBtn.onclick = async () => {
  const email = signupEmail.value.trim();
  const pass  = signupPassword.value;
  const confirmPass = signupConfirmPassword.value;
  signupErrorEl.textContent = "";
  if (!email || !pass || !confirmPass) { signupErrorEl.textContent = "全て入力してください"; return; }
  if (pass !== confirmPass) { signupErrorEl.textContent = "パスワードが一致しません"; return; }
  try { await auth.createUserWithEmailAndPassword(email, pass); markLoginTime(); } catch (e) { signupErrorEl.textContent = e.message; }
};
backToLoginBtn.onclick = () => {
  signupView.style.display = "none"; loginView.style.display  = "block";
  signupErrorEl.textContent = ""; loginErrorEl.textContent = "";
};

// --- ナビゲーション ---
navAddBtn.addEventListener("click", () => { showView("add-case-view"); initAddCaseView(); });
navSearchBtn.addEventListener("click", () => {
  showView("search-view");
  searchInput.value = "";
  startDateInput.value = "";
  endDateInput.value = "";
  searchAll();
});

// ─────────────────────────────────────────────────────────────────
// 画像／PDF から PDF417・CODABAR を抽出（PC / カメラ非対応向け）
// ─────────────────────────────────────────────────────────────────
function normalizeCodabar(value) {
  if (!value || value.length < 2) return value || '';
  const pre = value[0], suf = value[value.length - 1];
  if (/[ABCD]/i.test(pre) && /[ABCD]/i.test(suf)) return value.substring(1, value.length - 1);
  return value;
}

async function decodeWithBarcodeDetectorFromBitmap(bitmap){
  if (!('BarcodeDetector' in window)) return null;
  try {
    const det = new BarcodeDetector({ formats: ['pdf417','codabar'] });
    const results = await det.detect(bitmap);
    if (results && results.length) return results[0].rawValue || '';
  } catch (_) {}
  return null;
}
async function decodeFromImage(fileOrBlob){
  try {
    const bmp = await createImageBitmap(fileOrBlob);
    const v = await decodeWithBarcodeDetectorFromBitmap(bmp);
    if (v) return v;
  } catch (_) {}
  if (window.Html5Qrcode) {
    const tmpId = 'file-decode-' + Date.now();
    const div = document.createElement('div');
    div.id = tmpId; div.style.display='none'; document.body.appendChild(div);
    const h5 = new Html5Qrcode(tmpId, false);
    try { return await h5.scanFile(fileOrBlob, false); }
    catch(_) {}
    finally { try { await h5.clear(); } catch (_) {} div.remove(); }
  }
  return null;
}
async function ensurePdfJsLoaded() {
  if (window.pdfjsLib) return;
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    s.onload = resolve; s.onerror = () => reject(new Error('pdf.js の読み込みに失敗'));
    document.head.appendChild(s);
  });
  if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }
}
async function decodeFromPdf(file){
  await ensurePdfJsLoaded();
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = viewport.width; canvas.height = viewport.height;
    await page.render({ canvasContext: ctx, viewport }).promise;
    const blob = await new Promise(res => canvas.toBlob(res));
    if (!blob) continue;
    const v = await decodeFromImage(blob);
    if (v) return v;
  }
  return null;
}
async function scanFileForCodes(file){
  const type = (file.type || '').toLowerCase();
  let v = null;
  if (type.includes('pdf')) v = await decodeFromPdf(file);
  else v = await decodeFromImage(file);
  if (!v) return null;
  return normalizeCodabar(String(v));
}

// --- 追跡行の生成（既存のまま） ---
function createTrackingRow(context="add"){
  const row = document.createElement("div");
  row.className = "tracking-row";
  // 運送会社セレクト
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
  inp.placeholder = "追跡番号を入力してください";
  inp.inputMode = "numeric";
  const uniqueId = `tracking-${Date.now()}-${Math.floor(Math.random()*1000)}`;
  inp.id = uniqueId;
  inp.addEventListener("input", e => { e.target.value = e.target.value.replace(/\D/g, ""); });
  inp.addEventListener("keydown", e => {
    if(e.key === "Enter" || e.key === "Tab"){
      e.preventDefault();
      const inputs = Array.from(row.parentElement.querySelectorAll('input[type="text"]'));
      const countBefore = inputs.length;
      const idx = inputs.indexOf(inp);
      if (idx !== -1 && idx < countBefore - 1) {
        inputs[idx + 1].focus();
      } else {
        if (context === "detail") { detailAddRowBtn.click(); } else { addTrackingRowBtn.click(); }
        setTimeout(() => {
          const newInputs = Array.from(row.parentElement.querySelectorAll('input[type="text"]'));
          if (newInputs[countBefore]) newInputs[countBefore].focus();
        }, 0);
      }
    }
  });
  row.appendChild(inp);

  // 端末がモバイルならカメラボタンを付与（ファイル選択は削除方針）
  (function attachCaptureControls(){
    const canCamera = isMobileDevice() && navigator.mediaDevices && navigator.mediaDevices.getUserMedia;
    if (canCamera) {
      const camBtn = document.createElement('button');
      camBtn.type = 'button';
      camBtn.textContent = 'カメラ起動';
      camBtn.className = 'camera-btn';
      camBtn.addEventListener('click', () => {
        startScanning([Html5QrcodeSupportedFormats.CODABAR], uniqueId);
      });
      row.appendChild(camBtn);
    }
  })();

  // 運送会社未選択の強調
  function updateMissingHighlight() {
    const tnVal = inp.value.trim();
    let carrierVal;
    if (context === "add") {
      carrierVal = fixedCarrierCheckbox.checked ? fixedCarrierSelect.value : row.querySelector("select")?.value;
    } else {
      carrierVal = fixedCarrierCheckboxDetail.checked ? fixedCarrierSelectDetail.value : row.querySelector("select")?.value;
    }
    if (tnVal && !carrierVal) row.classList.add('missing-carrier'); else row.classList.remove('missing-carrier');
  }
  inp.addEventListener('input', updateMissingHighlight);
  const selEl = row.querySelector('select'); if (selEl) selEl.addEventListener('change', updateMissingHighlight);
  return row;
}

// --- 詳細画面：一括運送会社指定（既存） ---
fixedCarrierCheckboxDetail.onchange = () => {
  fixedCarrierSelectDetail.style.display = fixedCarrierCheckboxDetail.checked ? "inline-block" : "none";
  Array.from(detailTrackingRows.children).forEach(row => {
    const sel = row.querySelector("select");
    if (fixedCarrierCheckboxDetail.checked) { if (sel) row.removeChild(sel); }
    else { if (!sel) {
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
    }}
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
  manualPlateDateInput.value    = "";
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

// ★ ヘルパー：日付文字列を YYYY-MM-DD に正規化
function normalizeDateString(s) {
  if (!s) return "";
  // 「YYYY年MM月DD日」や「YYYY/MM/DD」「YYYY-MM-DD」「YYYY.MM.DD」などを許容
  const nums = (s.match(/\d{1,4}/g) || []).map(n => parseInt(n, 10));
  if (nums.length >= 3) {
    let y = nums[0]; let m = nums[1]; let d = nums[2];
    if (y < 100) y = 2000 + y; // 2桁年は 2000+ とする
    m = Math.max(1, Math.min(12, m|0));
    d = Math.max(1, Math.min(31, d|0));
    const dt = new Date(Date.UTC(y, m-1, d));
    const mm = String(dt.getUTCMonth()+1).padStart(2,'0');
    const dd = String(dt.getUTCDate()).padStart(2,'0');
    return `${dt.getUTCFullYear()}-${mm}-${dd}`;
  }
  return "";
}

// ★ ヘルパー：解凍後の配列から「下版日」を抽出
function extractPlateDateField(text) {
  // まずは "xxx" で囲まれた項目を優先
  let fields = Array.from(text.matchAll(/"([^"]*)"/g), m=>m[1]);
  if (fields.length === 0) {
    // カンマ/タブ/改行区切りでも試す
    fields = text.split(/[\,\t\r\n]+/).map(s => s.trim()).filter(Boolean);
  }
  let val = "";
  if (fields.length === 4) val = fields[3];
  else if (fields.length >= 10) val = fields[9];
  return normalizeDateString(val);
}

// --- QR→テキスト展開＆表示（PDF417/QR 共通） ---
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
  // ★ 追加：下版日抽出＆表示
  const plate = extractPlateDateField(text);
  detailPlateDate.textContent = plate;
  scanModeDiv.style.display = "none";
  caseDetailsDiv.style.display = "block";
});

// --- 手動確定 ---
startManualBtn.onclick = () => { scanModeDiv.style.display = "none"; manualModeDiv.style.display = "block"; };
startScanBtn.onclick   = () => { manualModeDiv.style.display = "none"; scanModeDiv.style.display  = "block"; };
manualConfirmBtn.onclick = () => {
  if(!manualOrderIdInput.value || !manualCustomerInput.value || !manualTitleInput.value){
    alert("必須項目を入力"); return;
  }
  detailOrderId.textContent  = manualOrderIdInput.value.trim();
  detailCustomer.textContent = manualCustomerInput.value.trim();
  detailTitle.textContent    = manualTitleInput.value.trim();
  // ★ 追加：手動入力した下版日を表示に反映
  detailPlateDate.textContent = manualPlateDateInput.value || "";
  manualModeDiv.style.display = "none";
  caseDetailsDiv.style.display = "block";
};

// ================================================================
//  暗号化ユーティリティ（AES-GCM + PBKDF2）
//   - 平文は { 得意先, 品名, 下版日 } の JSON を暗号化して enc に格納
//   - 検索・期間絞り込み用に createdAt と plateDateTs は平文で保持
// ================================================================
const PEPPER = "p9r7WqZ1-LocalPepper-ChangeIfNeeded";
function b64(bytes){ return btoa(String.fromCharCode(...bytes)); }
function b64dec(str){ return new Uint8Array([...atob(str)].map(c=>c.charCodeAt(0))); }

async function deriveKey(uid, saltBytes){
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(uid + ":" + PEPPER),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: saltBytes, iterations: 120000, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt","decrypt"]
  );
}
async function encryptForUser(uid, payloadObj){
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(uid || "guest", salt);
  const data = new TextEncoder().encode(JSON.stringify(payloadObj));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name:"AES-GCM", iv }, key, data));
  return { iv: b64(iv), s: b64(salt), c: b64(ct) };
}
async function decryptForUser(uid, encObj){
  if (!encObj) return null;
  const iv = b64dec(encObj.iv);
  const salt = b64dec(encObj.s);
  const key = await deriveKey(uid || "guest", salt);
  const ct = b64dec(encObj.c);
  const pt = await crypto.subtle.decrypt({ name:"AES-GCM", iv }, key, ct);
  return JSON.parse(new TextDecoder().decode(new Uint8Array(pt)));
}

// --- 登録（案件＋追跡） ---
confirmAddCaseBtn.onclick = async () => {
  const orderId  = detailOrderId.textContent.trim();
  const customer = detailCustomer.textContent.trim();
  const title    = detailTitle.textContent.trim();
  const plateStr = (detailPlateDate.textContent || "").trim();
  const plateTs  = plateStr ? new Date(plateStr).getTime() : null;

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
  Array.from(trackingRows.children).forEach(row => row.classList.remove('missing-carrier'));

  Array.from(trackingRows.children).forEach(row => {
    const tn = row.querySelector("input").value.trim();
    const carrier = fixedCarrierCheckbox.checked ? fixedCarrierSelect.value : row.querySelector("select")?.value;
    if (tn && !carrier) { missingCarrier = true; row.classList.add('missing-carrier'); }
    if (!tn || !carrier) return;
    const key = `${carrier}:${tn}`;
    if (existSet.has(key)) return;
    existSet.add(key);
    items.push({ carrier, tracking: tn });
  });

  if (missingCarrier) { addCaseMsg.textContent = "運送会社を選択してください"; return; }
  if (items.length === 0) { alert("新規追跡なし"); return; }

  // ケース情報を暗号化して保存
  const uid = (auth.currentUser && auth.currentUser.uid) || "guest";
  const enc = await encryptForUser(uid, { 得意先: customer, 品名: title, 下版日: plateStr || null });

  await db.ref(`cases/${orderId}`).set({
    注番: orderId,
    createdAt: Date.now(),
    plateDateTs: plateTs,  // 検索用（既定は下版日）
    enc
  });

  // 新規追跡を登録
  for (const it of items) {
    await db.ref(`shipments/${orderId}`).push({
      carrier: it.carrier,
      tracking: it.tracking,
      createdAt: Date.now()
    });
  }

  addCaseMsg.textContent = "登録完了";
  await showCaseDetail(orderId, { 注番: orderId, enc, plateDateTs: plateTs });
};

// --- 別案件追加ボタン ---
anotherCaseBtn.onclick = () => { showView("add-case-view"); initAddCaseView(); };
anotherCaseBtn2.onclick = () => { showView("add-case-view"); initAddCaseView(); };

// --- 検索結果描画 ---
function renderSearchResults(list){
  searchResults.innerHTML = "";
  list.forEach(item => {
    const li = document.createElement("li");
    li.dataset.orderId = item.orderId;
    if(isAdmin){
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "select-case-checkbox";
      checkbox.dataset.orderId = item.orderId;
      li.appendChild(checkbox);
    }
    const span = document.createElement("span");
    span.textContent = `${item.orderId} / ${item.得意先 || ""} / ${item.品名 || ""} / 下版日:${item.下版日 || (item.plateDateTs ? new Date(item.plateDateTs).toLocaleDateString('ja-JP') : "")}`;
    li.appendChild(span);
    li.onclick = (e) => {
      if(e.target instanceof HTMLInputElement) return;
      showCaseDetail(item.orderId, item);
    };
    searchResults.appendChild(li);
  });
  deleteSelectedBtn.style.display = isAdmin ? "block" : "none";
  if (isAdmin) selectAllContainer.style.display = "block"; else selectAllContainer.style.display = "none";
  if (selectAllCheckbox) selectAllCheckbox.checked = false;
  const boxes = searchResults.querySelectorAll(".select-case-checkbox");
  boxes.forEach(cb => { cb.onchange = updateSelectAllState; });
  updateSelectAllState();
}

// 全選択チェックボックスの状態を更新
function updateSelectAllState() {
  if (!isAdmin) return;
  const boxes = searchResults.querySelectorAll(".select-case-checkbox");
  const checked = searchResults.querySelectorAll(".select-case-checkbox:checked");
  selectAllCheckbox.checked = (boxes.length > 0 && boxes.length === checked.length);
}

// --- 検索／全件（既定：下版日で絞り込み） ---
function searchAll(kw=""){
  db.ref("cases").once("value").then(async snap => {
    const data = snap.val() || {};
    const res = [];
    const startVal = startDateInput.value;
    const endVal   = endDateInput.value;
    const basis    = (searchDateType && searchDateType.value) === 'created' ? 'createdAt' : 'plateDateTs';

    let startTs = null, endTs = null;
    if (startVal) startTs = new Date(startVal + 'T00:00:00').getTime();
    if (endVal)   endTs   = new Date(endVal   + 'T23:59:59').getTime();

    const uid = (auth.currentUser && auth.currentUser.uid) || "guest";

    for (const [orderId, obj] of Object.entries(data)) {
      // 期間絞り込み（選択基準）
      const baseTs = obj[basis] ?? obj.createdAt ?? 0;
      if (startTs !== null && baseTs < startTs) continue;
      if (endTs   !== null && baseTs > endTs)   continue;

      // 復号（表示用）
      let view = { orderId, 注番: orderId, plateDateTs: obj.plateDateTs, createdAt: obj.createdAt };
      if (obj.enc) {
        try {
          const dec = await decryptForUser(uid, obj.enc);
          view.得意先 = dec?.得意先 || "";
          view.品名   = dec?.品名   || "";
          view.下版日 = dec?.下版日 || (obj.plateDateTs ? new Date(obj.plateDateTs).toISOString().slice(0,10) : "");
        } catch(_) {
          // 旧データ互換または復号失敗時
          view.得意先 = obj.得意先 || "";
          view.品名   = obj.品名   || "";
          view.下版日 = obj.下版日 || "";
        }
      } else {
        // 旧データ互換
        view.得意先 = obj.得意先 || "";
        view.品名   = obj.品名   || "";
        view.下版日 = obj.下版日 || (obj.plateDateTs ? new Date(obj.plateDateTs).toISOString().slice(0,10) : "");
      }

      // キーワード一致判定（注番/得意先/品名）
      const matchKw = !kw || orderId.includes(kw) || (view.得意先 || "").includes(kw) || (view.品名 || "").includes(kw);
      if (!matchKw) continue;

      res.push(view);
    }

    // 新→古順（登録日基準）
    res.sort((a,b) => (b.createdAt||0) - (a.createdAt||0));
    renderSearchResults(res);
  });
}

searchBtn.onclick = () => {
  const kw = searchInput.value.trim();
  const hasKw = kw.length > 0;
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
};
listAllBtn.onclick = () => {
  searchInput.value = "";
  startDateInput.value = "";
  endDateInput.value = "";
  showView("search-view");
  searchAll();
};

// 選択削除（管理者のみ）
deleteSelectedBtn.onclick = async () => {
  const checkboxes = searchResults.querySelectorAll(".select-case-checkbox:checked");
  const count = checkboxes.length;
  if (count === 0) return;
  if (count === 1) {
    const orderId = checkboxes[0].dataset.orderId;
    if (!confirm(`「${orderId}」を削除しますか？`)) return;
  } else {
    if (!confirm('選択案件を削除しますか？')) return;
  }
  for (const cb of checkboxes) {
    const orderId = cb.dataset.orderId;
    try {
      await db.ref(`cases/${orderId}`).remove();
      await db.ref(`shipments/${orderId}`).remove();
    } catch (e) { console.error(e); }
    cb.closest('li').remove();
  }
  updateSelectAllState();
};

// ================================================================
// ステータス分類（追加）
// ================================================================
function classifyStatus(status){
  const s = String(status || "");
  if (/(配達完了|お届け完了|配達済みです|配達済み)/.test(s)) return "delivered";
  if (/(配達中|お届け中|輸送中|移動中|配送中)/.test(s))          return "intransit";
  if (/(受付|荷受|出荷|発送|引受|持出|到着|作業中|準備中)/.test(s))  return "info";
  if (/(持戻|不在|保管|調査中|返送|破損|誤配送|エラー|該当なし|未登録)/.test(s)) return "exception";
  return "unknown";
}

// --- 詳細＋ステータス取得（表示時に復号も行う） ---
async function showCaseDetail(orderId, obj){
  showView("case-detail-view");
  // obj が暗号化のみの場合は復号
  let view = { 注番: orderId, 得意先: "", 品名: "", 下版日: "", plateDateTs: obj?.plateDateTs, createdAt: obj?.createdAt };
  try {
    if (obj && obj.enc) {
      const dec = await decryptForUser((auth.currentUser && auth.currentUser.uid) || "guest", obj.enc);
      view.得意先 = dec?.得意先 || "";
      view.品名   = dec?.品名   || "";
      view.下版日 = dec?.下版日 || (obj.plateDateTs ? new Date(obj.plateDateTs).toISOString().slice(0,10) : "");
    } else {
      view.得意先 = obj?.得意先 || "";
      view.品名   = obj?.品名   || "";
      view.下版日 = obj?.下版日 || (obj?.plateDateTs ? new Date(obj.plateDateTs).toISOString().slice(0,10) : "");
    }
  } catch(_) {}

  const plateView = view.下版日 || (view.plateDateTs ? new Date(view.plateDateTs).toLocaleDateString('ja-JP') : "");
  detailInfoDiv.innerHTML = `<div>受注番号: ${orderId}</div><div>得意先: ${view.得意先}</div><div>品名: ${view.品名}</div><div>下版日: ${plateView}</div>`;

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
  let index = 1;
  for (const key of Object.keys(list)) {
    const it = list[key];
    const label = carrierLabels[it.carrier] || it.carrier;
    const a = document.createElement("a");
    if (it.carrier === 'hida') a.href = carrierUrls[it.carrier];
    else a.href = carrierUrls[it.carrier] + encodeURIComponent(it.tracking);
    a.target = "_blank";
    a.textContent = `${label}：${it.tracking}：読み込み中…`;
    const li = document.createElement("li");
    li.appendChild(a);
    detailShipmentsUl.appendChild(li);
    try {
      const json = await fetchStatus(it.carrier, it.tracking);
      const { status, time, location } = json;
      const seqNum = index++; // 連番
      a.textContent = formatShipmentText(seqNum, it.carrier, it.tracking, status, time, location);
      li.className = "ship-" + classifyStatus(status);
    } catch (err) {
      console.error("fetchStatus error:", err);
      a.textContent = `${label}：${it.tracking}：取得失敗`;
      li.className = "ship-exception";
    }
  }
}

backToSearchBtn.onclick = () => showView("search-view");

// --- 追跡番号追加フォーム操作（既存） ---
showAddTrackingBtn.onclick = () => {
  addTrackingDetail.style.display = "block";
  detailTrackingRows.innerHTML = "";
  for (let i = 0; i < 5; i++) detailTrackingRows.appendChild(createTrackingRow("detail"));
  showAddTrackingBtn.style.display = "none";
};
detailAddRowBtn.onclick = () => { for (let i = 0; i < 5; i++) detailTrackingRows.appendChild(createTrackingRow("detail")); };
cancelDetailAddBtn.onclick = () => {
  addTrackingDetail.style.display = "none";
  detailTrackingRows.innerHTML = "";
  detailAddMsg.textContent = "";
  showAddTrackingBtn.style.display = "inline-block";
};

// fetchStatus ヘルパー（既存の Cloudflare Worker を利用）
async function fetchStatus(carrier, tracking) {
  if (carrier === 'hida') return { status: '非対応', time: null };
  const url = `https://track-api.hr46-ksg.workers.dev/?carrier=${encodeURIComponent(carrier)}&tracking=${encodeURIComponent(tracking)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// 時間ラベルの生成（既存）
function getTimeLabel(carrier, status, time) {
  if (!time || time.includes('：')) return '';
  if (carrier === 'seino') {
    if (status === '配達済みです') return '配達日時:';
    return '最新日時:';
  }
  if (carrier === 'yamato' || carrier === 'tonami') {
    if (status === '配達完了' || status === 'お届け完了' || status === '配達済み') return '配達日時:';
    return '予定日時:';
  }
  if (status && status.includes('配達完了')) return '配達日時:';
  return '予定日時:';
}
function formatShipmentText(seqNum, carrier, tracking, status, time, location) {
  const label = carrierLabels[carrier] || carrier;
  const tl = getTimeLabel(carrier, status, time);
  if (carrier === 'hida') {
    // hida はリンク先固定かつ API 非対応のため location/time は無視
    return `${seqNum}：${label}：${tracking}：${status}`;
  }
  if (location && String(location).trim() !== "") {
    if (time) return `${seqNum}：${label}：${tracking}：担当店名：${location}：${status}　${tl ? tl : ''}${time}`;
    return `${seqNum}：${label}：${tracking}：担当店名：${location}：${status}`;
  }
  if (time) return `${seqNum}：${label}：${tracking}：${status}　${tl ? tl : ''}${time}`;
  return `${seqNum}：${label}：${tracking}：${status}`;
}

// --- セッションタイムアウト（10分） ---
function resetSessionTimer() {
  try { markLoginTime(); } catch (_) {}
  clearTimeout(sessionTimer);
  sessionTimer = setTimeout(() => {
    alert('セッションが10分を超えました。再度ログインしてください。');
    try { if (auth && auth.currentUser) auth.signOut(); } catch (_) {}
    try { if (emailInput) emailInput.value = ""; } catch (_) {}
    try { if (passwordInput) passwordInput.value = ""; } catch (_) {}
    try { localStorage.removeItem('loginTime'); } catch (_) {}
  }, SESSION_LIMIT_MS);
}
function startSessionTimer() {
  resetSessionTimer();
  ['click','keydown','touchstart','input','change'].forEach(evt => 
    document.addEventListener(evt, resetSessionTimer, true));
  if (!window.__inactivityInterval) {
    window.__inactivityInterval = setInterval(() => {
      try {
        if (auth && auth.currentUser && isSessionExpired()) {
          alert('セッションが10分を超えました。再度ログインしてください。');
          auth.signOut().catch(()=>{});
          clearInterval(window.__inactivityInterval);
          window.__inactivityInterval = null;
        }
      } catch (_) {}
    }, 30 * 1000);
  }
}

// --- 詳細画面：追跡番号追加 登録 ---
confirmDetailAddBtn.onclick = async () => {
  if (!currentOrderId) return;
  const snap = await db.ref(`shipments/${currentOrderId}`).once("value");
  const existObj = snap.val() || {};
  const existSet = new Set(Object.values(existObj).map(it => `${it.carrier}:${it.tracking}`));
  const newItems = [];
  let missingCarrier = false;

  detailTrackingRows.querySelectorAll(".tracking-row").forEach(row => row.classList.remove('missing-carrier'));
  detailTrackingRows.querySelectorAll(".tracking-row").forEach(row => {
    const tn = row.querySelector("input").value.trim();
    if (!tn) return;
    const carrier = fixedCarrierCheckboxDetail.checked ? fixedCarrierSelectDetail.value : row.querySelector("select")?.value;
    if (!carrier) { missingCarrier = true; row.classList.add('missing-carrier'); return; }
    const key = `${carrier}:${tn}`;
    if (existSet.has(key)) return;
    existSet.add(key);
    newItems.push({ carrier, tracking: tn });
  });

  if (missingCarrier) { detailAddMsg.textContent = "運送会社を選択してください"; return; }
  if (newItems.length === 0) { alert("新規の追跡番号がありません（既に登録済み）"); return; }

  for (const it of newItems) {
    await db.ref(`shipments/${currentOrderId}`).push({ carrier: it.carrier, tracking: it.tracking, createdAt: Date.now() });
  }

  const anchorEls = newItems.map(it => {
    const label = carrierLabels[it.carrier] || it.carrier;
    const a = document.createElement("a");
    if (it.carrier === 'hida') a.href = carrierUrls[it.carrier];
    else a.href = carrierUrls[it.carrier] + encodeURIComponent(it.tracking);
    a.target = "_blank";
    a.textContent = `${label}：${it.tracking}：読み込み中…`;
    const li = document.createElement("li");
    li.appendChild(a);
    detailShipmentsUl.appendChild(li);
    return a;
  });

  addTrackingDetail.style.display  = "none";
  detailTrackingRows.innerHTML     = "";
  showAddTrackingBtn.style.display = "inline-block";
  detailAddMsg.textContent         = "追加しました";

  newItems.forEach((it, idx) => {
    const a = anchorEls[idx];
    const li = a.parentElement;
    fetchStatus(it.carrier, it.tracking)
      .then(json => {
        const { status, time, location } = json;
        // 追加分の連番は当該追加内のインデックスで表示
        a.textContent = formatShipmentText(idx+1, it.carrier, it.tracking, status, time, location);
        li.className = "ship-" + classifyStatus(status);
      })
      .catch(err => {
        console.error("fetchStatus error:", err);
        const label = carrierLabels[it.carrier] || it.carrier;
        a.textContent = `${label}：${it.tracking}：取得失敗`;
        li.className = "ship-exception";
      });
  });
};

// --- 画面初期表示 ---
auth.onAuthStateChanged(async user => {
  if (user) {
    try {
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
    deleteSelectedBtn.style.display = isAdmin ? "block" : "none";
  } else {
    isAdmin = false;
    loginView.style.display = "block";
    signupView.style.display = "none";
    mainView.style.display = "none";
    clearLoginTime();
  }
});
