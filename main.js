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

// ================================================================
//  スマホ向けカメラ読み取り機能の定義
//
// このプロジェクトでは html5-qrcode ライブラリを用いてバーコードや
// QR コードを読み取り、読み取り結果を該当の入力欄へ自動入力します。
// PC ではカメラ起動がサポートされていない環境が多いため、カメラ関連
// ボタンはモバイル端末でのみ表示されるようにします。

// モバイル端末判定関数
function isMobileDevice() {
  const ua = navigator.userAgent || navigator.vendor || window.opera;
  return /android|iPad|iPhone|iPod/i.test(ua);
}

// カメラ使用可能かどうかを判定するユーティリティ関数
// モバイル端末かつ navigator.mediaDevices.getUserMedia が利用可能な場合のみ
// true を返します。モバイルでもカメラが利用できない環境では false となり、
// PC 同様にファイル選択による読み取りを案内します。
function canUseCamera() {
  const mobile = isMobileDevice();
  const hasMedia = !!(navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function');
  return mobile && hasMedia;
}

// 画像ファイルからバーコード/QR コードを読み取り、指定の入力欄に値を設定します。
// file   : ユーザが選択した画像ファイル
// inputId: 読み取り結果を書き込む input 要素の id
// isCodabar: CODABAR フォーマットを読み取るかどうか（先頭末尾の A/B/C/D を除去）
async function scanFileForInput(file, inputId, isCodabar) {
  // 一時的なスキャン用コンテナを用意（存在しなければ作成）
  const tmpId = 'file-scan-temp-container';
  let tmpEl = document.getElementById(tmpId);
  if (!tmpEl) {
    tmpEl = document.createElement('div');
    tmpEl.id = tmpId;
    tmpEl.style.display = 'none';
    document.body.appendChild(tmpEl);
  }
  const scanner = new Html5Qrcode(tmpId);
  try {
    // scanFile の第 2 引数を true にすると詳細結果が返るため decodedText を参照します
    const result = await scanner.scanFile(file, true);
    let decoded = (result && result.decodedText) ? result.decodedText : result;
    if (decoded) {
      // CODABAR の場合は先頭と末尾の制御文字を除去
      if (isCodabar) {
        if (decoded.length >= 2) {
          const pre = decoded.charAt(0);
          const suf = decoded.charAt(decoded.length - 1);
          if (/[ABCD]/i.test(pre) && /[ABCD]/i.test(suf)) {
            decoded = decoded.substring(1, decoded.length - 1);
          }
        }
      }
      const inputEl = document.getElementById(inputId);
      if (inputEl) {
        inputEl.value = decoded;
        // 入力イベントを発火させ、既存の入力処理をトリガする
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        // Enter キーイベントを発火させることでエンターキーと同等の処理を実行
        const enterEv = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
        inputEl.dispatchEvent(enterEv);
      }
    }
  } catch (err) {
    console.error(err);
    alert('ファイルからコードを読み取れませんでした');
  } finally {
    // 後片付け
    scanner.clear();
  }
}

// html5-qrcode 用の一時変数
let html5QrCode = null;
let scanningInputId = null;
let torchOn = false;

// mm を px に変換 (印刷サイズの計算で使用)
function mmToPx(mm) {
  return mm * (96 / 25.4);
}

// 利用可能な背面カメラを選択 (複数ある場合は 2 番目を優先)
async function selectBackCamera() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const backs = devices.filter(d =>
      d.kind === 'videoinput' && /back|rear|environment/i.test(d.label)
    );
    // 背面カメラが複数ある場合、下から二番目のレンズを使用
    if (backs.length >= 2) {
      return backs[backs.length - 2].deviceId;
    }
    if (backs.length === 1) return backs[0].deviceId;
  } catch (e) {
    // ignore
  }
  return null;
}

// スキャン開始
async function startScanning(formats, inputId) {
  if (!isMobileDevice()) {
    alert('このデバイスではカメラ機能を利用できません');
    return;
  }
  // 重複起動を防ぐ
  if (html5QrCode) {
    try {
      await html5QrCode.stop();
      html5QrCode.clear();
    } catch (e) {}
    html5QrCode = null;
  }
  scanningInputId = inputId;

  // オーバーレイサイズ調整
  const margin = mmToPx(5) * 2;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const ratio = 9 / 16;
  let w = vw - margin;
  let h = vh - margin;
  if (w / h > ratio) {
    w = h * ratio;
  } else {
    h = w / ratio;
  }
  const sc = document.getElementById('scanner-container');
  if (sc) {
    sc.style.width = w + 'px';
    sc.style.height = h + 'px';
  }
  // オーバーレイ表示
  const overlay = document.getElementById('scanner-overlay');
  if (overlay) {
    overlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }
  // 初期化
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
  const onSuccess = decoded => {
    try {
      const inputEl = document.getElementById(inputId);
      if (!inputEl) {
        stopScanning();
        return;
      }
      // CODABAR の場合は先頭と末尾が A/B/C/D であるか判定
      if (formats.length === 1 && formats[0] === Html5QrcodeSupportedFormats.CODABAR) {
        if (decoded && decoded.length >= 2) {
          const pre = decoded[0];
          const suf = decoded[decoded.length - 1];
          if (/[ABCD]/i.test(pre) && /[ABCD]/i.test(suf)) {
            // 先頭と末尾を除去
            const trimmed = decoded.substring(1, decoded.length - 1);
            inputEl.value = trimmed;
            // 値変更イベント
            inputEl.dispatchEvent(new Event('input', { bubbles: true }));
            // Enter を送信して次の欄に移動させる
            const enterEv = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
            inputEl.dispatchEvent(enterEv);
            stopScanning();
          }
        }
      } else {
        // QR_CODE またはその他のフォーマット
        if (decoded) {
          // 注文登録用 QR は ZLIB64: で始まることを想定
          // それ以外の場合でも値を入力欄にセットする
          inputEl.value = decoded;
          // 入力イベント
          inputEl.dispatchEvent(new Event('input', { bubbles: true }));
          // Enter を送信して既存処理を発火させる
          const enterEv2 = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
          inputEl.dispatchEvent(enterEv2);
          stopScanning();
        }
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
  // フォーカス動作: プレビュー領域をタップでオートフォーカス
  const videoContainer = document.getElementById('video-container');
  if (videoContainer) {
    videoContainer.addEventListener('click', async () => {
      if (html5QrCode) {
        try {
          await html5QrCode.applyVideoConstraints({ advanced: [{ focusMode: 'single-shot' }] });
        } catch (e) {}
      }
    });
  }
}

// スキャン停止
async function stopScanning() {
  if (html5QrCode) {
    try {
      await html5QrCode.stop();
      html5QrCode.clear();
    } catch (e) {}
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
    if (!('torch' in settings)) {
      alert('このデバイスはライトに対応していません');
      return;
    }
    torchOn = !torchOn;
    await html5QrCode.applyVideoConstraints({ advanced: [{ torch: torchOn }] });
  } catch (e) {
    console.warn(e);
  }
}

// DOMContentLoaded 時にカメラ関連 UI を初期化
window.addEventListener('DOMContentLoaded', () => {
  // オーバーレイのボタンにイベントを紐付け
  const closeBtn = document.getElementById('close-button');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      stopScanning();
    });
  }
  const torchBtn = document.getElementById('torch-button');
  if (torchBtn) {
    torchBtn.addEventListener('click', () => {
      toggleTorch();
    });
  }
  // 案件追加用カメラ／ファイルボタン
  const caseFileInput = document.getElementById('case-file-input');
  const caseCameraBtn = document.getElementById('case-camera-btn');
  const caseFileBtn   = document.getElementById('case-file-btn');
  if (caseCameraBtn && caseFileBtn) {
    caseCameraBtn.textContent = 'カメラ起動';
    caseCameraBtn.style.display = 'block';
    // カメラ起動ボタンで撮影用ファイル選択ボタンを表示
    caseCameraBtn.addEventListener('click', () => {
      caseFileBtn.style.display = 'block';
    });
    // ファイル選択ボタンでカメラ撮影 or 既存ファイルを読み込んでスキャン
    caseFileBtn.addEventListener('click', () => {
      scanFileForInput('case-barcode', [Html5QrcodeSupportedFormats.QR_CODE]);
    });
  }　else {
      // カメラが利用できない場合はファイル選択による読み取りを使用
      caseCameraBtn.style.display = 'none';
      if (caseFileInput) {
        caseFileInput.style.display = 'block';
        // ファイル選択時に読み取り処理を実行
        caseFileInput.addEventListener('change', e => {
          const file = e.target.files && e.target.files[0];
          if (file) {
            scanFileForInput(file, 'case-barcode', false);
          }
          // 同じファイルを再度選択したときに change イベントが発火するよう値をリセット
          e.target.value = '';
        });
      }
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

  // --- カメラ起動／ファイル選択ボタン ---
  // 追跡番号入力欄の右側に配置します。カメラが利用可能な場合は「カメラ起動」ボタンを、
  // PC やカメラ非対応端末では「ファイルを選択」ボタンを表示します。
  if (canUseCamera()) {
    // モバイルかつカメラ対応: カメラ起動ボタン
    const camBtn = document.createElement('button');
    camBtn.type = 'button';
    camBtn.textContent = 'カメラ起動';
    camBtn.className = 'camera-btn';
    camBtn.addEventListener('click', () => {
      // １次元バーコード (CodaBar) を対象とする
      startScanning([
        Html5QrcodeSupportedFormats.CODABAR
      ], uniqueId);
    });
    row.appendChild(camBtn);
  } else {
    // PC など: ファイル選択ボタン
    // 非表示の file input を用意し、ボタン押下時にクリックさせる
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '*/*';
    fileInput.capture = 'environment';
    fileInput.style.display = 'none';
    const fileBtn = document.createElement('button');
    fileBtn.type = 'button';
    fileBtn.textContent = 'ファイルを選択';
    // カメラボタンと同じスタイルを適用
    fileBtn.className = 'camera-btn';
    fileBtn.addEventListener('click', () => {
      fileInput.click();
    });
    // ファイル選択時に読み取り処理を実施
    fileInput.addEventListener('change', e => {
      const f = e.target.files && e.target.files[0];
      if (f) {
        // CODABAR 用フラグを true にする
        scanFileForInput(f, uniqueId, true);
      }
      // 同じファイルを再度選択したときのために値をリセット
      e.target.value = '';
    });
    row.appendChild(fileBtn);
    row.appendChild(fileInput);
  }

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
  // 既存のタイマーをキャンセル
  clearTimeout(sessionTimer);
  // 新しいタイマーを設定し、10分間操作がない場合にログアウト処理を実施します
  sessionTimer = setTimeout(() => {
    alert('セッションが10分を超えました。再度ログインしてください。');
    auth.signOut();
    // メール・パスワード欄をクリア
    emailInput.value    = "";
    passwordInput.value = "";
  }, SESSION_LIMIT_MS);
  // この関数はユーザー操作時に呼び出されるため、操作があったタイミングで
  // loginTime を更新しセッションを延長します
  markLoginTime();
}
function startSessionTimer() {
  // タイマーを初期化
  resetSessionTimer();
  // セッションタイマーをリセットする対象イベントを定義します
  const events = ['click', 'keydown', 'touchstart', 'input', 'change'];
  events.forEach(evt => {
    document.addEventListener(evt, resetSessionTimer);
  });
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
