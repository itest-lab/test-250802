// --- Firebase の初期化 ---
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
const db   = firebase.database();

// --- セッション永続化設定（ブラウザのセッション単位） ---
auth.setPersistence(firebase.auth.Auth.Persistence.SESSION)
  .catch(err => console.error("永続化設定エラー:", err));

// --- 定数定義 ---
const SESSION_LIMIT_MS = 10 * 60 * 1000;  // セッション有効期限（10分）
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

// =================================================================
// ユーティリティ関数
// -----------------------------------------------------------------
// モバイル端末判定
function isMobileDevice() {
  const ua = navigator.userAgent || navigator.vendor || window.opera;
  return /android|iPad|iPhone|iPod/i.test(ua);
}

// mm を px に変換
function mmToPx(mm) {
  return mm * (96 / 25.4);
}

// セッション管理
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

// --- カメラ用デバイス選択（背面カメラ / 複数時は 2 番目優先） ---
async function selectBackCamera() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const backs = devices.filter(d =>
      d.kind === 'videoinput' && /back|rear|environment/i.test(d.label)
    );
    if (backs.length > 1) return backs[1].deviceId;
    if (backs.length === 1) return backs[0].deviceId;
  } catch (e) { /* ignore */ }
  return null;
}

// =================================================================
// カメラ読み取り関連（html5-qrcode）
// -----------------------------------------------------------------
let html5QrCode = null;
let scanningInputId = null;
let torchOn = false;

// スキャン開始
async function startScanning(formats, inputId) {
  if (!isMobileDevice()) {
    alert('このデバイスではカメラ機能を利用できません');
    return;
  }
  // 既存のスキャン停止
  if (html5QrCode) {
    try { await html5QrCode.stop(); html5QrCode.clear(); } catch (e) {}
    html5QrCode = null;
  }
  scanningInputId = inputId;

  // オーバーレイサイズ調整
  const margin = mmToPx(5) * 2;
  let w = window.innerWidth - margin;
  let h = window.innerHeight - margin;
  const ratio = 9 / 16;
  if (w / h > ratio) { w = h * ratio; } else { h = w / ratio; }
  const sc = document.getElementById('scanner-container');
  if (sc) { sc.style.width = w + 'px'; sc.style.height = h + 'px'; }

  // オーバーレイ表示
  const overlay = document.getElementById('scanner-overlay');
  if (overlay) { overlay.style.display = 'flex'; document.body.style.overflow = 'hidden'; }

  // QR コード読み取りインスタンス生成
  html5QrCode = new Html5Qrcode('video-container', false);
  const backId = await selectBackCamera();
  const constraints = backId
    ? { deviceId: { exact: backId } }
    : { facingMode: { exact: 'environment' } };
  const config = {
    fps: 10,
    formatsToSupport: formats,
    experimentalFeatures: { useBarCodeDetectorIfSupported: true },
    useBarCodeDetectorIfSupported: true
  };

  // 読み取り成功時コールバック
  const onSuccess = decoded => {
    try {
      const inputEl = document.getElementById(inputId);
      if (!inputEl) { stopScanning(); return; }
      if (formats.length === 1 && formats[0] === Html5QrcodeSupportedFormats.CODABAR) {
        // CODABAR の場合、先頭/末尾文字除去
        if (decoded.length >= 2) {
          const pre = decoded[0];
          const suf = decoded[decoded.length - 1];
          if (/[ABCD]/i.test(pre) && /[ABCD]/i.test(suf)) {
            const trimmed = decoded.substring(1, decoded.length - 1);
            inputEl.value = trimmed;
            inputEl.dispatchEvent(new Event('input', { bubbles: true }));
            inputEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
            stopScanning();
          }
        }
      } else {
        // その他フォーマット（QRなど）
        inputEl.value = decoded;
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        inputEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        stopScanning();
      }
    } catch (err) {
      console.error(err);
      stopScanning();
    }
  };

  try {
    await html5QrCode.start(constraints, config, onSuccess, () => {});
  } catch (e) {
    console.error(e);
    alert('カメラ起動に失敗しました');
    stopScanning();
  }

  // フォーカス動作：プレビュー領域タップでオートフォーカス
  const videoContainer = document.getElementById('video-container');
  if (videoContainer) {
    videoContainer.addEventListener('click', async () => {
      if (html5QrCode) {
        try { await html5QrCode.applyVideoConstraints({ advanced: [{ focusMode: 'single-shot' }] }); } catch (e) {}
      }
    });
  }
}

// スキャン停止
async function stopScanning() {
  if (html5QrCode) {
    try { await html5QrCode.stop(); html5QrCode.clear(); } catch (e) {}
    html5QrCode = null;
  }
  const overlay = document.getElementById('scanner-overlay');
  if (overlay) overlay.style.display = 'none';
  document.body.style.overflow = '';
  torchOn = false;
}

// ライトトグル
async function toggleTorch() {
  if (!html5QrCode) return;
  try {
    const settings = html5QrCode.getRunningTrackSettings();
    if (!('torch' in settings)) { alert('このデバイスはライトに対応していません'); return; }
    torchOn = !torchOn;
    await html5QrCode.applyVideoConstraints({ advanced: [{ torch: torchOn }] });
  } catch (e) { console.warn(e); }
}

// =================================================================
// DOMContentLoaded 時の初期化
// -----------------------------------------------------------------
window.addEventListener('DOMContentLoaded', () => {
  // オーバーレイ内ボタン
  document.getElementById('close-button')?.addEventListener('click', stopScanning);
  document.getElementById('torch-button')?.addEventListener('click', toggleTorch);

  // 案件追加用カメラボタン（スマホのみ表示）
  const caseCameraBtn = document.getElementById('case-camera-btn');
  if (caseCameraBtn) {
    if (isMobileDevice()) {
      caseCameraBtn.style.display = 'block';
      caseCameraBtn.addEventListener('click', () => {
        startScanning([
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.PDF_417
        ], 'case-barcode');
      });
    } else {
      caseCameraBtn.style.display = 'none';
    }
  }

  // セッション期限切れチェック
  if (isSessionExpired()) {
    auth.signOut().catch(err => console.warn("セッションタイムアウト時サインアウト失敗:", err));
    clearLoginTime();
  }
});

// =================================================================
// DOM 要素取得
// -----------------------------------------------------------------
const loginView        = document.getElementById("login-view");
const mainView         = document.getElementById("main-view");
const loginErrorEl     = document.getElementById("login-error");
const emailInput       = document.getElementById("email");
const passwordInput    = document.getElementById("password");
const loginBtn         = document.getElementById("login-btn");
const signupBtn        = document.getElementById("signup-btn");
const guestBtn         = document.getElementById("guest-btn");
const resetBtn         = document.getElementById("reset-btn");
const logoutBtn        = document.getElementById("logout-btn");

const signupView            = document.getElementById("signup-view");
const signupEmail           = document.getElementById("signup-email");
const signupPassword        = document.getElementById("signup-password");
const signupConfirmPassword = document.getElementById("signup-confirm-password");
const signupConfirmBtn      = document.getElementById("signup-confirm-btn");
const backToLoginBtn        = document.getElementById("back-to-login-btn");
const signupErrorEl         = document.getElementById("signup-error");

const navAddBtn      = document.getElementById("nav-add-btn");
const navSearchBtn   = document.getElementById("nav-search-btn");

const scanModeDiv    = document.getElementById("scan-mode");
const manualModeDiv  = document.getElementById("manual-mode");
const caseBarcodeInput  = document.getElementById("case-barcode");
const manualOrderIdInput = document.getElementById("manual-order-id");
const manualCustomerInput= document.getElementById("manual-customer");
const manualTitleInput   = document.getElementById("manual-title");
const startManualBtn     = document.getElementById("start-manual-btn");
const startScanBtn       = document.getElementById("start-scan-btn");
const manualConfirmBtn   = document.getElementById("manual-confirm-btn");
const caseDetailsDiv     = document.getElementById("case-details");
const detailOrderId      = document.getElementById("detail-order-id");
const detailCustomer     = document.getElementById("detail-customer");
const detailTitle        = document.getElementById("detail-title");

const fixedCarrierCheckbox       = document.getElementById("fixed-carrier-checkbox");
const fixedCarrierSelect         = document.getElementById("fixed-carrier-select");
const trackingRows               = document.getElementById("tracking-rows");
const addTrackingRowBtn          = document.getElementById("add-tracking-row-btn");
const confirmAddCaseBtn          = document.getElementById("confirm-add-case-btn");
const addCaseMsg                 = document.getElementById("add-case-msg");
const anotherCaseBtn             = document.getElementById("another-case-btn");

const searchView      = document.getElementById("search-view");
const searchInput     = document.getElementById("search-input");
const startDateInput  = document.getElementById("start-date");
const endDateInput    = document.getElementById("end-date");
const searchBtn       = document.getElementById("search-btn");
const listAllBtn      = document.getElementById("list-all-btn");
const searchResults   = document.getElementById("search-results");
const deleteSelectedBtn = document.getElementById("delete-selected-btn");
const selectAllContainer  = document.getElementById("select-all-container");
const selectAllCheckbox   = document.getElementById("select-all-checkbox");

const caseDetailView       = document.getElementById("case-detail-view");
const detailInfoDiv        = document.getElementById("detail-info");
const detailShipmentsUl    = document.getElementById("detail-shipments");
const showAddTrackingBtn   = document.getElementById("show-add-tracking-btn");
const addTrackingDetail    = document.getElementById("add-tracking-detail");
const detailTrackingRows   = document.getElementById("detail-tracking-rows");
const detailAddRowBtn      = document.getElementById("detail-add-tracking-row-btn");
const confirmDetailAddBtn  = document.getElementById("confirm-detail-add-btn");
const detailAddMsg         = document.getElementById("detail-add-msg");
const cancelDetailAddBtn   = document.getElementById("cancel-detail-add-btn");
const fixedCarrierCheckboxDetail = document.getElementById("fixed-carrier-checkbox-detail");
const fixedCarrierSelectDetail   = document.getElementById("fixed-carrier-select-detail");
const backToSearchBtn      = document.getElementById("back-to-search-btn");
const anotherCaseBtn2      = document.getElementById("another-case-btn-2");

// 全選択チェックボックスの挙動
selectAllCheckbox?.addEventListener('change', () => {
  const boxes = searchResults.querySelectorAll(".select-case-checkbox");
  boxes.forEach(cb => cb.checked = selectAllCheckbox.checked);
});

// =================================================================
// 追跡番号入力行の生成
// -----------------------------------------------------------------
function createTrackingRow(context = "add") {
  const row = document.createElement('div');
  row.className = 'tracking-row';

  // 運送会社セレクト
  if (context === "add") {
    if (!fixedCarrierCheckbox.checked) {
      const sel = document.createElement('select');
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
      const sel = document.createElement('select');
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

  // テキスト入力欄
  const inp = document.createElement('input');
  inp.type = "text";
  inp.placeholder = "追跡番号を入力してください";  // プレースホルダ整理
  inp.inputMode  = "numeric";
  const uniqueId = `tracking-${Date.now()}-${Math.floor(Math.random()*1000)}`;
  inp.id = uniqueId;

  // 入力値は数字のみ
  inp.addEventListener('input', e => e.target.value = e.target.value.replace(/\D/g, ''));

  // Enter/Tab 押下で次の欄へ
  inp.addEventListener('keydown', e => {
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
          newInputs[idx + 1]?.focus();
        }, 0);
      }
    }
  });

  row.appendChild(inp);

  // カメラ起動ボタン（スマホ限定）
  if (isMobileDevice()) {
    const camBtn = document.createElement('button');
    camBtn.type = 'button';
    camBtn.textContent = 'カメラ起動';
    camBtn.className = 'camera-btn';
    camBtn.addEventListener('click', () => {
      startScanning([
        Html5QrcodeSupportedFormats.CODABAR
      ], uniqueId);
    });
    row.appendChild(camBtn);
  }

  // 運送会社未選択行の強調
  function updateMissingHighlight() {
    const tnVal = inp.value.trim();
    let carrierVal = context === "add"
      ? (fixedCarrierCheckbox.checked ? fixedCarrierSelect.value : row.querySelector('select')?.value)
      : (fixedCarrierCheckboxDetail.checked ? fixedCarrierSelectDetail.value : row.querySelector('select')?.value);
    row.classList.toggle('missing-carrier', tnVal && !carrierVal);
  }
  inp.addEventListener('input', updateMissingHighlight);
  row.querySelector('select')?.addEventListener('change', updateMissingHighlight);

  return row;
}

// =================================================================
// 初期化処理：案件追加
// -----------------------------------------------------------------
function initAddCaseView() {
  scanModeDiv.style.display   = 'block';
  manualModeDiv.style.display = 'none';
  caseDetailsDiv.style.display= 'none';
  caseBarcodeInput.value      = '';
  manualOrderIdInput.value    = '';
  manualCustomerInput.value   = '';
  manualTitleInput.value      = '';
  addCaseMsg.textContent      = '';
  fixedCarrierCheckbox.checked= false;
  fixedCarrierSelect.style.display = 'none';
  fixedCarrierSelect.value    = '';
  trackingRows.innerHTML      = '';
  for (let i = 0; i < 10; i++) trackingRows.appendChild(createTrackingRow());
}

// 行追加・固定キャリア切替イベント
addTrackingRowBtn.addEventListener('click', () => {
  for (let i = 0; i < 10; i++) trackingRows.appendChild(createTrackingRow());
});
fixedCarrierCheckbox.addEventListener('change', () => {
  fixedCarrierSelect.style.display = fixedCarrierCheckbox.checked ? 'block' : 'none';
  trackingRows.children.forEach(row => {
    const sel = row.querySelector('select');
    if (fixedCarrierCheckbox.checked && sel) row.removeChild(sel);
    if (!fixedCarrierCheckbox.checked && !sel) {
      const newSel = document.createElement('select');
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

// =================================================================
// 認証・ログイン・新規登録処理
// -----------------------------------------------------------------
auth.onAuthStateChanged(async user => {
  if (user) {
    // 管理者判定
    try {
      const snap = await db.ref(`admins/${user.uid}`).once('value');
      isAdmin = snap.val() === true;
    } catch (e) {
      console.error('管理者判定エラー:', e);
      isAdmin = false;
    }
    // ビュー切替
    loginView.style.display = 'none';
    signupView.style.display= 'none';
    mainView.style.display  = 'block';
    showView('add-case-view');
    initAddCaseView();
    startSessionTimer();
    deleteSelectedBtn.style.display = isAdmin ? 'block' : 'none';
  } else {
    // ログアウト時処理
    isAdmin = false;
    loginView.style.display = 'block';
    signupView.style.display= 'none';
    mainView.style.display  = 'none';
    clearLoginTime();
  }
});

loginBtn.addEventListener('click', async () => {
  loginErrorEl.textContent = '';
  clearLoginTime();
  try {
    await auth.signInWithEmailAndPassword(emailInput.value.trim(), passwordInput.value);
    markLoginTime();
  } catch (e) {
    loginErrorEl.textContent = e.message;
  }
});

signupBtn.addEventListener('click', () => {
  loginView.style.display = 'none';
  signupView.style.display= 'block';
  signupEmail.value          = emailInput.value.trim() || '';
  signupPassword.value       = '';
  signupConfirmPassword.value= '';
  signupErrorEl.textContent  = '';
});

guestBtn.addEventListener('click', () => {
  auth.signInAnonymously().catch(e => loginErrorEl.textContent = e.message);
});

resetBtn.addEventListener('click', () => {
  auth.sendPasswordResetEmail(emailInput.value.trim())
    .then(() => loginErrorEl.textContent = '再発行メール送信')
    .catch(e => loginErrorEl.textContent = e.message);
});

logoutBtn.addEventListener('click', async () => {
  try { await auth.signOut(); } catch (e) { console.error('サインアウトエラー:', e); }
  emailInput.value    = '';
  passwordInput.value = '';
  clearLoginTime();
  localStorage.clear();
});

signupConfirmBtn.addEventListener('click', async () => {
  signupErrorEl.textContent = '';
  if (!signupEmail.value || !signupPassword.value || !signupConfirmPassword.value) {
    signupErrorEl.textContent = '全て入力してください';
    return;
  }
  if (signupPassword.value !== signupConfirmPassword.value) {
    signupErrorEl.textContent = 'パスワードが一致しません';
    return;
  }
  try {
    await auth.createUserWithEmailAndPassword(signupEmail.value.trim(), signupPassword.value);
    markLoginTime();
  } catch (e) {
    signupErrorEl.textContent = e.message;
  }
});
backToLoginBtn.addEventListener('click', () => {
  signupView.style.display = 'none';
  loginView.style.display  = 'block';
  signupErrorEl.textContent = '';
  loginErrorEl.textContent  = '';
});

// =================================================================
// 画面切り替え関数
// -----------------------------------------------------------------
function showView(id) {
  document.querySelectorAll('.subview').forEach(el => el.style.display = 'none');
  document.getElementById(id)?.style.display = 'block';
  // 各画面フォーカス設定
  switch (id) {
    case 'add-case-view':
      if (scanModeDiv.style.display !== 'none') break;
      if (manualModeDiv.style.display !== 'none') break;
      break;
    case 'search-view': break;
    case 'case-detail-view': break;
  }
}

// =================================================================
// 案件登録処理
// -----------------------------------------------------------------
confirmAddCaseBtn.addEventListener('click', async () => {
  const orderId  = detailOrderId.textContent.trim();
  const customer = detailCustomer.textContent.trim();
  const title    = detailTitle.textContent.trim();
  if (!orderId || !customer || !title) {
    addCaseMsg.textContent = '情報不足';
    return;
  }
  const snap = await db.ref(`shipments/${orderId}`).once('value');
  const existSet = new Set(Object.values(snap.val() || {}).map(it => `${it.carrier}:${it.tracking}`));
  const items = [];
  let missingCarrier = false;

  // 行ごとの未選択強調を初期化
  trackingRows.querySelectorAll('.tracking-row').forEach(row => row.classList.remove('missing-carrier'));

  // 入力行ループ
  trackingRows.querySelectorAll('.tracking-row').forEach(row => {
    const tn = row.querySelector('input').value.trim();
    if (!tn) return;
    const carrier = fixedCarrierCheckbox.checked
      ? fixedCarrierSelect.value
      : row.querySelector('select')?.value;
    if (!carrier) {
      missingCarrier = true;
      row.classList.add('missing-carrier');
      return;
    }
    const key = `${carrier}:${tn}`;
    if (!existSet.has(key)) {
      existSet.add(key);
      items.push({ carrier, tracking: tn });
    }
  });

  if (missingCarrier) {
    addCaseMsg.textContent = '運送会社を選択してください';
    return;
  }
  if (items.length === 0) {
    alert('新規追跡なし');
    return;
  }

  // DB へ保存
  await db.ref(`cases/${orderId}`).set({ 注番: orderId, 得意先: customer, 品名: title, createdAt: Date.now() });
  for (const it of items) {
    await db.ref(`shipments/${orderId}`).push({ carrier: it.carrier, tracking: it.tracking, createdAt: Date.now() });
  }

  addCaseMsg.textContent = '登録完了';
  await showCaseDetail(orderId, { 得意先: customer, 品名: title });
});
anotherCaseBtn.addEventListener('click', () => { showView('add-case-view'); initAddCaseView(); });
anotherCaseBtn2.addEventListener('click', () => { showView('add-case-view'); initAddCaseView(); });

// =================================================================
// 検索／一覧表示処理
// -----------------------------------------------------------------
function renderSearchResults(list) {
  searchResults.innerHTML = '';
  list.forEach(item => {
    const li = document.createElement('li');
    li.dataset.orderId = item.orderId;
    if (isAdmin) {
      const cb = document.createElement('input');
      cb.type = 'checkbox'; cb.className = 'select-case-checkbox'; cb.dataset.orderId = item.orderId;
      li.appendChild(cb);
    }
    const span = document.createElement('span');
    span.textContent = `${item.orderId} / ${item.得意先} / ${item.品名}`;
    li.appendChild(span);
    li.addEventListener('click', e => { if (!(e.target instanceof HTMLInputElement)) showCaseDetail(item.orderId, item); });
    searchResults.appendChild(li);
  });
  deleteSelectedBtn.style.display    = isAdmin ? 'block' : 'none';
  selectAllContainer.style.display  = isAdmin ? 'block' : 'none';
  selectAllCheckbox.checked         = false;
  searchResults.querySelectorAll('.select-case-checkbox').forEach(cb => cb.addEventListener('change', updateSelectAllState));
  updateSelectAllState();
}

function searchAll(kw = '') {
  db.ref('cases').once('value').then(snap => {
    const data = snap.val() || {};
    let startTs = startDateInput.value ? new Date(startDateInput.value + 'T00:00:00').getTime() : null;
    let endTs   = endDateInput.value   ? new Date(endDateInput.value + 'T23:59:59').getTime() : null;
    const res = Object.entries(data).reduce((acc, [orderId,obj]) => {
      const matchKw = !kw || orderId.includes(kw) || obj.得意先.includes(kw) || obj.品名.includes(kw);
      if (!matchKw) return acc;
      if (startTs !== null && obj.createdAt < startTs) return acc;
      if (endTs   !== null && obj.createdAt > endTs)   return acc;
      acc.push({ orderId, ...obj });
      return acc;
    }, []);
    res.sort((a,b) => b.createdAt - a.createdAt);
    renderSearchResults(res);
  });
}

selectAllCheckbox?.addEventListener('change', () => {
  const boxes = searchResults.querySelectorAll('.select-case-checkbox');
  boxes.forEach(cb => cb.checked = selectAllCheckbox.checked);
});

searchBtn.addEventListener('click', () => {
  const kw = searchInput.value.trim();
  const hasKw = kw.length > 0;
  const hasPeriod = startDateInput.value || endDateInput.value;
  showView('search-view');
  if (hasKw && hasPeriod) {
    searchInput.value = '';
    startDateInput.value = '';
    endDateInput.value   = '';
    searchAll();
  } else {
    searchAll(kw);
  }
});
listAllBtn.addEventListener('click', () => {
  searchInput.value = '';
  startDateInput.value = '';
  endDateInput.value   = '';
  showView('search-view');
  searchAll();
});

deleteSelectedBtn.addEventListener('click', async () => {
  const checked = searchResults.querySelectorAll('.select-case-checkbox:checked');
  if (checked.length === 0) return;
  if (checked.length === 1) {
    if (!confirm(`「${checked[0].dataset.orderId}」を削除しますか？`)) return;
  } else {
    if (!confirm('選択案件を削除しますか？')) return;
  }
  for (const cb of checked) {
    await db.ref(`cases/${cb.dataset.orderId}`).remove();
    await db.ref(`shipments/${cb.dataset.orderId}`).remove();
    cb.closest('li').remove();
  }
  updateSelectAllState();
});

function updateSelectAllState() {
  if (!isAdmin) return;
  const boxes = searchResults.querySelectorAll('.select-case-checkbox');
  const checked = searchResults.querySelectorAll('.select-case-checkbox:checked');
  selectAllCheckbox.checked = boxes.length > 0 && boxes.length === checked.length;
}

// =================================================================
// 詳細表示＋ステータス取得
// -----------------------------------------------------------------
async function showCaseDetail(orderId, obj) {
  showView('case-detail-view');
  detailInfoDiv.innerHTML = `<div>受注番号: ${orderId}</div><div>得意先: ${obj.得意先}</div><div>品名: ${obj.品名}</div>`;
  detailShipmentsUl.innerHTML = '';
  currentOrderId = orderId;
  addTrackingDetail.style.display = 'none';
  detailTrackingRows.innerHTML    = '';
  detailAddMsg.textContent        = '';
  detailAddRowBtn.disabled        = false;
  confirmDetailAddBtn.disabled    = false;
  cancelDetailAddBtn.disabled     = false;

  const snap = await db.ref(`shipments/${orderId}`).once('value');
  const list = snap.val() || {};
  for (const key of Object.keys(list)) {
    const it = list[key];
    const label = carrierLabels[it.carrier] || it.carrier;
    const a = document.createElement('a');
    a.href   = it.carrier === 'hida'
      ? carrierUrls[it.carrier]
      : carrierUrls[it.carrier] + encodeURIComponent(it.tracking);
    a.target = '_blank';
    a.textContent = `${label}：${it.tracking}：読み込み中…`;
    const li = document.createElement('li'); li.appendChild(a);
    detailShipmentsUl.appendChild(li);
    try {
      const { status, time } = await fetchStatus(it.carrier, it.tracking);
      a.textContent = formatShipmentText(it.carrier, it.tracking, status, time);
    } catch (err) {
      console.error('fetchStatus error:', err);
      a.textContent = `${label}：${it.tracking}：取得失敗`;
    }
  }
}
backToSearchBtn.addEventListener('click', () => showView('search-view'));

// =================================================================
// fetchStatus ヘルパー（ステータス取得 API 呼び出し）
// -----------------------------------------------------------------
async function fetchStatus(carrier, tracking) {
  if (carrier === 'hida') return { status: '非対応', time: null };
  const url = `https://track-api.hr46-ksg.workers.dev/?carrier=${encodeURIComponent(carrier)}&tracking=${encodeURIComponent(tracking)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// 時刻ラベル生成
function getTimeLabel(carrier, status, time) {
  if (!time || time.includes('：')) return '';
  if (carrier === 'seino') {
    return status === '配達済みです' ? '配達日時:' : '最新日時:';
  }
  if (carrier === 'yamato' || carrier === 'tonami') {
    return ['配達完了','お届け完了','配達済み'].includes(status) ? '配達日時:' : '予定日時:';
  }
  return status.includes('配達完了') ? '配達日時:' : '予定日時:';
}

// テキスト整形
function formatShipmentText(carrier, tracking, status, time) {
  const label = carrierLabels[carrier] || carrier;
  if (carrier === 'hida') return `${label}：${tracking}：${status}`;
  const timeLabel = getTimeLabel(carrier, status, time);
  return time
    ? `${label}：${tracking}：${status}　${timeLabel}${time}`
    : `${label}：${tracking}：${status}`;
}

// =================================================================
// 詳細画面：追跡番号追加
// -----------------------------------------------------------------
showAddTrackingBtn.addEventListener('click', () => {
  addTrackingDetail.style.display = 'block';
  detailTrackingRows.innerHTML = '';
  for (let i = 0; i < 5; i++) detailTrackingRows.appendChild(createTrackingRow('detail'));
  showAddTrackingBtn.style.display = 'none';
});
detailAddRowBtn.addEventListener('click', () => {
  for (let i = 0; i < 5; i++) detailTrackingRows.appendChild(createTrackingRow('detail'));
});
cancelDetailAddBtn.addEventListener('click', () => {
  addTrackingDetail.style.display = 'none';
  detailTrackingRows.innerHTML = '';
  detailAddMsg.textContent = '';
  showAddTrackingBtn.style.display = 'inline-block';
});

confirmDetailAddBtn.addEventListener('click', async () => {
  if (!currentOrderId) return;
  const snap = await db.ref(`shipments/${currentOrderId}`).once('value');
  const existSet = new Set(Object.values(snap.val() || {}).map(it => `${it.carrier}:${it.tracking}`));
  const newItems = [];
  let missingCarrier = false;

  detailTrackingRows.querySelectorAll('.tracking-row').forEach(row => row.classList.remove('missing-carrier'));
  detailTrackingRows.querySelectorAll('.tracking-row').forEach(row => {
    const tn = row.querySelector('input').value.trim(); if (!tn) return;
    const carrier = fixedCarrierCheckboxDetail.checked ? fixedCarrierSelectDetail.value : row.querySelector('select')?.value;
    if (!carrier) { missingCarrier = true; row.classList.add('missing-carrier'); return; }
    const key = `${carrier}:${tn}`;
    if (!existSet.has(key)) { existSet.add(key); newItems.push({ carrier, tracking: tn }); }
  });
  if (missingCarrier) { detailAddMsg.textContent = '運送会社を選択してください'; return; }
  if (newItems.length === 0) { alert('既に登録済みの追跡番号です'); return; }

  for (const it of newItems) {
    await db.ref(`shipments/${currentOrderId}`).push({ carrier: it.carrier, tracking: it.tracking, createdAt: Date.now() });
  }

  const anchors = newItems.map(it => {
    const a = document.createElement('a');
    a.href   = it.carrier === 'hida'
      ? carrierUrls[it.carrier]
      : carrierUrls[it.carrier] + encodeURIComponent(it.tracking);
    a.target = '_blank';
    a.textContent = `${carrierLabels[it.carrier] || it.carrier}：${it.tracking}：読み込み中…`;
    detailShipmentsUl.appendChild(Object.assign(document.createElement('li'), { append: a }));
    return a;
  });

  addTrackingDetail.style.display  = 'none';
  detailTrackingRows.innerHTML     = '';
  showAddTrackingBtn.style.display = 'inline-block';
  detailAddMsg.textContent         = '追加しました';

  newItems.forEach((it, i) => {
    fetchStatus(it.carrier, it.tracking)
      .then(({status, time}) => {
        anchors[i].textContent = formatShipmentText(it.carrier, it.tracking, status, time);
      })
      .catch(err => {
        console.error('fetchStatus error:', err);
        anchors[i].textContent = `${carrierLabels[it.carrier] || it.carrier}：${it.tracking}：取得失敗`;
      });
  });
});

// =================================================================
// ２次元コード読み取り（jsQR）
// -----------------------------------------------------------------
const canvas = document.createElement('canvas');
async function start2DScanner(inputId) {
  const video = document.getElementById('video2d');
  video.style.display = 'block';
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
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
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imgData.data, imgData.width, imgData.height);
    if (code) {
      document.getElementById(inputId).value = code.data;
      stop2DScanner();
      return;
    }
  }
  requestAnimationFrame(() => scan2D(video, inputId));
}

// =================================================================
// １次元バーコード読み取り（QuaggaJS）
// -----------------------------------------------------------------
function start1DScanner(inputId) {
  const video = document.getElementById('video1d');
  video.style.display = 'block';
  Quagga.init({
    inputStream: { name: 'Live', type: 'LiveStream', target: video, constraints: { facingMode: 'environment' } },
    decoder: { readers: [ 'code_128_reader','ean_reader','ean_8_reader','upc_reader','upc_e_reader' ] }
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

// =================================================================
// セッションタイムアウト（10分）
// -----------------------------------------------------------------
let sessionTimer;
function resetSessionTimer() {
  clearTimeout(sessionTimer);
  sessionTimer = setTimeout(() => {
    alert('セッションが10分を超えました。再度ログインしてください。');
    auth.signOut();
    emailInput.value = '';
    passwordInput.value = '';
  }, SESSION_LIMIT_MS);
}
function startSessionTimer() {
  resetSessionTimer();
  ['click','keydown','touchstart'].forEach(evt => document.addEventListener(evt, resetSessionTimer));
}
