// main.js

// ==============================
// Firebase 初期化
// ==============================
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

// セッション永続化：ブラウザのセッション単位
auth.setPersistence(firebase.auth.Auth.Persistence.SESSION)
  .catch(err => console.error("永続化設定エラー:", err));

// ==============================
// 追跡会社ラベル／URL
// ==============================
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
  // 飛騨運輸は固定URL
  hida:    "http://www.hida-unyu.co.jp/WP_HIDAUNYU_WKSHO_GUEST/KW_UD04015.do?_Action_=a_srcAction",
  sagawa:  "https://k2k.sagawa-exp.co.jp/p/web/okurijosearch.do?okurijoNo="
};

// ==============================
// 端末判定＆ユーティリティ
// ==============================

// スマホ／タブレット判定（UAベース：iOS/Android）
function isMobileDevice() {
  const ua = navigator.userAgent || navigator.vendor || window.opera;
  return /android|iPhone|iPad|iPod/i.test(ua);
}

// カメラが使えるか（スマホ かつ getUserMedia 対応）
function canUseCamera() {
  return isMobileDevice() && !!(navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === "function");
}

// mm → px（スキャナ枠のレイアウト計算用）
function mmToPx(mm) { return mm * (96 / 25.4); }

// ==============================
// 画像ファイルスキャン（html5-qrcode）
// ==============================
// allowedFormats: ["QR_CODE","PDF_417"] / ["CODABAR"] など
// postprocess    : "QR"（ZLIB64展開） / "CODABAR"（ABCD除去） / null
async function scanFileForInputStrict(file, inputId, { allowedFormats = null, postprocess = null } = {}) {
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
    const res = await scanner.scanFile(file, true); // trueで詳細情報取得
    const decodedRaw = typeof res === "string" ? res : res.decodedText;
    const formatName = (res && res.result && res.result.format && res.result.format.formatName)
      ? res.result.format.formatName : null;

    if (!decodedRaw) throw new Error("デコード結果なし");

    if (allowedFormats && formatName && !allowedFormats.includes(formatName)) {
      alert(`この画面では ${allowedFormats.join(" / ")} のみ対応です（選択は ${formatName || "不明"}）。`);
      return;
    }

    let decoded = decodedRaw;

    if (postprocess === "QR" && formatName === "QR_CODE") {
      // QR のみ ZLIB64 展開
      if (decoded.startsWith("ZLIB64:")) {
        const b64 = decoded.slice(7);
        const bin = atob(b64);
        const arr = new Uint8Array([...bin].map(c => c.charCodeAt(0)));
        const dec = pako.inflate(arr);
        decoded = new TextDecoder().decode(dec).trim().replace(/「[^」]*」/g, "");
      }
    } else if (postprocess === "CODABAR") {
      // CODABAR：先頭/末尾の A/B/C/D を除去
      if (decoded.length >= 2) {
        const pre = decoded[0], suf = decoded[decoded.length - 1];
        if (/[ABCD]/i.test(pre) && /[ABCD]/i.test(suf)) {
          decoded = decoded.substring(1, decoded.length - 1);
        }
      }
    }
    const inputEl = document.getElementById(inputId);
    if (inputEl) {
      inputEl.value = decoded;
      inputEl.dispatchEvent(new Event("input", { bubbles: true }));
      inputEl.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    }
  } catch (e) {
    console.error("ファイルスキャン失敗:", e);
    alert("ファイルからコードを読み取れませんでした");
  } finally {
    try { await scanner.clear(); } catch (_) {}
  }
}

// ==============================
// レンズ選択（広角優先 → 超広角 → その他 / 不明時は末尾から2番目 → 先頭）
// ==============================
async function choosePreferredBackCameraId() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const backs = devices.filter(d => d.kind === "videoinput" && /back|rear|environment/i.test(d.label));
    if (backs.length === 0) return null;

    const norm = s => (s || "").toLowerCase();

    const ultraIndex = backs.findIndex(d => {
      const l = norm(d.label);
      return /ultra[\s-]?wide|超広角|^0\.5x$| 0\.5x|0\.5x|0,5x/.test(l) || (l.includes("ultra") && l.includes("wide"));
    });
    const wideIndex = backs.findIndex(d => {
      const l = norm(d.label);
      return !l.includes("ultra") && (/\bwide(?!-?macro)\b/.test(l) || /\bwide-?angle\b/.test(l) || /\b1(\.0)?x\b/.test(l) || l.includes("標準"));
    });

    if (wideIndex !== -1) return backs[wideIndex].deviceId; // 広角優先
    if (ultraIndex !== -1) return backs[ultraIndex].deviceId; // 次：超広角

    if (backs.length >= 2) return backs[backs.length - 2].deviceId; // 不明：末尾から2番目
    return backs[0].deviceId; // 1本しかない場合
  } catch (e) {
    console.warn("カメラ列挙失敗:", e);
    return null;
  }
}

// ==============================
// カメラ スキャン（html5-qrcode）
// ==============================
let html5QrCode   = null; // ランタイム
let scanningInputId = null;
let currentFormats  = null; // 例: [QR_CODE, PDF_417] or [CODABAR]
let torchOn = false;

async function startScanning(formats, inputId) {
  // スマホのみ利用可能（PCはファイル選択）
  if (!canUseCamera()) {
    alert("このデバイスではカメラ機能は使用できません（スマホのみ）");
    return;
  }

  // 二重起動防止
  if (html5QrCode) {
    try { await html5QrCode.stop(); html5QrCode.clear(); } catch (_) {}
    html5QrCode = null;
  }

  scanningInputId = inputId;
  currentFormats  = formats;

  // オーバーレイ（9:16枠、上下左右 5mm 余白）
  const margin = mmToPx(5) * 2;
  const vw = window.innerWidth, vh = window.innerHeight, ratio = 9/16;
  let w = vw - margin, h = vh - margin;
  if (w / h > ratio) w = h * ratio; else h = w / ratio;
  const sc = document.getElementById("scanner-container");
  if (sc) { sc.style.width = `${w}px`; sc.style.height = `${h}px`; }
  const overlay = document.getElementById("scanner-overlay");
  if (overlay) { overlay.style.display = "flex"; document.body.style.overflow = "hidden"; }

  // 初期化
  html5QrCode = new Html5Qrcode("video-container", false);

  // レンズ選択（広角優先）
  const deviceId = await choosePreferredBackCameraId();
  const constraints = deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { exact: "environment" } };

  const config = {
    fps: 10,
    formatsToSupport: formats,
    experimentalFeatures: { useBarCodeDetectorIfSupported: true },
    useBarCodeDetectorIfSupported: true
  };

  // デコード成功時
  const onDecode = (decodedRaw, decodedResult) => {
    const inputEl = document.getElementById(scanningInputId);
    if (!inputEl) { stopScanning(); return; }
    try {
      const formatName = decodedResult?.result?.format?.formatName || null;
      let decoded = decodedRaw || "";

      if (formatName === "CODABAR") {
        if (decoded.length >= 2) {
          const pre = decoded[0], suf = decoded[decoded.length - 1];
          if (/[ABCD]/i.test(pre) && /[ABCD]/i.test(suf)) decoded = decoded.substring(1, decoded.length - 1);
        }
      } else if (formatName === "QR_CODE") {
        if (decoded.startsWith("ZLIB64:")) {
          const b64 = decoded.slice(7);
          const bin = atob(b64);
          const arr = new Uint8Array([...bin].map(c => c.charCodeAt(0)));
          const dec = pako.inflate(arr);
          decoded = new TextDecoder().decode(dec).trim().replace(/「[^」]*」/g, "");
        }
      }
      // PDF_417 はそのまま

      inputEl.value = decoded;
      inputEl.dispatchEvent(new Event("input", { bubbles: true }));
      inputEl.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      stopScanning();
    } catch (e) {
      console.error("デコード後処理エラー:", e);
      stopScanning();
    }
  };

  try {
    await html5QrCode.start(constraints, config, onDecode, () => {});
    // 端末がズーム対応なら「最小ズーム」に設定（=最広角）
    try {
      const track = html5QrCode.getRunningTrack?.();
      const caps  = track?.getCapabilities?.();
      if (caps && typeof caps.zoom !== "undefined") {
        const min = (typeof caps.zoom === "object" ? caps.zoom.min : 1) ?? 1;
        await html5QrCode.applyVideoConstraints({ advanced: [{ zoom: min }] });
      }
    } catch (_) {}
  } catch (e) {
    console.error("カメラ起動失敗:", e);
    alert("カメラ起動に失敗しました");
    stopScanning();
  }

  // プレビュー下の「ファイルを読み込み」ボタン（撮影→静止画読込→スキャン）
  const container = document.getElementById("scanner-container");
  let importBtn = document.getElementById("overlay-file-import-btn");
  if (!importBtn) {
    importBtn = document.createElement("button");
    importBtn.id = "overlay-file-import-btn";
    importBtn.className = "overlay-btn";
    importBtn.style.top = "auto";
    importBtn.style.bottom = "12px";
    importBtn.style.left = "12px";
    importBtn.textContent = "ファイルを読み込み";
    container?.appendChild(importBtn);
  }
  importBtn.onclick = () => {
    const fi = document.createElement("input");
    fi.type = "file";
    fi.accept = "image/*";
    fi.capture = "environment";
    fi.onchange = e => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      // 案件追加（QR/PDF417） or 追跡（CODABAR）に応じて厳格スキャン
      if (currentFormats?.some(fm => fm === Html5QrcodeSupportedFormats.QR_CODE || fm === Html5QrcodeSupportedFormats.PDF_417)) {
        scanFileForInputStrict(f, scanningInputId, { allowedFormats: ["QR_CODE","PDF_417"], postprocess: "QR" });
      } else {
        scanFileForInputStrict(f, scanningInputId, { allowedFormats: ["CODABAR"], postprocess: "CODABAR" });
      }
      stopScanning();
    };
    fi.click();
  };

  // プレビュータップでAF（端末依存）
  document.getElementById("video-container")?.addEventListener("click", async () => {
    try { await html5QrCode.applyVideoConstraints({ advanced: [{ focusMode: "single-shot" }] }); } catch (_) {}
  });
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

// ライトON/OFF
async function toggleTorch() {
  if (!html5QrCode) return;
  try {
    const settings = html5QrCode.getRunningTrackSettings?.() || {};
    if (!("torch" in settings)) {
      alert("ライトに対応していません");
      return;
    }
    torchOn = !torchOn;
    await html5QrCode.applyVideoConstraints({ advanced: [{ torch: torchOn }] });
  } catch (e) {
    console.warn("ライト制御失敗:", e);
  }
}

// ==============================
// セッション管理（10分無操作でログアウト）
// ==============================
const SESSION_LIMIT_MS = 10 * 60 * 1000;
let sessionTimer = null;

function clearLoginTime() { localStorage.removeItem("loginTime"); }
function markLoginTime()  { localStorage.setItem("loginTime", Date.now().toString()); }
function isSessionExpired() {
  const t = parseInt(localStorage.getItem("loginTime") || "0", 10);
  return Date.now() - t > SESSION_LIMIT_MS;
}
// 期限切れなら即サインアウト（初期ロード時）
if (isSessionExpired()) {
  auth.signOut().catch(err => console.warn("期限切れサインアウト失敗:", err));
  clearLoginTime();
}

function resetSessionTimer() {
  clearTimeout(sessionTimer);
  sessionTimer = setTimeout(() => {
    alert("10分間操作がなかったため、ログアウトしました。再度ログインしてください。");
    auth.signOut();
    if (window.emailInput) emailInput.value = "";
    if (window.passwordInput) passwordInput.value = "";
  }, SESSION_LIMIT_MS);
  markLoginTime();
}
function startSessionTimer() {
  resetSessionTimer();
  ["click", "keydown", "touchstart", "input", "change"].forEach(evt => {
    document.addEventListener(evt, resetSessionTimer, { passive: true });
  });
}

// ==============================
/* 以降は DOM 参照が必要な処理。
   —— 方法B：DOMContentLoaded 内で安全に初期化（存在チェック付き）—— */
// ==============================
let isAdmin = false;
let currentOrderId = null;

// ここで参照するDOM要素は let で宣言して、DOMContentLoaded 内で取得する
let loginView, mainView, signupView;
let loginErrorEl, emailInput, passwordInput;
let loginBtn, signupBtn, guestBtn, resetBtn, logoutBtn;
let signupEmail, signupPassword, signupConfirmPassword, signupConfirmBtn, backToLoginBtn, signupErrorEl;
let navAddBtn, navSearchBtn;
let scanModeDiv, manualModeDiv, startManualBtn, manualOrderIdInput, manualCustomerInput, manualTitleInput, manualConfirmBtn, startScanBtn;
let caseDetailsDiv, detailOrderId, detailCustomer, detailTitle;
let fixedCarrierCheckbox, fixedCarrierSelect, trackingRows, addTrackingRowBtn, confirmAddCaseBtn, addCaseMsg, anotherCaseBtn;
let searchView, searchInput, startDateInput, endDateInput, searchBtn, listAllBtn, searchResults, deleteSelectedBtn;
let selectAllContainer, selectAllCheckbox;
let caseDetailView, detailInfoDiv, detailShipmentsUl, showAddTrackingBtn, addTrackingDetail, detailTrackingRows, detailAddRowBtn, confirmDetailAddBtn, detailAddMsg, cancelDetailAddBtn, fixedCarrierCheckboxDetail, fixedCarrierSelectDetail, backToSearchBtn, anotherCaseBtn2;

// DOM 構築後にすべてのイベントを安全にバインド
window.addEventListener("DOMContentLoaded", () => {
  // ===== DOM要素の取得 =====
  loginView     = document.getElementById("login-view");
  mainView      = document.getElementById("main-view");
  signupView    = document.getElementById("signup-view");

  loginErrorEl  = document.getElementById("login-error");
  emailInput    = document.getElementById("email");
  passwordInput = document.getElementById("password");
  loginBtn      = document.getElementById("login-btn");
  signupBtn     = document.getElementById("signup-btn");
  guestBtn      = document.getElementById("guest-btn");
  resetBtn      = document.getElementById("reset-btn");
  logoutBtn     = document.getElementById("logout-btn");

  signupEmail           = document.getElementById("signup-email");
  signupPassword        = document.getElementById("signup-password");
  signupConfirmPassword = document.getElementById("signup-confirm-password");
  signupConfirmBtn      = document.getElementById("signup-confirm-btn");
  backToLoginBtn        = document.getElementById("back-to-login-btn");
  signupErrorEl         = document.getElementById("signup-error");

  navAddBtn    = document.getElementById("nav-add-btn");
  navSearchBtn = document.getElementById("nav-search-btn");

  scanModeDiv         = document.getElementById("scan-mode");
  manualModeDiv       = document.getElementById("manual-mode");
  startManualBtn      = document.getElementById("start-manual-btn");
  manualOrderIdInput  = document.getElementById("manual-order-id");
  manualCustomerInput = document.getElementById("manual-customer");
  manualTitleInput    = document.getElementById("manual-title");
  manualConfirmBtn    = document.getElementById("manual-confirm-btn");
  startScanBtn        = document.getElementById("start-scan-btn");

  caseDetailsDiv = document.getElementById("case-details");
  detailOrderId  = document.getElementById("detail-order-id");
  detailCustomer = document.getElementById("detail-customer");
  detailTitle    = document.getElementById("detail-title");

  fixedCarrierCheckbox = document.getElementById("fixed-carrier-checkbox");
  fixedCarrierSelect   = document.getElementById("fixed-carrier-select");
  trackingRows         = document.getElementById("tracking-rows");
  addTrackingRowBtn    = document.getElementById("add-tracking-row-btn");
  confirmAddCaseBtn    = document.getElementById("confirm-add-case-btn");
  addCaseMsg           = document.getElementById("add-case-msg");
  anotherCaseBtn       = document.getElementById("another-case-btn");

  searchView        = document.getElementById("search-view");
  searchInput       = document.getElementById("search-input");
  startDateInput    = document.getElementById("start-date");
  endDateInput      = document.getElementById("end-date");
  searchBtn         = document.getElementById("search-btn");
  listAllBtn        = document.getElementById("list-all-btn");
  searchResults     = document.getElementById("search-results");
  deleteSelectedBtn = document.getElementById("delete-selected-btn");

  selectAllContainer = document.getElementById("select-all-container");
  selectAllCheckbox  = document.getElementById("select-all-checkbox");

  caseDetailView             = document.getElementById("case-detail-view");
  detailInfoDiv              = document.getElementById("detail-info");
  detailShipmentsUl          = document.getElementById("detail-shipments");
  showAddTrackingBtn         = document.getElementById("show-add-tracking-btn");
  addTrackingDetail          = document.getElementById("add-tracking-detail");
  detailTrackingRows         = document.getElementById("detail-tracking-rows");
  detailAddRowBtn            = document.getElementById("detail-add-tracking-row-btn");
  confirmDetailAddBtn        = document.getElementById("confirm-detail-add-btn");
  detailAddMsg               = document.getElementById("detail-add-msg");
  cancelDetailAddBtn         = document.getElementById("cancel-detail-add-btn");
  fixedCarrierCheckboxDetail = document.getElementById("fixed-carrier-checkbox-detail");
  fixedCarrierSelectDetail   = document.getElementById("fixed-carrier-select-detail");
  backToSearchBtn            = document.getElementById("back-to-search-btn");
  anotherCaseBtn2            = document.getElementById("another-case-btn-2");

  // ===== スキャナオーバーレイの基本操作 =====
  document.getElementById("close-button")?.addEventListener("click", stopScanning);
  document.getElementById("torch-button")?.addEventListener("click", toggleTorch);

  // ===== 案件追加：スマホのみ「カメラ起動」／PCは「ファイルを選択」 =====
  const caseCameraBtn = document.getElementById("case-camera-btn");
  if (caseCameraBtn) {
    if (canUseCamera()) {
      caseCameraBtn.style.display = "inline-block";
      caseCameraBtn.textContent = "カメラ起動";
      caseCameraBtn.onclick = () => {
        startScanning([Html5QrcodeSupportedFormats.QR_CODE, Html5QrcodeSupportedFormats.PDF_417], "case-barcode");
      };
    } else {
      caseCameraBtn.style.display = "none";
      let fileBtn = document.getElementById("case-file-btn");
      if (!fileBtn) {
        fileBtn = document.createElement("button");
        fileBtn.id = "case-file-btn";
        fileBtn.type = "button";
        fileBtn.textContent = "ファイルを選択";
        caseCameraBtn.insertAdjacentElement("afterend", fileBtn);
      }
      fileBtn.onclick = () => {
        const fi = document.createElement("input");
        fi.type = "file";
        fi.accept = "*/*"; // すべて表示
        fi.capture = "environment";
        fi.onchange = e => {
          const f = e.target.files && e.target.files[0];
          if (f) scanFileForInputStrict(f, "case-barcode", { allowedFormats: ["QR_CODE","PDF_417"], postprocess: "QR" });
        };
        fi.click();
      };
    }
  }

  // ===== ログイン周り（存在チェック付き） =====
  if (loginBtn) loginBtn.onclick = async () => {
    const email = (emailInput?.value || "").trim();
    const password = passwordInput?.value || "";
    if (loginErrorEl) loginErrorEl.textContent = "";
    clearLoginTime();
    try {
      await auth.signInWithEmailAndPassword(email, password);
      markLoginTime();
    } catch (e) {
      const msg = `ログインに失敗しました（${e.code || 'no-code'}）: ${e.message}`;
      console.error("[LOGIN ERROR]", e);
      if (loginErrorEl) loginErrorEl.textContent = msg;
      alert(msg);
    }
  };
  if (signupBtn) signupBtn.onclick = () => {
    if (loginView) loginView.style.display = "none";
    if (signupView) signupView.style.display = "block";
    if (signupEmail)           signupEmail.value = (emailInput?.value || "").trim();
    if (signupPassword)        signupPassword.value = "";
    if (signupConfirmPassword) signupConfirmPassword.value = "";
    if (signupErrorEl)         signupErrorEl.textContent = "";
  };
  if (guestBtn) guestBtn.onclick = () => {
    auth.signInAnonymously()
      .catch(e => { if (loginErrorEl) loginErrorEl.textContent = e.message; });
  };
  if (resetBtn) resetBtn.onclick = () => {
    const email = (emailInput?.value || "").trim();
    auth.sendPasswordResetEmail(email)
      .then(() => { if (loginErrorEl) loginErrorEl.textContent = "再発行メール送信"; })
      .catch(e =>  { if (loginErrorEl) loginErrorEl.textContent = e.message; });
  };
  if (logoutBtn) logoutBtn.onclick = async () => {
    try { await auth.signOut(); } catch (e) { console.error("サインアウトエラー:", e); }
    if (emailInput) emailInput.value = "";
    if (passwordInput) passwordInput.value = "";
    clearLoginTime();
    localStorage.clear();
  };

  // 新規登録：登録処理
  if (signupConfirmBtn) signupConfirmBtn.onclick = async () => {
    const email = (signupEmail?.value || "").trim();
    const pass  = signupPassword?.value || "";
    const pass2 = signupConfirmPassword?.value || "";
    if (signupErrorEl) signupErrorEl.textContent = "";
    if (!email || !pass || !pass2) {
      if (signupErrorEl) signupErrorEl.textContent = "全て入力してください";
      return;
    }
    if (pass !== pass2) {
      if (signupErrorEl) signupErrorEl.textContent = "パスワードが一致しません";
      return;
    }
    try {
      await auth.createUserWithEmailAndPassword(email, pass);
      markLoginTime();
    } catch (e) {
      if (signupErrorEl) signupErrorEl.textContent = e.message;
    }
  };
  if (backToLoginBtn) backToLoginBtn.onclick = () => {
    if (signupView) signupView.style.display = "none";
    if (loginView)  loginView.style.display  = "block";
    if (signupErrorEl) signupErrorEl.textContent = "";
    if (loginErrorEl)  loginErrorEl.textContent  = "";
  };

  // ===== ナビゲーション =====
  if (navAddBtn) navAddBtn.addEventListener("click", () => {
    showView("add-case-view");
    initAddCaseView();
  });
  if (navSearchBtn) navSearchBtn.addEventListener("click", () => {
    showView("search-view");
    if (searchInput)    searchInput.value = "";
    if (startDateInput) startDateInput.value = "";
    if (endDateInput)   endDateInput.value   = "";
    searchAll();
  });

  // ===== QR欄：IME無効＋Enterで展開（案件追加） =====
  const caseBarcodeEl = document.getElementById("case-barcode");
  if (caseBarcodeEl) {
    caseBarcodeEl.addEventListener("compositionstart", e => e.preventDefault());
    caseBarcodeEl.addEventListener("keydown", e => {
      if (e.key !== "Enter") return;
      const raw = (e.target.value || "").trim();
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
      text = (text || "").trim().replace(/「[^」]*」/g, "");
      const matches = Array.from(text.matchAll(/"([^"]*)"/g), m => m[1]);
      if (detailOrderId)  detailOrderId.textContent  = matches[0] || "";
      if (detailCustomer) detailCustomer.textContent = matches[1] || "";
      if (detailTitle)    detailTitle.textContent    = matches[2] || "";
      if (scanModeDiv)    scanModeDiv.style.display  = "none";
      if (caseDetailsDiv) caseDetailsDiv.style.display = "block";
    });
  }

  // ===== 手動入力 切替 =====
  if (startManualBtn) startManualBtn.onclick = () => {
    if (scanModeDiv)   scanModeDiv.style.display   = "none";
    if (manualModeDiv) manualModeDiv.style.display = "block";
  };
  if (startScanBtn) startScanBtn.onclick = () => {
    if (manualModeDiv) manualModeDiv.style.display = "none";
    if (scanModeDiv)   scanModeDiv.style.display   = "block";
  };
  if (manualConfirmBtn) manualConfirmBtn.onclick = () => {
    if (!manualOrderIdInput?.value || !manualCustomerInput?.value || !manualTitleInput?.value) {
      alert("必須項目を入力してください"); return;
    }
    if (detailOrderId)  detailOrderId.textContent  = manualOrderIdInput.value.trim();
    if (detailCustomer) detailCustomer.textContent = manualCustomerInput.value.trim();
    if (detailTitle)    detailTitle.textContent    = manualTitleInput.value.trim();
    if (manualModeDiv)  manualModeDiv.style.display = "none";
    if (caseDetailsDiv) caseDetailsDiv.style.display = "block";
  };

  // ===== 追跡行関連（行追加／固定キャリア切替） =====
  if (addTrackingRowBtn) addTrackingRowBtn.onclick = () => {
    for (let i = 0; i < 10; i++) trackingRows?.appendChild(createTrackingRow());
  };
  if (fixedCarrierCheckbox) fixedCarrierCheckbox.onchange = () => {
    if (!fixedCarrierSelect) return;
    fixedCarrierSelect.style.display = fixedCarrierCheckbox.checked ? "block" : "none";
    Array.from(trackingRows?.children || []).forEach(row => {
      const sel = row.querySelector("select");
      if (fixedCarrierCheckbox.checked) {
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
  };

  // ===== 検索ボタン／全件ボタン =====
  if (searchBtn) searchBtn.onclick = () => {
    const kw = (searchInput?.value || "").trim();
    const hasKw = kw.length > 0;
    const hasPeriod = (startDateInput?.value || "") || (endDateInput?.value || "");
    showView("search-view");
    if (hasKw && hasPeriod) {
      if (searchInput)    searchInput.value = "";
      if (startDateInput) startDateInput.value = "";
      if (endDateInput)   endDateInput.value   = "";
      searchAll();
    } else {
      searchAll(kw);
    }
  };
  if (listAllBtn) listAllBtn.onclick = () => {
    if (searchInput)    searchInput.value = "";
    if (startDateInput) startDateInput.value = "";
    if (endDateInput)   endDateInput.value   = "";
    showView("search-view");
    searchAll();
  };

  // ===== 一覧の「全選択」チェックボックス =====
  if (selectAllCheckbox) {
    selectAllCheckbox.onchange = () => {
      const boxes = searchResults?.querySelectorAll(".select-case-checkbox") || [];
      boxes.forEach(cb => cb.checked = !!selectAllCheckbox.checked);
    };
  }

  // ===== 詳細画面：固定キャリアのON/OFF =====
  if (fixedCarrierCheckboxDetail) {
    fixedCarrierCheckboxDetail.onchange = () => {
      if (!fixedCarrierSelectDetail) return;
      fixedCarrierSelectDetail.style.display = fixedCarrierCheckboxDetail.checked ? "inline-block" : "none";
      Array.from(detailTrackingRows?.children || []).forEach(row => {
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
    };
  }

  // ===== 詳細画面：追跡番号追加UI =====
  if (showAddTrackingBtn) showAddTrackingBtn.onclick = () => {
    if (addTrackingDetail) addTrackingDetail.style.display = "block";
    if (detailTrackingRows) {
      detailTrackingRows.innerHTML = "";
      for (let i = 0; i < 5; i++) detailTrackingRows.appendChild(createTrackingRow("detail"));
    }
    showAddTrackingBtn.style.display = "none";
  };
  if (detailAddRowBtn) detailAddRowBtn.onclick = () => {
    for (let i = 0; i < 5; i++) detailTrackingRows?.appendChild(createTrackingRow("detail"));
  };
  if (cancelDetailAddBtn) cancelDetailAddBtn.onclick = () => {
    if (addTrackingDetail) addTrackingDetail.style.display = "none";
    if (detailTrackingRows) detailTrackingRows.innerHTML = "";
    if (detailAddMsg) detailAddMsg.textContent = "";
    if (showAddTrackingBtn) showAddTrackingBtn.style.display = "inline-block";
  };
  if (confirmDetailAddBtn) confirmDetailAddBtn.onclick = async () => {
    if (!currentOrderId) return;
    const snap = await db.ref(`shipments/${currentOrderId}`).once("value");
    const existObj = snap.val() || {};
    const existSet = new Set(Object.values(existObj).map(it => `${it.carrier}:${it.tracking}`));

    const newItems = [];
    let missingCarrier = false;

    detailTrackingRows?.querySelectorAll(".tracking-row").forEach(row => row.classList.remove("missing-carrier"));

    detailTrackingRows?.querySelectorAll(".tracking-row").forEach(row => {
      const tn = row.querySelector("input")?.value.trim();
      if (!tn) return;
      const carrier = fixedCarrierCheckboxDetail?.checked ? (fixedCarrierSelectDetail?.value || "") : (row.querySelector("select")?.value || "");
      if (!carrier) { missingCarrier = true; row.classList.add("missing-carrier"); return; }
      const key = `${carrier}:${tn}`;
      if (existSet.has(key)) return;
      existSet.add(key);
      newItems.push({ carrier, tracking: tn });
    });

    if (missingCarrier) { if (detailAddMsg) detailAddMsg.textContent = "運送会社を選択してください"; return; }
    if (newItems.length === 0) { alert("新規の追跡番号がありません（既に登録済み）"); return; }

    for (const it of newItems) {
      await db.ref(`shipments/${currentOrderId}`).push({ carrier: it.carrier, tracking: it.tracking, createdAt: Date.now() });
    }

    const anchors = newItems.map(it => {
      const label = carrierLabels[it.carrier] || it.carrier;
      const a = document.createElement("a");
      if (it.carrier === "hida") a.href = carrierUrls[it.carrier];
      else a.href = carrierUrls[it.carrier] + encodeURIComponent(it.tracking);
      a.target = "_blank";
      a.textContent = `${label}：${it.tracking}：読み込み中…`;
      const li = document.createElement("li");
      li.appendChild(a);
      detailShipmentsUl?.appendChild(li);
      return a;
    });

    if (addTrackingDetail) addTrackingDetail.style.display = "none";
    if (detailTrackingRows) detailTrackingRows.innerHTML = "";
    if (showAddTrackingBtn) showAddTrackingBtn.style.display = "inline-block";
    if (detailAddMsg) detailAddMsg.textContent = "追加しました";

    newItems.forEach((it, idx) => {
      const a = anchors[idx];
      fetchStatus(it.carrier, it.tracking)
        .then(({ status, time }) => a.textContent = formatShipmentText(it.carrier, it.tracking, status, time))
        .catch(err => {
          console.error("fetchStatus error:", err);
          const label = carrierLabels[it.carrier] || it.carrier;
          a.textContent = `${label}：${it.tracking}：取得失敗`;
        });
    });
  };
  if (backToSearchBtn) backToSearchBtn.onclick = () => showView("search-view");

  // ===== 案件追加の「登録」ボタン =====
  if (confirmAddCaseBtn) confirmAddCaseBtn.onclick = async () => {
    const orderId  = (detailOrderId?.textContent || "").trim();
    const customer = (detailCustomer?.textContent || "").trim();
    const title    = (detailTitle?.textContent || "").trim();
    if (!orderId || !customer || !title) { if (addCaseMsg) addCaseMsg.textContent = "情報不足"; return; }

    const snap = await db.ref(`shipments/${orderId}`).once("value");
    const existObj = snap.val() || {};
    const existSet = new Set(Object.values(existObj).map(it => `${it.carrier}:${it.tracking}`));

    const items = [];
    let missingCarrier = false;

    Array.from(trackingRows?.children || []).forEach(row => row.classList.remove("missing-carrier"));

    Array.from(trackingRows?.children || []).forEach(row => {
      const tn = row.querySelector("input")?.value.trim();
      const carrier = fixedCarrierCheckbox?.checked ? (fixedCarrierSelect?.value || "") : (row.querySelector("select")?.value || "");
      if (tn && !carrier) { missingCarrier = true; row.classList.add("missing-carrier"); }
      if (!tn || !carrier) return;

      const key = `${carrier}:${tn}`;
      if (existSet.has(key)) return;
      existSet.add(key);
      items.push({ carrier, tracking: tn });
    });

    if (missingCarrier) { if (addCaseMsg) addCaseMsg.textContent = "運送会社を選択してください"; return; }
    if (items.length === 0) { alert("新規追跡なし"); return; }

    await db.ref(`cases/${orderId}`).set({ 注番: orderId, 得意先: customer, 品名: title, createdAt: Date.now() });
    for (const it of items) {
      await db.ref(`shipments/${orderId}`).push({ carrier: it.carrier, tracking: it.tracking, createdAt: Date.now() });
    }

    if (addCaseMsg) addCaseMsg.textContent = "登録完了";
    await showCaseDetail(orderId, { 得意先: customer, 品名: title });
  };

  // ===== 別案件追加ボタン =====
  if (anotherCaseBtn)  anotherCaseBtn.onclick  = () => { showView("add-case-view"); initAddCaseView(); };
  if (anotherCaseBtn2) anotherCaseBtn2.onclick = () => { showView("add-case-view"); initAddCaseView(); };

  // ===== 最初の状態を現在の認証状態に同期 =====
  const user = auth.currentUser;
  if (user) {
    // ログイン済みならメイン画面へ
    if (loginView) loginView.style.display = "none";
    if (signupView) signupView.style.display = "none";
    if (mainView)   mainView.style.display   = "block";
    showView("add-case-view");
    initAddCaseView();
    startSessionTimer();
  } else {
    // 未ログインならログイン画面へ
    if (loginView) loginView.style.display = "block";
    if (signupView) signupView.style.display = "none";
    if (mainView)   mainView.style.display   = "none";
  }
});

// ==============================
// 画面遷移（共通）
// ==============================
function showView(id) {
  document.querySelectorAll(".subview").forEach(el => el.style.display = "none");
  const target = document.getElementById(id);
  if (target) target.style.display = "block";
}

// ==============================
// 認証監視（UIの切り替え）
// ==============================
auth.onAuthStateChanged(async user => {
  const statusContainer = document.getElementById("login-status-container");
  if (statusContainer) statusContainer.textContent = "";

  if (user) {
    try {
      const snap = await db.ref(`admins/${user.uid}`).once("value");
      isAdmin = snap.val() === true;
    } catch (e) {
      console.error("管理者判定エラー:", e);
      isAdmin = false;
    }

    if (document.getElementById("login-view"))  document.getElementById("login-view").style.display  = "none";
    if (document.getElementById("signup-view")) document.getElementById("signup-view").style.display = "none";
    if (document.getElementById("main-view"))   document.getElementById("main-view").style.display   = "block";

    if (statusContainer) statusContainer.textContent = `${user.email || "ログイン中"} でログイン中`;

    showView("add-case-view");
    initAddCaseView();
    startSessionTimer();

    const deleteSelectedBtnLocal = document.getElementById("delete-selected-btn");
    if (deleteSelectedBtnLocal) deleteSelectedBtnLocal.style.display = isAdmin ? "block" : "none";
  } else {
    isAdmin = false;
    if (document.getElementById("login-view"))  document.getElementById("login-view").style.display  = "block";
    if (document.getElementById("signup-view")) document.getElementById("signup-view").style.display = "none";
    if (document.getElementById("main-view"))   document.getElementById("main-view").style.display   = "none";
    clearLoginTime();
    if (statusContainer) statusContainer.textContent = "ログインしてください";
  }
});

// ==============================
// 追跡行の生成
//  - スマホのみ「カメラ起動」（CODABAR）
//  - PCは「ファイルを選択」（CODABAR）
// ==============================
function createTrackingRow(context = "add") {
  const row = document.createElement("div");
  row.className = "tracking-row";

  // 運送会社 select
  if (context === "add") {
    if (!fixedCarrierCheckbox?.checked) {
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
  } else { // detail
    if (!fixedCarrierCheckboxDetail?.checked) {
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

  // 数字のみ
  inp.addEventListener("input", e => e.target.value = e.target.value.replace(/\D/g, ""));

  // Enter/Tab で次 or 行追加
  inp.addEventListener("keydown", e => {
    if (e.key !== "Enter" && e.key !== "Tab") return;
    e.preventDefault();
    const inputs = Array.from(row.parentElement.querySelectorAll('input[type="text"]'));
    const countBefore = inputs.length;
    const idx = inputs.indexOf(inp);
    if (idx !== -1 && idx < countBefore - 1) {
      inputs[idx + 1].focus();
    } else {
      if (context === "detail") {
        document.getElementById("detail-add-tracking-row-btn")?.click();
      } else {
        document.getElementById("add-tracking-row-btn")?.click();
      }
      setTimeout(() => {
        const newInputs = Array.from(row.parentElement.querySelectorAll('input[type="text"]'));
        if (newInputs[countBefore]) newInputs[countBefore].focus();
      }, 0);
    }
  });

  row.appendChild(inp);

  // スマホ：カメラ ／ PC：ファイル選択（CODABAR限定）
  if (canUseCamera()) {
    const camBtn = document.createElement("button");
    camBtn.type = "button";
    camBtn.textContent = "カメラ起動";
    camBtn.className = "camera-btn";
    camBtn.addEventListener("click", () => {
      startScanning([Html5QrcodeSupportedFormats.CODABAR], uniqueId);
    });
    row.appendChild(camBtn);
  } else {
    const fileBtn = document.createElement("button");
    fileBtn.type = "button";
    fileBtn.textContent = "ファイルを選択";
    fileBtn.className = "camera-btn";
    fileBtn.addEventListener("click", () => {
      const fi = document.createElement("input");
      fi.type = "file";
      fi.accept = "*/*"; // すべて表示
      fi.capture = "environment";
      fi.onchange = e => {
        const f = e.target.files && e.target.files[0];
        if (f) scanFileForInputStrict(f, uniqueId, { allowedFormats: ["CODABAR"], postprocess: "CODABAR" });
      };
      fi.click();
    });
    row.appendChild(fileBtn);
  }

  // 運送会社未選択の強調
  function updateMissingHighlight() {
    const tnVal = inp.value.trim();
    let carrierVal;
    if (context === "add") {
      carrierVal = fixedCarrierCheckbox?.checked ? (fixedCarrierSelect?.value || "") : (row.querySelector("select")?.value || "");
    } else {
      carrierVal = fixedCarrierCheckboxDetail?.checked ? (fixedCarrierSelectDetail?.value || "") : (row.querySelector("select")?.value || "");
    }
    if (tnVal && !carrierVal) row.classList.add("missing-carrier");
    else row.classList.remove("missing-carrier");
  }
  inp.addEventListener("input", updateMissingHighlight);
  row.querySelector("select")?.addEventListener("change", updateMissingHighlight);

  return row;
}

// ==============================
// 初期化：案件追加ビュー
// ==============================
function initAddCaseView() {
  if (scanModeDiv)    scanModeDiv.style.display = "block";
  if (manualModeDiv)  manualModeDiv.style.display = "none";
  if (caseDetailsDiv) caseDetailsDiv.style.display = "none";

  const cb = document.getElementById("case-barcode");
  if (cb) cb.value = "";
  if (manualOrderIdInput)  manualOrderIdInput.value = "";
  if (manualCustomerInput) manualCustomerInput.value = "";
  if (manualTitleInput)    manualTitleInput.value = "";
  if (addCaseMsg)          addCaseMsg.textContent = "";

  if (fixedCarrierCheckbox) fixedCarrierCheckbox.checked = false;
  if (fixedCarrierSelect) { fixedCarrierSelect.style.display = "none"; fixedCarrierSelect.value = ""; }

  if (trackingRows) {
    trackingRows.innerHTML = "";
    for (let i = 0; i < 10; i++) trackingRows.appendChild(createTrackingRow());
  }
}

// ==============================
// 検索（一覧）
// ==============================
function renderSearchResults(list) {
  if (!searchResults) return;
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
      if (e.target instanceof HTMLInputElement) return;
      showCaseDetail(item.orderId, item);
    };

    searchResults.appendChild(li);
  });

  if (deleteSelectedBtn) deleteSelectedBtn.style.display = isAdmin ? "block" : "none";
  if (selectAllContainer) selectAllContainer.style.display = isAdmin ? "block" : "none";
  if (selectAllCheckbox) selectAllCheckbox.checked = false;

  const boxes = searchResults.querySelectorAll(".select-case-checkbox");
  boxes.forEach(cb => cb.onchange = updateSelectAllState);
  updateSelectAllState();
}
function updateSelectAllState() {
  if (!isAdmin || !selectAllCheckbox || !searchResults) return;
  const boxes = searchResults.querySelectorAll(".select-case-checkbox");
  const checked = searchResults.querySelectorAll(".select-case-checkbox:checked");
  selectAllCheckbox.checked = (boxes.length > 0 && boxes.length === checked.length);
}
function searchAll(kw = "") {
  db.ref("cases").once("value").then(snap => {
    const data = snap.val() || {};
    const res = [];
    const startVal = startDateInput?.value || "";
    const endVal   = endDateInput?.value || "";
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

    res.sort((a, b) => b.createdAt - a.createdAt);
    renderSearchResults(res);
  });
}

// ==============================
// 詳細表示＋配送ステータス
// ==============================
async function showCaseDetail(orderId, obj) {
  showView("case-detail-view");
  if (detailInfoDiv) detailInfoDiv.innerHTML = `<div>受注番号: ${orderId}</div><div>得意先: ${obj.得意先 || ""}</div><div>品名: ${obj.品名 || ""}</div>`;
  if (detailShipmentsUl) detailShipmentsUl.innerHTML = "";
  currentOrderId = orderId;
  if (addTrackingDetail) addTrackingDetail.style.display = "none";
  if (detailTrackingRows) detailTrackingRows.innerHTML = "";
  if (detailAddMsg) detailAddMsg.textContent = "";
  if (detailAddRowBtn) detailAddRowBtn.disabled = false;
  if (confirmDetailAddBtn) confirmDetailAddBtn.disabled = false;
  if (cancelDetailAddBtn) cancelDetailAddBtn.disabled = false;

  const snap = await db.ref(`shipments/${orderId}`).once("value");
  const list = snap.val() || {};
  for (const key of Object.keys(list)) {
    const it = list[key];
    const label = carrierLabels[it.carrier] || it.carrier;
    const a = document.createElement("a");
    if (it.carrier === "hida") a.href = carrierUrls[it.carrier];
    else a.href = carrierUrls[it.carrier] + encodeURIComponent(it.tracking);
    a.target = "_blank";
    a.textContent = `${label}：${it.tracking}：読み込み中…`;
    const li = document.createElement("li");
    li.appendChild(a);
    detailShipmentsUl?.appendChild(li);
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

// ステータス取得（Worker経由）
async function fetchStatus(carrier, tracking) {
  if (carrier === "hida") return { status: "非対応", time: null };
  const url = `https://track-api.hr46-ksg.workers.dev/?carrier=${encodeURIComponent(carrier)}&tracking=${encodeURIComponent(tracking)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
function getTimeLabel(carrier, status, time) {
  if (!time || time.includes("：")) return "";
  if (carrier === "seino") return (status === "配達済みです") ? "配達日時:" : "最新日時:";
  if (carrier === "yamato" || carrier === "tonami") {
    return (status === "配達完了" || status === "お届け完了" || status === "配達済み") ? "配達日時:" : "予定日時:";
  }
  return (status && status.includes("配達完了")) ? "配達日時:" : "予定日時:";
}
function formatShipmentText(carrier, tracking, status, time) {
  const label = carrierLabels[carrier] || carrier;
  if (carrier === "hida") return `${label}：${tracking}：${status}`;
  const tl = getTimeLabel(carrier, status, time);
  if (time) return tl ? `${label}：${tracking}：${status}　${tl}${time}` : `${label}：${tracking}：${status}　${time}`;
  return `${label}：${tracking}：${status}`;
}

// ==============================
// 検索画面：削除（管理者）
// ==============================
if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", () => {
    const delBtn = document.getElementById("delete-selected-btn");
    if (delBtn) delBtn.onclick = async () => {
      const boxes = document.querySelectorAll(".select-case-checkbox:checked");
      const count = boxes.length;
      if (count === 0) return;
      if (count === 1) {
        const orderId = boxes[0].dataset.orderId;
        if (!confirm(`「${orderId}」を削除しますか？`)) return;
      } else {
        if (!confirm("選択案件を削除しますか？")) return;
      }
      for (const cb of boxes) {
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
  });
}
