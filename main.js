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

// セッション永続化をブラウザの「セッション」単位に設定（タブを閉じると破棄）
auth.setPersistence(firebase.auth.Auth.Persistence.SESSION)
  .catch(err => console.error("永続化設定エラー:", err));

const db = firebase.database();

// キャリア（ラベル表示）
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
//  スマホ対応：カメラ／ファイル読み取り（html5-qrcode）
// ================================================================

// モバイル端末判定
function isMobileDevice() {
  const ua = navigator.userAgent || navigator.vendor || window.opera;
  return /android|iPad|iPhone|iPod/i.test(ua);
}

// カメラ利用可能判定（モバイル端末かつ getUserMedia ）
function canUseCamera() {
  return isMobileDevice() &&
         !!(navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === "function");
}

// 画像ファイル（カメラ撮影含む）から QR / バーコードをスキャンして該当 input へ反映
// - file: File オブジェクト（<input type="file"> の選択結果）
// - inputId: 結果を書き込む input 要素の id
// - isCodabar: true の場合 CODABAR として先頭末尾 A/B/C/D を除去して入力
async function scanFileForInput(file, inputId, isCodabar) {
  const TMP_ID = "file-scan-temp-container";
  let host = document.getElementById(TMP_ID);
  if (!host) {
    host = document.createElement("div");
    host.id = TMP_ID;
    host.style.display = "none";
    document.body.appendChild(host);
  }
  const scanner = new Html5Qrcode(TMP_ID);
  try {
    // 第2引数に true を渡すと {decodedText, result} 形式が返る
    const res = await scanner.scanFile(file, true);
    let decoded = res && res.decodedText ? res.decodedText : res;
    if (!decoded) throw new Error("デコード結果なし");

    // CODABAR の先頭末尾除去（開始/終了文字 A/B/C/D）
    if (isCodabar) {
      if (decoded.length >= 2) {
        const pre = decoded[0];
        const suf = decoded[decoded.length - 1];
        if (/[ABCD]/i.test(pre) && /[ABCD]/i.test(suf)) {
          decoded = decoded.substring(1, decoded.length - 1);
        }
      }
    } else {
      // QR の ZLIB64 展開に対応（案件追加QR）
      if (decoded.startsWith("ZLIB64:")) {
        const b64 = decoded.slice(7);
        const bin = atob(b64);
        const arr = new Uint8Array([...bin].map(c => c.charCodeAt(0)));
        const dec = pako.inflate(arr);
        decoded = new TextDecoder().decode(dec).trim().replace(/「[^」]*」/g, "");
      }
    }

    const inputEl = document.getElementById(inputId);
    if (inputEl) {
      inputEl.value = decoded;
      // 値変更イベント
      inputEl.dispatchEvent(new Event("input", { bubbles: true }));
      // Enter を送信して既存の処理を進行
      inputEl.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    }
  } catch (e) {
    console.error("ファイルスキャン失敗:", e);
    alert("ファイルからコードを読み取れませんでした");
  } finally {
    try { await scanner.clear(); } catch (_) {}
  }
}

// ミリメートル→ピクセル（プレビュー矩形の算出）
function mmToPx(mm) {
  return mm * (96 / 25.4);
}

// 背面カメラを選択（複数レンズがある場合は「下から二番目」を使用、1台ならそれ）
async function selectBackCamera() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const backs = devices.filter(d => d.kind === "videoinput" && /back|rear|environment/i.test(d.label));
    if (backs.length >= 2) return backs[backs.length - 2].deviceId;  // 末尾から2番目
    if (backs.length === 1) return backs[0].deviceId;
  } catch (_) {}
  return null;
}

// html5-qrcode ランタイム
let html5QrCode = null;
let scanningInputId = null;
let torchOn = false;

// ライブカメラでスキャン開始（CODABAR などに使用）
async function startScanning(formats, inputId) {
  // ライブカメラはモバイル＋getUserMedia のみ
  if (!canUseCamera()) {
    alert("このデバイスではカメラ機能を利用できません（ファイルから読み取りをご利用ください）");
    return;
  }

  // 二重起動を回避
  if (html5QrCode) {
    try { await html5QrCode.stop(); html5QrCode.clear(); } catch (_) {}
    html5QrCode = null;
  }
  scanningInputId = inputId;

  // オーバーレイ（9:16、周囲5mmマージン）
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
  const sc = document.getElementById("scanner-container");
  if (sc) {
    sc.style.width = `${w}px`;
    sc.style.height = `${h}px`;
  }
  const overlay = document.getElementById("scanner-overlay");
  if (overlay) {
    overlay.style.display = "flex";
    document.body.style.overflow = "hidden";
  }

  // 初期化
  html5QrCode = new Html5Qrcode("video-container", false);
  const backId = await selectBackCamera();
  const constraints = backId ? { deviceId: { exact: backId } } : { facingMode: { exact: "environment" } };
  const config = {
    fps: 10,
    formatsToSupport: formats,
    experimentalFeatures: { useBarCodeDetectorIfSupported: true },
    useBarCodeDetectorIfSupported: true
  };

  const onDecode = decoded => {
    const inputEl = document.getElementById(inputId);
    if (!inputEl) { stopScanning(); return; }

    try {
      if (formats.length === 1 && formats[0] === Html5QrcodeSupportedFormats.CODABAR) {
        // CODABAR の場合：先頭末尾 A/B/C/D を確認してトリミング
        if (decoded && decoded.length >= 2) {
          const pre = decoded[0], suf = decoded[decoded.length - 1];
          if (/[ABCD]/i.test(pre) && /[ABCD]/i.test(suf)) {
            decoded = decoded.substring(1, decoded.length - 1);
          }
        }
      } else {
        // QR：ZLIB64 展開（案件追加用想定）
        if (decoded && decoded.startsWith("ZLIB64:")) {
          const b64 = decoded.slice(7);
          const bin = atob(b64);
          const arr = new Uint8Array([...bin].map(c => c.charCodeAt(0)));
          const dec = pako.inflate(arr);
          decoded = new TextDecoder().decode(dec).trim().replace(/「[^」]*」/g, "");
        }
      }

      inputEl.value = decoded || "";
      inputEl.dispatchEvent(new Event("input", { bubbles: true }));
      inputEl.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      stopScanning();
    } catch (e) {
      console.error("デコード処理エラー:", e);
      stopScanning();
    }
  };

  try {
    await html5QrCode.start(constraints, config, onDecode, () => {});
  } catch (e) {
    console.error("カメラ起動失敗:", e);
    alert("カメラ起動に失敗しました");
    stopScanning();
  }

  // プレビュー領域タップで単発AF（端末による）
  const videoContainer = document.getElementById("video-container");
  if (videoContainer) {
    videoContainer.addEventListener("click", async () => {
      if (!html5QrCode) return;
      try { await html5QrCode.applyVideoConstraints({ advanced: [{ focusMode: "single-shot" }] }); } catch (_) {}
    });
  }
}

// スキャン停止（オーバーレイも閉じる）
async function stopScanning() {
  if (html5QrCode) {
    try { await html5QrCode.stop(); html5QrCode.clear(); } catch (_) {}
    html5QrCode = null;
  }
  const overlay = document.getElementById("scanner-overlay");
  if (overlay) overlay.style.display = "none";
  document.body.style.overflow = "";
  torchOn = false;
}

// ライトの ON/OFF
async function toggleTorch() {
  if (!html5QrCode) return;
  try {
    const settings = html5QrCode.getRunningTrackSettings();
    if (!("torch" in settings)) {
      alert("このデバイスはライト制御に対応していません");
      return;
    }
    torchOn = !torchOn;
    await html5QrCode.applyVideoConstraints({ advanced: [{ torch: torchOn }] });
  } catch (e) {
    console.warn("ライト制御失敗:", e);
  }
}

// ================================================================
//  DOMContentLoaded: カメラUI初期化（案件追加のQR入力用）
// ================================================================
window.addEventListener("DOMContentLoaded", () => {
  // オーバーレイの制御ボタン
  const closeBtn = document.getElementById("close-button");
  if (closeBtn) closeBtn.addEventListener("click", stopScanning);
  const torchBtn = document.getElementById("torch-button");
  if (torchBtn) torchBtn.addEventListener("click", toggleTorch);

  // 「案件追加」→ QR 入力欄（#case-barcode）に対する UI
  const caseCameraBtn = document.getElementById("case-camera-btn"); // 「カメラ起動」
  if (caseCameraBtn) {
    caseCameraBtn.style.display = "inline-block";
    // 「カメラ起動」を押すと、その下に「ファイルを選択」ボタンを表示し、
    // 端末カメラで写真を撮って（input capture）、ファイルでスキャンする流れ。
    let caseFileBtn = document.getElementById("case-file-btn");
    if (!caseFileBtn) {
      caseFileBtn = document.createElement("button");
      caseFileBtn.id = "case-file-btn";
      caseFileBtn.type = "button";
      caseFileBtn.textContent = "ファイルを選択";
      caseFileBtn.style.display = "none";
      caseCameraBtn.insertAdjacentElement("afterend", caseFileBtn);
    }
    caseCameraBtn.addEventListener("click", () => {
      // ボタンを表示するだけ（ライブカメラは使わず、静止画スキャン）
      caseFileBtn.style.display = "inline-block";
    });

    // ファイル選択→撮影→QRのみスキャン（ZLIB64対応）
    caseFileBtn.addEventListener("click", () => {
      const fileInput = document.createElement("input");
      fileInput.type = "file";
      // すべて表示（ただし実際のスキャン対象は画像）
      fileInput.accept = "*/*";
      // 背面カメラを優先した撮影モード（対応端末のみ）
      fileInput.capture = "environment";
      fileInput.onchange = e => {
        const f = e.target.files && e.target.files[0];
        if (f) {
          // 案件追加のQRは CODABAR ではないので false
          scanFileForInput(f, "case-barcode", false);
        }
      };
      fileInput.click();
    });
  }
});

// ================================================================
//  以降：アプリ本体（認証・画面遷移・CRUD・検索・詳細 など）
// ================================================================

let isAdmin = false;
let sessionTimer = null;
let currentOrderId = null;

// --- DOM取得（ログイン画面） ---
const loginView      = document.getElementById("login-view");
const mainView       = document.getElementById("main-view");
const loginErrorEl   = document.getElementById("login-error");
const emailInput     = document.getElementById("email");
const passwordInput  = document.getElementById("password");
const loginBtn       = document.getElementById("login-btn");
const signupBtn      = document.getElementById("signup-btn");
const guestBtn       = document.getElementById("guest-btn");
const resetBtn       = document.getElementById("reset-btn");
const logoutBtn      = document.getElementById("logout-btn");

// --- DOM取得（新規登録画面） ---
const signupView            = document.getElementById("signup-view");
const signupEmail           = document.getElementById("signup-email");
const signupPassword        = document.getElementById("signup-password");
const signupConfirmPassword = document.getElementById("signup-confirm-password");
const signupConfirmBtn      = document.getElementById("signup-confirm-btn");
const backToLoginBtn        = document.getElementById("back-to-login-btn");
const signupErrorEl         = document.getElementById("signup-error");

// --- DOM取得（ナビ） ---
const navAddBtn    = document.getElementById("nav-add-btn");
const navSearchBtn = document.getElementById("nav-search-btn");

// --- DOM取得（案件追加ビュー） ---
const scanModeDiv         = document.getElementById("scan-mode");
const manualModeDiv       = document.getElementById("manual-mode");
const startManualBtn      = document.getElementById("start-manual-btn");
const caseBarcodeInput    = document.getElementById("case-barcode");
const manualOrderIdInput  = document.getElementById("manual-order-id");
const manualCustomerInput = document.getElementById("manual-customer");
const manualTitleInput    = document.getElementById("manual-title");
const manualConfirmBtn    = document.getElementById("manual-confirm-btn");
const startScanBtn        = document.getElementById("start-scan-btn");

const caseDetailsDiv      = document.getElementById("case-details");
const detailOrderId       = document.getElementById("detail-order-id");
const detailCustomer      = document.getElementById("detail-customer");
const detailTitle         = document.getElementById("detail-title");

const fixedCarrierCheckbox = document.getElementById("fixed-carrier-checkbox");
const fixedCarrierSelect   = document.getElementById("fixed-carrier-select");
const trackingRows         = document.getElementById("tracking-rows");
const addTrackingRowBtn    = document.getElementById("add-tracking-row-btn");
const confirmAddCaseBtn    = document.getElementById("confirm-add-case-btn");
const addCaseMsg           = document.getElementById("add-case-msg");
const anotherCaseBtn       = document.getElementById("another-case-btn");

// --- DOM取得（検索ビュー） ---
const searchView        = document.getElementById("search-view");
const searchInput       = document.getElementById("search-input");
const startDateInput    = document.getElementById("start-date");
const endDateInput      = document.getElementById("end-date");
const searchBtn         = document.getElementById("search-btn");
const listAllBtn        = document.getElementById("list-all-btn");
const searchResults     = document.getElementById("search-results");
const deleteSelectedBtn = document.getElementById("delete-selected-btn");

// 管理者用：全選択チェックボックス
const selectAllContainer = document.getElementById("select-all-container");
const selectAllCheckbox  = document.getElementById("select-all-checkbox");
if (selectAllCheckbox) {
  selectAllCheckbox.onchange = () => {
    const boxes = searchResults.querySelectorAll(".select-case-checkbox");
    boxes.forEach(cb => cb.checked = selectAllCheckbox.checked);
  };
}

// --- DOM取得（案件詳細ビュー） ---
const caseDetailView               = document.getElementById("case-detail-view");
const detailInfoDiv                = document.getElementById("detail-info");
const detailShipmentsUl            = document.getElementById("detail-shipments");
const showAddTrackingBtn           = document.getElementById("show-add-tracking-btn");
const addTrackingDetail            = document.getElementById("add-tracking-detail");
const detailTrackingRows           = document.getElementById("detail-tracking-rows");
const detailAddRowBtn              = document.getElementById("detail-add-tracking-row-btn");
const confirmDetailAddBtn          = document.getElementById("confirm-detail-add-btn");
const detailAddMsg                 = document.getElementById("detail-add-msg");
const cancelDetailAddBtn           = document.getElementById("cancel-detail-add-btn");
const fixedCarrierCheckboxDetail   = document.getElementById("fixed-carrier-checkbox-detail");
const fixedCarrierSelectDetail     = document.getElementById("fixed-carrier-select-detail");
const backToSearchBtn              = document.getElementById("back-to-search-btn");
const anotherCaseBtn2              = document.getElementById("another-case-btn-2");

// ================================================================
//  セッション管理（10分無操作で強制ログアウト）
// ================================================================
const SESSION_LIMIT_MS = 10 * 60 * 1000;

function clearLoginTime() {
  localStorage.removeItem("loginTime");
}
function markLoginTime() {
  localStorage.setItem("loginTime", Date.now().toString());
}
function isSessionExpired() {
  const t = parseInt(localStorage.getItem("loginTime") || "0", 10);
  return Date.now() - t > SESSION_LIMIT_MS;
}
// 初期判定（期限切れなら即サインアウト）
if (isSessionExpired()) {
  auth.signOut().catch(err => console.warn("セッション期限切れサインアウト失敗:", err));
  clearLoginTime();
}

// ユーザー操作でタイマー更新＆loginTime更新
function resetSessionTimer() {
  clearTimeout(sessionTimer);
  sessionTimer = setTimeout(() => {
    alert("10分間操作がなかったため、ログアウトしました。再度ログインしてください。");
    auth.signOut();
    if (emailInput) emailInput.value = "";
    if (passwordInput) passwordInput.value = "";
  }, SESSION_LIMIT_MS);
  markLoginTime();
}
function startSessionTimer() {
  resetSessionTimer();
  ["click", "keydown", "touchstart", "input", "change"].forEach(evt => {
    document.addEventListener(evt, resetSessionTimer, { passive: true });
  });
}

// ================================================================
//  画面遷移ユーティリティ
// ================================================================
function showView(id) {
  document.querySelectorAll(".subview").forEach(el => el.style.display = "none");
  const target = document.getElementById(id);
  if (target) target.style.display = "block";
}

// ページロード直後のフォーカス（任意で有効化可能）
// if (loginView && loginView.style.display !== "none") emailInput?.focus();

// ================================================================
//  認証状態監視
// ================================================================
auth.onAuthStateChanged(async user => {
  const statusContainer = document.getElementById("login-status-container");
  if (statusContainer) statusContainer.textContent = "";

  if (user) {
    // 管理者判定
    try {
      const snap = await db.ref(`admins/${user.uid}`).once("value");
      isAdmin = snap.val() === true;
    } catch (e) {
      console.error("管理者判定エラー:", e);
      isAdmin = false;
    }

    if (loginView) loginView.style.display = "none";
    if (signupView) signupView.style.display = "none";
    if (mainView) mainView.style.display = "block";

    if (statusContainer) statusContainer.textContent = `${user.email || "ログイン中"} でログイン中`;

    // 初期画面：案件追加
    showView("add-case-view");
    initAddCaseView();

    // セッションタイマー開始
    startSessionTimer();

    // 管理者UI
    if (deleteSelectedBtn) deleteSelectedBtn.style.display = isAdmin ? "block" : "none";
  } else {
    // ログアウト遷移
    isAdmin = false;
    if (loginView)  loginView.style.display = "block";
    if (signupView) signupView.style.display = "none";
    if (mainView)   mainView.style.display = "none";
    clearLoginTime();
    if (statusContainer) statusContainer.textContent = "ログインしてください";
  }
});

// ================================================================
//  認証操作
// ================================================================
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
  if (loginView) loginView.style.display = "none";
  if (signupView) signupView.style.display = "block";
  // フォーム初期化
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
  try { await auth.signOut(); } catch (e) { console.error("サインアウトエラー:", e); }
  // 入力欄クリア・セッション削除・LS全消し
  if (emailInput) emailInput.value = "";
  if (passwordInput) passwordInput.value = "";
  clearLoginTime();
  localStorage.clear();
};

// 新規登録：登録処理
signupConfirmBtn.onclick = async () => {
  const email = signupEmail.value.trim();
  const pass  = signupPassword.value;
  const pass2 = signupConfirmPassword.value;
  signupErrorEl.textContent = "";
  if (!email || !pass || !pass2) {
    signupErrorEl.textContent = "全て入力してください";
    return;
  }
  if (pass !== pass2) {
    signupErrorEl.textContent = "パスワードが一致しません";
    return;
  }
  try {
    await auth.createUserWithEmailAndPassword(email, pass);
    markLoginTime();
    // onAuthStateChanged によりメイン画面へ
  } catch (e) {
    signupErrorEl.textContent = e.message;
  }
};
// 新規登録→ログインに戻る
backToLoginBtn.onclick = () => {
  if (signupView) signupView.style.display = "none";
  if (loginView)  loginView.style.display  = "block";
  signupErrorEl.textContent = "";
  loginErrorEl.textContent  = "";
};

// ================================================================
//  ナビゲーション
// ================================================================
navAddBtn.addEventListener("click", () => {
  showView("add-case-view");
  initAddCaseView();
});
navSearchBtn.addEventListener("click", () => {
  showView("search-view");
  // 条件クリアして全件表示
  searchInput.value = "";
  startDateInput.value = "";
  endDateInput.value   = "";
  searchAll();
});

// ================================================================
//  追跡行（入力欄＋カメラ/ファイルボタン）生成
//  - 案件追加画面、および詳細画面の「追跡番号追加」で使用
//  - モバイル（カメラ可）: ライブカメラ（CODABAR）
//  - PC/非対応: ファイル選択→静止画読み取り（CODABAR）
// ================================================================
function createTrackingRow(context = "add") {
  const row = document.createElement("div");
  row.className = "tracking-row";

  // 運送会社 select（固定チェック有無で変化）
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

  // 追跡番号 input
  const inp = document.createElement("input");
  inp.type = "text";
  inp.placeholder = "追跡番号を入力してください";
  inp.inputMode = "numeric";
  const uniqueId = `tracking-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  inp.id = uniqueId;

  // 入力中は非数値を除去
  inp.addEventListener("input", e => {
    e.target.value = e.target.value.replace(/\D/g, "");
  });

  // Enter/Tab で次行へ、最後なら行追加
  inp.addEventListener("keydown", e => {
    if (e.key !== "Enter" && e.key !== "Tab") return;
    e.preventDefault();
    const inputs = Array.from(row.parentElement.querySelectorAll('input[type="text"]'));
    const countBefore = inputs.length;
    const idx = inputs.indexOf(inp);
    if (idx !== -1 && idx < countBefore - 1) {
      inputs[idx + 1].focus();
    } else {
      if (context === "detail") detailAddRowBtn.click();
      else addTrackingRowBtn.click();
      setTimeout(() => {
        const newInputs = Array.from(row.parentElement.querySelectorAll('input[type="text"]'));
        if (newInputs[countBefore]) newInputs[countBefore].focus();
      }, 0);
    }
  });

  row.appendChild(inp);

  // カメラ／ファイルボタン
  if (canUseCamera()) {
    // モバイル（カメラ可）：ライブカメラで CODABAR リーダ
    const camBtn = document.createElement("button");
    camBtn.type = "button";
    camBtn.textContent = "カメラ起動";
    camBtn.className = "camera-btn";
    camBtn.addEventListener("click", () => {
      startScanning([Html5QrcodeSupportedFormats.CODABAR], uniqueId);
    });
    row.appendChild(camBtn);
  } else {
    // PC 等：ファイル選択（画像）→ CODABAR スキャン
    const fileBtn = document.createElement("button");
    fileBtn.type = "button";
    fileBtn.textContent = "ファイルを選択";
    fileBtn.className = "camera-btn";

    fileBtn.addEventListener("click", () => {
      const fileInput = document.createElement("input");
      fileInput.type = "file";
      // すべて表示（ただし実際のスキャンは画像ファイルを想定）
      fileInput.accept = "*/*";
      fileInput.capture = "environment";
      fileInput.onchange = e => {
        const f = e.target.files && e.target.files[0];
        if (f) scanFileForInput(f, uniqueId, true); // CODABAR
      };
      fileInput.click();
    });

    row.appendChild(fileBtn);
  }

  // 運送会社未選択の強調（追跡番号が入っているのにキャリア未選択）
  function updateMissingHighlight() {
    const tnVal = inp.value.trim();
    let carrierVal;
    if (context === "add") {
      carrierVal = fixedCarrierCheckbox.checked ? fixedCarrierSelect.value : row.querySelector("select")?.value;
    } else {
      carrierVal = fixedCarrierCheckboxDetail.checked ? fixedCarrierSelectDetail.value : row.querySelector("select")?.value;
    }
    if (tnVal && !carrierVal) row.classList.add("missing-carrier");
    else row.classList.remove("missing-carrier");
  }
  inp.addEventListener("input", updateMissingHighlight);
  const selEl = row.querySelector("select");
  if (selEl) selEl.addEventListener("change", updateMissingHighlight);

  return row;
}

// ================================================================
//  詳細画面：一括運送会社指定（固定のON/OFF）
// ================================================================
if (fixedCarrierCheckboxDetail) {
  fixedCarrierCheckboxDetail.onchange = () => {
    fixedCarrierSelectDetail.style.display = fixedCarrierCheckboxDetail.checked ? "inline-block" : "none";
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
}

// ================================================================
//  初期化：案件追加ビュー
// ================================================================
function initAddCaseView() {
  if (scanModeDiv) scanModeDiv.style.display = "block";
  if (manualModeDiv) manualModeDiv.style.display = "none";
  if (caseDetailsDiv) caseDetailsDiv.style.display = "none";
  if (caseBarcodeInput) caseBarcodeInput.value = "";
  if (manualOrderIdInput) manualOrderIdInput.value = "";
  if (manualCustomerInput) manualCustomerInput.value = "";
  if (manualTitleInput) manualTitleInput.value = "";
  if (addCaseMsg) addCaseMsg.textContent = "";

  if (fixedCarrierCheckbox) fixedCarrierCheckbox.checked = false;
  if (fixedCarrierSelect) {
    fixedCarrierSelect.style.display = "none";
    fixedCarrierSelect.value = "";
  }

  if (trackingRows) {
    trackingRows.innerHTML = "";
    for (let i = 0; i < 10; i++) trackingRows.appendChild(createTrackingRow());
  }
}

// 行追加・固定キャリア切替
addTrackingRowBtn.onclick = () => {
  for (let i = 0; i < 10; i++) trackingRows.appendChild(createTrackingRow());
};
fixedCarrierCheckbox.onchange = () => {
  fixedCarrierSelect.style.display = fixedCarrierCheckbox.checked ? "block" : "none";
  Array.from(trackingRows.children).forEach(row => {
    const sel = row.querySelector("select");
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
};

// IME無効化（QR入力欄）
caseBarcodeInput.addEventListener("compositionstart", e => e.preventDefault());

// QR→テキスト展開（案件追加） Enter で確定
caseBarcodeInput.addEventListener("keydown", e => {
  if (e.key !== "Enter") return;
  const raw = caseBarcodeInput.value.trim();
  if (!raw) return;
  let text;
  try {
    if (raw.startsWith("ZLIB64:")) {
      const b64 = raw.slice(7);
      const bin = atob(b64);
      const arr = new Uint8Array([...bin].map(c => c.charCodeAt(0)));
      const dec = pako.inflate(arr);
      text = new TextDecoder().decode(dec);
    } else {
      text = raw;
    }
  } catch (err) {
    alert("QRデコード失敗: " + err.message);
    return;
  }
  // 余計な鉤括弧内（「...」）は除去
  text = (text || "").trim().replace(/「[^」]*」/g, "");
  const matches = Array.from(text.matchAll(/"([^"]*)"/g), m => m[1]);
  detailOrderId.textContent  = matches[0] || "";
  detailCustomer.textContent = matches[1] || "";
  detailTitle.textContent    = matches[2] || "";
  if (scanModeDiv) scanModeDiv.style.display = "none";
  if (caseDetailsDiv) caseDetailsDiv.style.display = "block";
});

// 手動入力へ切替
startManualBtn.onclick = () => {
  if (scanModeDiv) scanModeDiv.style.display = "none";
  if (manualModeDiv) manualModeDiv.style.display = "block";
};
// バーコード入力に切替
startScanBtn.onclick = () => {
  if (manualModeDiv) manualModeDiv.style.display = "none";
  if (scanModeDiv)   scanModeDiv.style.display = "block";
};
// 手動確定
manualConfirmBtn.onclick = () => {
  if (!manualOrderIdInput.value || !manualCustomerInput.value || !manualTitleInput.value) {
    alert("必須項目を入力してください");
    return;
  }
  detailOrderId.textContent  = manualOrderIdInput.value.trim();
  detailCustomer.textContent = manualCustomerInput.value.trim();
  detailTitle.textContent    = manualTitleInput.value.trim();
  if (manualModeDiv) manualModeDiv.style.display = "none";
  if (caseDetailsDiv) caseDetailsDiv.style.display = "block";
};

// 登録（案件＋追跡）
confirmAddCaseBtn.onclick = async () => {
  const orderId  = detailOrderId.textContent.trim();
  const customer = detailCustomer.textContent.trim();
  const title    = detailTitle.textContent.trim();
  if (!orderId || !customer || !title) {
    addCaseMsg.textContent = "情報不足";
    return;
  }

  // 既存セット
  const snap = await db.ref(`shipments/${orderId}`).once("value");
  const existObj = snap.val() || {};
  const existSet = new Set(Object.values(existObj).map(it => `${it.carrier}:${it.tracking}`));

  // 新規項目集約
  const items = [];
  let missingCarrier = false;

  // 行の強調リセット
  Array.from(trackingRows.children).forEach(row => row.classList.remove("missing-carrier"));

  Array.from(trackingRows.children).forEach(row => {
    const tn = row.querySelector("input").value.trim();
    const carrier = fixedCarrierCheckbox.checked ? fixedCarrierSelect.value : row.querySelector("select")?.value;
    if (tn && !carrier) {
      missingCarrier = true;
      row.classList.add("missing-carrier");
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

  // ケース情報保存
  await db.ref(`cases/${orderId}`).set({
    注番: orderId,
    得意先: customer,
    品名: title,
    createdAt: Date.now()
  });

  // 追跡追加保存
  for (const it of items) {
    await db.ref(`shipments/${orderId}`).push({
      carrier: it.carrier,
      tracking: it.tracking,
      createdAt: Date.now()
    });
  }

  addCaseMsg.textContent = "登録完了";

  // 詳細画面を表示
  await showCaseDetail(orderId, { 得意先: customer, 品名: title });
};

// 別案件追加
anotherCaseBtn.onclick  = () => { showView("add-case-view");  initAddCaseView(); };
anotherCaseBtn2.onclick = () => { showView("add-case-view");  initAddCaseView(); };

// ================================================================
//  検索結果描画・検索
// ================================================================
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
      li.appendChild(cb);
    }

    const span = document.createElement("span");
    span.textContent = `${item.orderId} / ${item.得意先} / ${item.品名}`;
    li.appendChild(span);

    li.onclick = e => {
      if (e.target instanceof HTMLInputElement) return; // チェックボックスクリックは除外
      showCaseDetail(item.orderId, item);
    };

    searchResults.appendChild(li);
  });

  // 管理者UI
  deleteSelectedBtn.style.display = isAdmin ? "block" : "none";
  selectAllContainer.style.display = isAdmin ? "block" : "none";
  if (selectAllCheckbox) selectAllCheckbox.checked = false;

  // 全選択状態更新
  const boxes = searchResults.querySelectorAll(".select-case-checkbox");
  boxes.forEach(cb => cb.onchange = updateSelectAllState);
  updateSelectAllState();
}

// 全選択チェックボックスの状態更新
function updateSelectAllState() {
  if (!isAdmin) return;
  const boxes = searchResults.querySelectorAll(".select-case-checkbox");
  const checked = searchResults.querySelectorAll(".select-case-checkbox:checked");
  selectAllCheckbox.checked = (boxes.length > 0 && boxes.length === checked.length);
}

// 検索/一覧
function searchAll(kw = "") {
  db.ref("cases").once("value").then(snap => {
    const data = snap.val() || {};
    const res = [];
    const startVal = startDateInput.value;
    const endVal   = endDateInput.value;
    let startTs = null, endTs = null;
    if (startVal) startTs = new Date(startVal + "T00:00:00").getTime();
    if (endVal)   endTs   = new Date(endVal   + "T23:59:59").getTime();

    Object.entries(data).forEach(([orderId, obj]) => {
      const matchKw = !kw || orderId.includes(kw) || (obj.得意先 || "").includes(kw) || (obj.品名 || "").includes(kw);
      if (!matchKw) return;
      if (startTs !== null && obj.createdAt < startTs) return;
      if (endTs   !== null && obj.createdAt > endTs)   return;
      res.push({ orderId, ...obj });
    });

    // 新しい順
    res.sort((a, b) => b.createdAt - a.createdAt);
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
    endDateInput.value   = "";
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

// 管理者：選択削除
deleteSelectedBtn.onclick = async () => {
  const cbs = searchResults.querySelectorAll(".select-case-checkbox:checked");
  const count = cbs.length;
  if (count === 0) return;

  if (count === 1) {
    const orderId = cbs[0].dataset.orderId;
    if (!confirm(`「${orderId}」を削除しますか？`)) return;
  } else {
    if (!confirm("選択案件を削除しますか？")) return;
  }

  for (const cb of cbs) {
    const orderId = cb.dataset.orderId;
    try {
      await db.ref(`cases/${orderId}`).remove();
      await db.ref(`shipments/${orderId}`).remove();
    } catch (e) {
      console.error("削除失敗:", e);
    }
    cb.closest("li")?.remove();
  }
  updateSelectAllState();
};

// ================================================================
//  詳細表示＋ステータス取得
// ================================================================
async function showCaseDetail(orderId, obj) {
  showView("case-detail-view");
  detailInfoDiv.innerHTML = `<div>受注番号: ${orderId}</div><div>得意先: ${obj.得意先 || ""}</div><div>品名: ${obj.品名 || ""}</div>`;
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
    // 飛騨は固定URL
    if (it.carrier === "hida") a.href = carrierUrls[it.carrier];
    else a.href = carrierUrls[it.carrier] + encodeURIComponent(it.tracking);
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

// Cloudflare Worker API 経由でステータス取得
async function fetchStatus(carrier, tracking) {
  if (carrier === "hida") return { status: "非対応", time: null };
  const url = `https://track-api.hr46-ksg.workers.dev/?carrier=${encodeURIComponent(carrier)}&tracking=${encodeURIComponent(tracking)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ステータス用ラベル
function getTimeLabel(carrier, status, time) {
  if (!time || time.includes("：")) return "";
  if (carrier === "seino") {
    if (status === "配達済みです") return "配達日時:";
    return "最新日時:";
  }
  if (carrier === "yamato" || carrier === "tonami") {
    if (status === "配達完了" || status === "お届け完了" || status === "配達済み") return "配達日時:";
    return "予定日時:";
  }
  if (status && status.includes("配達完了")) return "配達日時:";
  return "予定日時:";
}
function formatShipmentText(carrier, tracking, status, time) {
  const label = carrierLabels[carrier] || carrier;
  if (carrier === "hida") return `${label}：${tracking}：${status}`;
  const tl = getTimeLabel(carrier, status, time);
  if (time) {
    return tl ? `${label}：${tracking}：${status}　${tl}${time}` : `${label}：${tracking}：${status}　${time}`;
  }
  return `${label}：${tracking}：${status}`;
}

// 詳細：追跡番号追加UI
showAddTrackingBtn.onclick = () => {
  addTrackingDetail.style.display = "block";
  detailTrackingRows.innerHTML = "";
  for (let i = 0; i < 5; i++) detailTrackingRows.appendChild(createTrackingRow("detail"));
  showAddTrackingBtn.style.display = "none";
};
detailAddRowBtn.onclick = () => {
  for (let i = 0; i < 5; i++) detailTrackingRows.appendChild(createTrackingRow("detail"));
};
cancelDetailAddBtn.onclick = () => {
  addTrackingDetail.style.display = "none";
  detailTrackingRows.innerHTML = "";
  detailAddMsg.textContent = "";
  showAddTrackingBtn.style.display = "inline-block";
};

// 追加登録（詳細）
confirmDetailAddBtn.onclick = async () => {
  if (!currentOrderId) return;

  const snap = await db.ref(`shipments/${currentOrderId}`).once("value");
  const existObj = snap.val() || {};
  const existSet = new Set(Object.values(existObj).map(it => `${it.carrier}:${it.tracking}`));

  const newItems = [];
  let missingCarrier = false;

  detailTrackingRows.querySelectorAll(".tracking-row").forEach(row => row.classList.remove("missing-carrier"));

  detailTrackingRows.querySelectorAll(".tracking-row").forEach(row => {
    const tn = row.querySelector("input").value.trim();
    if (!tn) return;
    const carrier = fixedCarrierCheckboxDetail.checked ? fixedCarrierSelectDetail.value : row.querySelector("select")?.value;
    if (!carrier) {
      missingCarrier = true;
      row.classList.add("missing-carrier");
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
    await db.ref(`shipments/${currentOrderId}`).push({
      carrier: it.carrier,
      tracking: it.tracking,
      createdAt: Date.now()
    });
  }

  // UI 更新
  const anchors = newItems.map(it => {
    const label = carrierLabels[it.carrier] || it.carrier;
    const a = document.createElement("a");
    if (it.carrier === "hida") a.href = carrierUrls[it.carrier];
    else a.href = carrierUrls[it.carrier] + encodeURIComponent(it.tracking);
    a.target = "_blank";
    a.textContent = `${label}：${it.tracking}：読み込み中…`;
    const li = document.createElement("li");
    li.appendChild(a);
    detailShipmentsUl.appendChild(li);
    return a;
  });

  // フォームを閉じる
  addTrackingDetail.style.display = "none";
  detailTrackingRows.innerHTML = "";
  showAddTrackingBtn.style.display = "inline-block";
  detailAddMsg.textContent = "追加しました";

  // ステータス取得
  newItems.forEach((it, idx) => {
    const a = anchors[idx];
    fetchStatus(it.carrier, it.tracking)
      .then(({ status, time }) => {
        a.textContent = formatShipmentText(it.carrier, it.tracking, status, time);
      })
      .catch(err => {
        console.error("fetchStatus error:", err);
        const label = carrierLabels[it.carrier] || it.carrier;
        a.textContent = `${label}：${it.tracking}：取得失敗`;
      });
  });
};
