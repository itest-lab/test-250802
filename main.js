// main.js

// ================================================================
// Firebase 初期化
// ================================================================
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

// セッション永続化：ブラウザの「セッション」スコープ（タブを閉じると消える）
auth.setPersistence(firebase.auth.Auth.Persistence.SESSION)
  .catch(err => console.error("永続化設定エラー:", err));

// ================================================================
// キャリア表示ラベル／追跡ページURL
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
  // 飛騨運輸は個別番号埋め込みなし（固定URL）
  hida:    "http://www.hida-unyu.co.jp/WP_HIDAUNYU_WKSHO_GUEST/KW_UD04015.do?_Action_=a_srcAction",
  sagawa:  "https://k2k.sagawa-exp.co.jp/p/web/okurijosearch.do?okurijoNo="
};

// ================================================================
// 端末判定 & 共通ユーティリティ
// ================================================================
// スマホ／タブレット判定（UA で iOS/Android を拾う）
function isMobileDevice() {
  const ua = navigator.userAgent || navigator.vendor || window.opera;
  return /android|iphone|ipad|ipod/i.test(ua);
}
// カメラ可否（スマホ かつ getUserMedia 対応）
function canUseCamera() {
  return isMobileDevice() &&
         !!(navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === "function");
}
// mm→px（プレビュー領域計算用）
function mmToPx(mm){ return mm * (96 / 25.4); }

// ================================================================
// ファイルからのスキャン（html5-qrcode）
//   - 「案件追加」：QR_CODE / PDF_417 のみ許可（QR時は ZLIB64 展開）
//   - 「追跡番号」：CODABAR のみ許可（先頭末尾 A/B/C/D を除去）
//   - iOS HEIC/HEIF など非対応画像は読み取れません（カメラから JPG 推奨）
// ================================================================
async function scanFileForInputStrict(file, inputId, { allowedFormats = null, postprocess = null } = {}) {
  // ▼ 一時コンテナ（不可視）を作成
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
    // 第二引数 true：詳細（formatName 等）を返す
    const res = await scanner.scanFile(file, true);
    const decodedRaw = typeof res === "string" ? res : res.decodedText;
    const formatName = (res && res.result && res.result.format && res.result.format.formatName)
      ? res.result.format.formatName : null;

    if (!decodedRaw) throw new Error("デコード結果なし");

    // ▼ フォーマット厳格チェック（formatName が取得できた時のみ厳密に判定）
    if (allowedFormats && formatName && !allowedFormats.includes(formatName)) {
      alert(`この画面では ${allowedFormats.join(" / ")} のみ対応です（選択は ${formatName}）。`);
      return;
    }

    // ▼ 後処理
    let decoded = decodedRaw;
    if (postprocess === "QR" && (!allowedFormats || allowedFormats.includes("QR_CODE"))) {
      // QR のみ ZLIB64 展開（案件追加）
      if (formatName === "QR_CODE" && decoded.startsWith("ZLIB64:")) {
        const b64 = decoded.slice(7);
        const bin = atob(b64);
        const arr = new Uint8Array([...bin].map(c => c.charCodeAt(0)));
        const dec = pako.inflate(arr);
        decoded = new TextDecoder().decode(dec).trim().replace(/「[^」]*」/g, "");
      }
    } else if (postprocess === "CODABAR" && (!allowedFormats || allowedFormats.includes("CODABAR"))) {
      // CODABAR：先頭/末尾の A/B/C/D を除去（追跡番号）
      if (decoded.length >= 2) {
        const pre = decoded[0], suf = decoded[decoded.length - 1];
        if (/[ABCD]/i.test(pre) && /[ABCD]/i.test(suf)) {
          decoded = decoded.substring(1, decoded.length - 1);
        }
      }
      // CODABAR は「数字のみ」にしたいので非数字は除去（読みの揺れ対策）
      decoded = decoded.replace(/\D/g, "");
    }

    const inputEl = document.getElementById(inputId);
    if (inputEl) {
      inputEl.value = decoded;
      // 既存処理（input/Enter）を発火
      inputEl.dispatchEvent(new Event("input", { bubbles: true }));
      inputEl.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    }
  } catch (e) {
    console.error("ファイルスキャン失敗:", e);
    alert("ファイルからコードを読み取れませんでした。画像（JPG/PNG）をご使用ください。");
  } finally {
    try { await scanner.clear(); } catch (_) {}
  }
}

// ================================================================
// レンズ選択（“絶対最小倍率”の次の倍率のレンズを選ぶ）
//   - デバイス情報（ラベル）から倍率を推測：0.5x / 1x / 2x / 3x / … を抽出し昇順ソート
//   - 数値抽出できない場合はキーワードで推測：Ultra-Wide(0.5x) / Wide(1x) / Tele(>1x)
//   - 何も判断できないときはフォールバック：背面配列の「2番目」→「先頭」
//   - 背面が1つしかないときはそれを使用
// ================================================================
function parseZoomFactorFromLabel(label) {
  if (!label) return null;
  const l = label.toLowerCase();
  // 「0.5x」「2x」「3×」「1,0x」「1.0倍」などに対応
  const m = l.match(/(\d+(?:[.,]\d+)?)\s*(x|×|倍)/i);
  if (m) {
    const num = parseFloat(m[1].replace(",", "."));
    if (!isNaN(num)) return num;
  }
  // キーワード推測
  if (/(ultra[\s-]?wide|超広角)/.test(l)) return 0.5;
  if (/\bwide\b|wide-?angle|標準/.test(l)) return 1;
  if (/(tele|望遠)/.test(l)) return 2; // だいたい2x以上
  return null;
}
async function choosePreferredBackCameraId() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const backs = devices.filter(d => d.kind === "videoinput" && /back|rear|environment/i.test(d.label));
    if (backs.length === 0) return null;
    if (backs.length === 1) return backs[0].deviceId; // 1つのみ → それを使う

    // ズーム倍率（推測）を付与
    const withFactor = backs.map(d => ({ d, f: parseZoomFactorFromLabel(d.label) }));

    // 1) 倍率が数値で取れたものだけで昇順ソート → 2番目を選ぶ
    const numeric = withFactor.filter(x => typeof x.f === "number").sort((a,b) => a.f - b.f);
    if (numeric.length >= 2) return numeric[1].d.deviceId; // “最小”の次

    // 2) 数値が揃わない場合：Ultra-Wide(0.5)→Wide(1)→Other の優先で探す（次点のWide）
    const ultra = backs.find(d => /(ultra[\s-]?wide|超広角|0\.?5x|0,?5x)/i.test(d.label));
    const wide  = backs.find(d => !/(ultra[\s-]?wide|超広角)/i.test(d.label) &&
                                  (/(\bwide\b|wide-?angle|標準|\b1(\.0)?x\b)/i.test(d.label)));
    if (wide)  return wide.deviceId;   // 次に大きい（=広角）
    if (ultra) return ultra.deviceId;  // 広角がないときは超広角

    // 3) 判断不能：配列の「末尾から2番目」→「先頭」
    if (backs.length >= 2) return backs[backs.length - 2].deviceId;
    return backs[0].deviceId;
  } catch (e) {
    console.warn("カメラ列挙失敗:", e);
    return null;
  }
}

// ================================================================
// カメラ（html5-qrcode）
//   - 追跡番号（1D）は CODABAR 限定：QR を“絶対に”通さない（callback 側で弾く）
//   - 案件追加は QR_CODE / PDF_417 のみ
//   - プレビュー下に「ファイルを読み込み」ボタン（撮影→静止画→スキャン）
//   - 起動後はズームを“最小”に適用（最広角）。レンズは「最小の次」優先
// ================================================================
let html5QrCode = null;
let scanningInputId = null;
let currentFormats = null;
let torchOn = false;

async function startScanning(formats, inputId) {
  if (!canUseCamera()) {
    alert("このデバイスではカメラ機能は使用できません（スマホのみ）。PCでは「ファイルを選択」を使用してください。");
    return;
  }

  // 二重起動回避
  if (html5QrCode) {
    try { await html5QrCode.stop(); html5QrCode.clear(); } catch (_) {}
    html5QrCode = null;
  }

  scanningInputId = inputId;
  currentFormats  = formats;

  // オーバーレイ（9:16／上下左右5mmマージン）
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

  // レンズ選択（“絶対最小倍率”の次の倍率）
  const deviceId = await choosePreferredBackCameraId();
  const constraints = deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { exact: "environment" } };

  const config = {
    fps: 10,
    formatsToSupport: formats, // 例）[Html5QrcodeSupportedFormats.CODABAR] / [QR_CODE, PDF_417]
    experimentalFeatures: { useBarCodeDetectorIfSupported: true },
    useBarCodeDetectorIfSupported: true
  };

  // ▼ デコード成功時のコールバック
  const onDecode = (decodedRaw, decodedResult) => {
    const inputEl = document.getElementById(scanningInputId);
    if (!inputEl) { stopScanning(); return; }

    const formatName = decodedResult?.result?.format?.formatName || null;

    // --- 厳格フィルタ：現在の期待フォーマット以外は無視して継続 ---
    if (Array.isArray(currentFormats) && formatName) {
      // currentFormats は Html5QrcodeSupportedFormats の数値列 → formatName 文字列に変換して比較
      const allowed = [];
      currentFormats.forEach(f => {
        for (const k in Html5QrcodeSupportedFormats) {
          if (Html5QrcodeSupportedFormats[k] === f) allowed.push(k);
        }
      });
      if (!allowed.includes(formatName)) {
        // 追跡番号のカメラで QR_CODE を読んだ場合などは“弾いて”続行
        return;
      }
    }

    try {
      let decoded = decodedRaw || "";

      if (formatName === "CODABAR") {
        // 追跡番号：先頭末尾 A/B/C/D を除去し、数字以外を取り除く
        if (decoded.length >= 2) {
          const pre = decoded[0], suf = decoded[decoded.length - 1];
          if (/[ABCD]/i.test(pre) && /[ABCD]/i.test(suf)) decoded = decoded.substring(1, decoded.length - 1);
        }
        decoded = decoded.replace(/\D/g, "");
      } else if (formatName === "QR_CODE") {
        // 案件追加：ZLIB64 展開に対応
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
    // 起動後：ズームがあれば最小に（=最広角）
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

  // ▼ プレビュー下に「ファイルを読み込み」ボタンを設置（撮影→静止画→スキャン）
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
    fi.accept = "image/*"; // ★画像のみ（PDFはライブラリ非対応のため除外）
    fi.capture = "environment";
    fi.onchange = e => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      // 現在のモードに応じて厳格スキャン
      if (currentFormats?.some(fm => fm === Html5QrcodeSupportedFormats.QR_CODE || fm === Html5QrcodeSupportedFormats.PDF_417)) {
        scanFileForInputStrict(f, scanningInputId, { allowedFormats: ["QR_CODE","PDF_417"], postprocess: "QR" });
      } else {
        scanFileForInputStrict(f, scanningInputId, { allowedFormats: ["CODABAR"], postprocess: "CODABAR" });
      }
      stopScanning();
    };
    fi.click();
  };

  // ▼ 画面タップで AF を試行（端末依存）
  document.getElementById("video-container")?.addEventListener("click", async () => {
    try { await html5QrCode.applyVideoConstraints({ advanced: [{ focusMode: "single-shot" }] }); } catch (_) {}
  });
}

// スキャン停止（オーバーレイを閉じる）
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

// ライト ON/OFF
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

// ================================================================
// セッション管理（10分無操作で強制ログアウト）
// ================================================================
const SESSION_LIMIT_MS = 10 * 60 * 1000;
let sessionTimer = null;

function clearLoginTime(){ localStorage.removeItem("loginTime"); }
function markLoginTime(){ localStorage.setItem("loginTime", Date.now().toString()); }
function isSessionExpired(){
  const t = parseInt(localStorage.getItem("loginTime") || "0", 10);
  return Date.now() - t > SESSION_LIMIT_MS;
}
// 初期ロードで期限切れならサインアウト
if (isSessionExpired()) {
  auth.signOut().catch(err => console.warn("期限切れサインアウト失敗:", err));
  clearLoginTime();
}
function resetSessionTimer() {
  clearTimeout(sessionTimer);
  sessionTimer = setTimeout(() => {
    alert("10分間操作がなかったため、ログアウトしました。再度ログインしてください。");
    auth.signOut();
    const emailInput = document.getElementById("email");
    const passwordInput = document.getElementById("password");
    if (emailInput)    emailInput.value = "";
    if (passwordInput) passwordInput.value = "";
  }, SESSION_LIMIT_MS);
  markLoginTime();
}
function startSessionTimer() {
  resetSessionTimer();
  ["click","keydown","touchstart","input","change"].forEach(evt => {
    document.addEventListener(evt, resetSessionTimer, { passive: true });
  });
}

// ================================================================
// 以下、DOM が必要な処理は DOMContentLoaded 後に初期化（null安全）
// ================================================================
let isAdmin = false;
let currentOrderId = null;

window.addEventListener("DOMContentLoaded", () => {
  // ===== スキャナオーバーレイ操作 =====
  document.getElementById("close-button")?.addEventListener("click", stopScanning);
  document.getElementById("torch-button")?.addEventListener("click", toggleTorch);

  // ===== ログイン／サインアップ画面のDOM =====
  const loginView      = document.getElementById("login-view");
  const mainView       = document.getElementById("main-view");
  const signupView     = document.getElementById("signup-view");

  const loginErrorEl   = document.getElementById("login-error");
  const emailInput     = document.getElementById("email");
  const passwordInput  = document.getElementById("password");
  const loginBtn       = document.getElementById("login-btn");
  const signupBtn      = document.getElementById("signup-btn");
  const guestBtn       = document.getElementById("guest-btn");
  const resetBtn       = document.getElementById("reset-btn");
  const logoutBtn      = document.getElementById("logout-btn");

  const signupEmail           = document.getElementById("signup-email");
  const signupPassword        = document.getElementById("signup-password");
  const signupConfirmPassword = document.getElementById("signup-confirm-password");
  const signupConfirmBtn      = document.getElementById("signup-confirm-btn");
  const backToLoginBtn        = document.getElementById("back-to-login-btn");
  const signupErrorEl         = document.getElementById("signup-error");

  // ===== ナビ & 画面（案件追加／検索／詳細） =====
  const navAddBtn    = document.getElementById("nav-add-btn");
  const navSearchBtn = document.getElementById("nav-search-btn");

  const scanModeDiv         = document.getElementById("scan-mode");
  const manualModeDiv       = document.getElementById("manual-mode");
  const startManualBtn      = document.getElementById("start-manual-btn");
  const manualOrderIdInput  = document.getElementById("manual-order-id");
  const manualCustomerInput = document.getElementById("manual-customer");
  const manualTitleInput    = document.getElementById("manual-title");
  const manualConfirmBtn    = document.getElementById("manual-confirm-btn");
  const startScanBtn        = document.getElementById("start-scan-btn");

  const caseDetailsDiv = document.getElementById("case-details");
  const detailOrderId  = document.getElementById("detail-order-id");
  const detailCustomer = document.getElementById("detail-customer");
  const detailTitle    = document.getElementById("detail-title");

  const fixedCarrierCheckbox = document.getElementById("fixed-carrier-checkbox");
  const fixedCarrierSelect   = document.getElementById("fixed-carrier-select");
  const trackingRows         = document.getElementById("tracking-rows");
  const addTrackingRowBtn    = document.getElementById("add-tracking-row-btn");
  const confirmAddCaseBtn    = document.getElementById("confirm-add-case-btn");
  const addCaseMsg           = document.getElementById("add-case-msg");
  const anotherCaseBtn       = document.getElementById("another-case-btn");

  const searchView        = document.getElementById("search-view");
  const searchInput       = document.getElementById("search-input");
  const startDateInput    = document.getElementById("start-date");
  const endDateInput      = document.getElementById("end-date");
  const searchBtn         = document.getElementById("search-btn");
  const listAllBtn        = document.getElementById("list-all-btn");
  const searchResults     = document.getElementById("search-results");
  const deleteSelectedBtn = document.getElementById("delete-selected-btn");

  const selectAllContainer = document.getElementById("select-all-container");
  const selectAllCheckbox  = document.getElementById("select-all-checkbox");

  const caseDetailView             = document.getElementById("case-detail-view");
  const detailInfoDiv              = document.getElementById("detail-info");
  const detailShipmentsUl          = document.getElementById("detail-shipments");
  const showAddTrackingBtn         = document.getElementById("show-add-tracking-btn");
  const addTrackingDetail          = document.getElementById("add-tracking-detail");
  const detailTrackingRows         = document.getElementById("detail-tracking-rows");
  const detailAddRowBtn            = document.getElementById("detail-add-tracking-row-btn");
  const confirmDetailAddBtn        = document.getElementById("confirm-detail-add-btn");
  const detailAddMsg               = document.getElementById("detail-add-msg");
  const cancelDetailAddBtn         = document.getElementById("cancel-detail-add-btn");
  const fixedCarrierCheckboxDetail = document.getElementById("fixed-carrier-checkbox-detail");
  const fixedCarrierSelectDetail   = document.getElementById("fixed-carrier-select-detail");
  const backToSearchBtn            = document.getElementById("back-to-search-btn");
  const anotherCaseBtn2            = document.getElementById("another-case-btn-2");

  // ===== 共通：画面切替 =====
  function showView(id) {
    document.querySelectorAll(".subview").forEach(el => el.style.display = "none");
    const target = document.getElementById(id);
    if (target) target.style.display = "block";
  }

  // ===== 案件追加：スマホのみ「カメラ起動」／PCは「ファイルを選択」固定 =====
  const caseCameraBtn = document.getElementById("case-camera-btn");
  if (caseCameraBtn) {
    if (canUseCamera()) {
      // スマホ：カメラ起動（QR/PDF417 限定）
      caseCameraBtn.style.display = "inline-block";
      caseCameraBtn.textContent = "カメラ起動";
      caseCameraBtn.onclick = () => {
        startScanning([Html5QrcodeSupportedFormats.QR_CODE, Html5QrcodeSupportedFormats.PDF_417], "case-barcode");
      };
    } else {
      // PC：カメラは起動しない → 「ファイルを選択」ボタン（QR/PDF417 のみ）
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
        fi.accept = "image/*"; // ★画像のみ（PDFは非対応）
        fi.capture = "environment";
        fi.onchange = e => {
          const f = e.target.files && e.target.files[0];
          if (f) scanFileForInputStrict(f, "case-barcode", { allowedFormats: ["QR_CODE","PDF_417"], postprocess: "QR" });
        };
        fi.click();
      };
    }
  }

  // ===== ログイン関連（存在チェックつきで安全化） =====
  if (loginBtn) loginBtn.onclick = async () => {
    const email = (emailInput?.value || "").trim();
    const password = passwordInput?.value || "";
    loginErrorEl && (loginErrorEl.textContent = "");
    clearLoginTime();
    try {
      await auth.signInWithEmailAndPassword(email, password);
      markLoginTime();
    } catch (e) {
      const msg = `ログインに失敗しました（${e.code || "no-code"}）: ${e.message}`;
      console.error("[LOGIN ERROR]", e);
      loginErrorEl && (loginErrorEl.textContent = msg);
      alert(msg);
    }
  };
  if (signupBtn) signupBtn.onclick = () => {
    loginView && (loginView.style.display = "none");
    signupView && (signupView.style.display = "block");
    signupEmail && (signupEmail.value = (emailInput?.value || "").trim());
    signupPassword && (signupPassword.value = "");
    signupConfirmPassword && (signupConfirmPassword.value = "");
    signupErrorEl && (signupErrorEl.textContent = "");
  };
  if (guestBtn) guestBtn.onclick = () => {
    auth.signInAnonymously().catch(e => { loginErrorEl && (loginErrorEl.textContent = e.message); });
  };
  if (resetBtn) resetBtn.onclick = () => {
    const email = (emailInput?.value || "").trim();
    auth.sendPasswordResetEmail(email)
      .then(() => { loginErrorEl && (loginErrorEl.textContent = "再発行メール送信"); })
      .catch(e  => { loginErrorEl && (loginErrorEl.textContent = e.message); });
  };
  if (logoutBtn) logoutBtn.onclick = async () => {
    try { await auth.signOut(); } catch (e) { console.error("サインアウトエラー:", e); }
    emailInput && (emailInput.value = "");
    passwordInput && (passwordInput.value = "");
    clearLoginTime();
    localStorage.clear();
  };

  // ===== 新規登録 =====
  if (signupConfirmBtn) signupConfirmBtn.onclick = async () => {
    const email = (signupEmail?.value || "").trim();
    const pass  = signupPassword?.value || "";
    const pass2 = signupConfirmPassword?.value || "";
    signupErrorEl && (signupErrorEl.textContent = "");
    if (!email || !pass || !pass2) { signupErrorEl && (signupErrorEl.textContent = "全て入力してください"); return; }
    if (pass !== pass2)            { signupErrorEl && (signupErrorEl.textContent = "パスワードが一致しません"); return; }
    try {
      await auth.createUserWithEmailAndPassword(email, pass);
      markLoginTime();
    } catch (e) {
      signupErrorEl && (signupErrorEl.textContent = e.message);
    }
  };
  if (backToLoginBtn) backToLoginBtn.onclick = () => {
    signupView && (signupView.style.display = "none");
    loginView  && (loginView.style.display  = "block");
    signupErrorEl && (signupErrorEl.textContent = "");
    loginErrorEl  && (loginErrorEl.textContent  = "");
  };

  // ===== ナビ（案件追加／検索） =====
  if (navAddBtn) navAddBtn.addEventListener("click", () => { showView("add-case-view"); initAddCaseView(); });
  if (navSearchBtn) navSearchBtn.addEventListener("click", () => {
    showView("search-view");
    searchInput    && (searchInput.value = "");
    startDateInput && (startDateInput.value = "");
    endDateInput   && (endDateInput.value   = "");
    searchAll();
  });

  // ===== 案件追加：QR欄 IME無効 & Enter で展開 =====
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
      detailOrderId  && (detailOrderId.textContent  = matches[0] || "");
      detailCustomer && (detailCustomer.textContent = matches[1] || "");
      detailTitle    && (detailTitle.textContent    = matches[2] || "");
      scanModeDiv    && (scanModeDiv.style.display  = "none");
      caseDetailsDiv && (caseDetailsDiv.style.display = "block");
    });
  }

  // ===== 手動入力切替 =====
  if (startManualBtn) startManualBtn.onclick = () => { scanModeDiv && (scanModeDiv.style.display = "none"); manualModeDiv && (manualModeDiv.style.display = "block"); };
  if (startScanBtn)   startScanBtn.onclick   = () => { manualModeDiv && (manualModeDiv.style.display = "none"); scanModeDiv && (scanModeDiv.style.display   = "block"); };
  if (manualConfirmBtn) manualConfirmBtn.onclick = () => {
    if (!manualOrderIdInput?.value || !manualCustomerInput?.value || !manualTitleInput?.value) { alert("必須項目を入力してください"); return; }
    detailOrderId  && (detailOrderId.textContent  = manualOrderIdInput.value.trim());
    detailCustomer && (detailCustomer.textContent = manualCustomerInput.value.trim());
    detailTitle    && (detailTitle.textContent    = manualTitleInput.value.trim());
    manualModeDiv  && (manualModeDiv.style.display = "none");
    caseDetailsDiv && (caseDetailsDiv.style.display = "block");
  };

  // ===== 追跡行：生成（スマホ=カメラ、PC=ファイル）※QRは読ませない =====
  function createTrackingRow(context = "add") {
    const row = document.createElement("div");
    row.className = "tracking-row";

    // 運送会社 select
    const needSelect = (context === "add" && !fixedCarrierCheckbox?.checked) ||
                       (context === "detail" && !fixedCarrierCheckboxDetail?.checked);
    if (needSelect) {
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

    // 追跡番号 input
    const inp = document.createElement("input");
    inp.type = "text";
    inp.placeholder = "追跡番号を入力してください";
    inp.inputMode = "numeric";
    const uniqueId = `tracking-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    inp.id = uniqueId;

    // 数字のみ
    inp.addEventListener("input", e => e.target.value = e.target.value.replace(/\D/g, ""));

    // Enter/Tab → 次 or 行追加
    inp.addEventListener("keydown", e => {
      if (e.key !== "Enter" && e.key !== "Tab") return;
      e.preventDefault();
      const inputs = Array.from(row.parentElement.querySelectorAll('input[type="text"]'));
      const countBefore = inputs.length;
      const idx = inputs.indexOf(inp);
      if (idx !== -1 && idx < countBefore - 1) {
        inputs[idx + 1].focus();
      } else {
        if (context === "detail") detailAddRowBtn?.click();
        else                      addTrackingRowBtn?.click();
        setTimeout(() => {
          const newInputs = Array.from(row.parentElement.querySelectorAll('input[type="text"]'));
          if (newInputs[countBefore]) newInputs[countBefore].focus();
        }, 0);
      }
    });

    row.appendChild(inp);

    // スマホ：カメラ起動（CODABAR 限定 = QR は弾く）
    if (canUseCamera()) {
      const camBtn = document.createElement("button");
      camBtn.type = "button";
      camBtn.textContent = "カメラ起動";
      camBtn.className = "camera-btn";
      camBtn.addEventListener("click", () => {
        // ★ここで CODABAR 限定にすることで、QR は絶対に読み取らない
        startScanning([Html5QrcodeSupportedFormats.CODABAR], uniqueId);
      });
      row.appendChild(camBtn);
    } else {
      // PC：カメラは起動しない → 「ファイルを選択」（CODABAR 限定）
      const fileBtn = document.createElement("button");
      fileBtn.type = "button";
      fileBtn.textContent = "ファイルを選択";
      fileBtn.className = "camera-btn";
      fileBtn.addEventListener("click", () => {
        const fi = document.createElement("input");
        fi.type = "file";
        fi.accept = "image/*"; // ★画像のみ
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
      if (tnVal && !carrierVal) row.classList.add("missing-carrier"); else row.classList.remove("missing-carrier");
    }
    inp.addEventListener("input", updateMissingHighlight);
    row.querySelector("select")?.addEventListener("change", updateMissingHighlight);

    return row;
  }

  // ===== 詳細：固定キャリア ON/OFF 反映 =====
  if (fixedCarrierCheckboxDetail) {
    fixedCarrierCheckboxDetail.onchange = () => {
      fixedCarrierSelectDetail && (fixedCarrierSelectDetail.style.display = fixedCarrierCheckboxDetail.checked ? "inline-block" : "none");
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

  // ===== 初期化：案件追加ビュー =====
  function initAddCaseView() {
    scanModeDiv    && (scanModeDiv.style.display    = "block");
    manualModeDiv  && (manualModeDiv.style.display  = "none");
    caseDetailsDiv && (caseDetailsDiv.style.display = "none");

    const cb = document.getElementById("case-barcode");
    cb && (cb.value = "");
    manualOrderIdInput  && (manualOrderIdInput.value  = "");
    manualCustomerInput && (manualCustomerInput.value = "");
    manualTitleInput    && (manualTitleInput.value    = "");
    addCaseMsg          && (addCaseMsg.textContent    = "");

    if (fixedCarrierCheckbox) fixedCarrierCheckbox.checked = false;
    if (fixedCarrierSelect) { fixedCarrierSelect.style.display = "none"; fixedCarrierSelect.value = ""; }

    trackingRows && (trackingRows.innerHTML = "");
    for (let i = 0; i < 10; i++) trackingRows?.appendChild(createTrackingRow());
  }

  // ===== 追跡行：追加／固定キャリア切替 =====
  if (addTrackingRowBtn) addTrackingRowBtn.onclick = () => { for (let i = 0; i < 10; i++) trackingRows?.appendChild(createTrackingRow()); };
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

  // ===== 登録（案件＋追跡番号群） =====
  if (confirmAddCaseBtn) confirmAddCaseBtn.onclick = async () => {
    const orderId  = (detailOrderId?.textContent || "").trim();
    const customer = (detailCustomer?.textContent || "").trim();
    const title    = (detailTitle?.textContent || "").trim();
    if (!orderId || !customer || !title) { addCaseMsg && (addCaseMsg.textContent = "情報不足"); return; }

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

    if (missingCarrier) { addCaseMsg && (addCaseMsg.textContent = "運送会社を選択してください"); return; }
    if (items.length === 0) { alert("新規追跡なし"); return; }

    await db.ref(`cases/${orderId}`).set({ 注番: orderId, 得意先: customer, 品名: title, createdAt: Date.now() });
    for (const it of items) {
      await db.ref(`shipments/${orderId}`).push({ carrier: it.carrier, tracking: it.tracking, createdAt: Date.now() });
    }

    addCaseMsg && (addCaseMsg.textContent = "登録完了");
    await showCaseDetail(orderId, { 得意先: customer, 品名: title });
  };

  // ===== 別案件追加ボタン =====
  if (anotherCaseBtn)  anotherCaseBtn.onclick  = () => { showView("add-case-view"); initAddCaseView(); };
  if (anotherCaseBtn2) anotherCaseBtn2.onclick = () => { showView("add-case-view"); initAddCaseView(); };

  // ===== 検索画面 =====
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

    deleteSelectedBtn && (deleteSelectedBtn.style.display = isAdmin ? "block" : "none");
    selectAllContainer && (selectAllContainer.style.display = isAdmin ? "block" : "none");
    selectAllCheckbox && (selectAllCheckbox.checked = false);

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

  if (searchBtn) searchBtn.onclick = () => {
    const kw = (searchInput?.value || "").trim();
    const hasKw = kw.length > 0;
    const hasPeriod = (startDateInput?.value || "") || (endDateInput?.value || "");
    showView("search-view");
    if (hasKw && hasPeriod) {
      searchInput    && (searchInput.value = "");
      startDateInput && (startDateInput.value = "");
      endDateInput   && (endDateInput.value   = "");
      searchAll();
    } else {
      searchAll(kw);
    }
  };
  if (listAllBtn) listAllBtn.onclick = () => {
    searchInput    && (searchInput.value    = "");
    startDateInput && (startDateInput.value = "");
    endDateInput   && (endDateInput.value   = "");
    showView("search-view");
    searchAll();
  };

  // ===== 検索：選択削除（管理者） =====
  if (deleteSelectedBtn) deleteSelectedBtn.onclick = async () => {
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

  // ===== 詳細：表示＋ステータス取得 =====
  async function showCaseDetail(orderId, obj) {
    showView("case-detail-view");
    detailInfoDiv && (detailInfoDiv.innerHTML = `<div>受注番号: ${orderId}</div><div>得意先: ${obj.得意先 || ""}</div><div>品名: ${obj.品名 || ""}</div>`);
    detailShipmentsUl && (detailShipmentsUl.innerHTML = "");
    currentOrderId = orderId;
    addTrackingDetail && (addTrackingDetail.style.display = "none");
    detailTrackingRows && (detailTrackingRows.innerHTML = "");
    detailAddMsg && (detailAddMsg.textContent = "");
    detailAddRowBtn && (detailAddRowBtn.disabled = false);
    confirmDetailAddBtn && (confirmDetailAddBtn.disabled = false);
    cancelDetailAddBtn && (cancelDetailAddBtn.disabled = false);

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
  window.showCaseDetail = showCaseDetail; // 他関数から呼べるように

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

  // ===== 追跡番号追加UI =====
  if (showAddTrackingBtn) showAddTrackingBtn.onclick = () => {
    addTrackingDetail && (addTrackingDetail.style.display = "block");
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
    addTrackingDetail && (addTrackingDetail.style.display = "none");
    detailTrackingRows && (detailTrackingRows.innerHTML = "");
    detailAddMsg && (detailAddMsg.textContent = "");
    showAddTrackingBtn && (showAddTrackingBtn.style.display = "inline-block");
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

    if (missingCarrier) { detailAddMsg && (detailAddMsg.textContent = "運送会社を選択してください"); return; }
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

    addTrackingDetail && (addTrackingDetail.style.display = "none");
    detailTrackingRows && (detailTrackingRows.innerHTML = "");
    showAddTrackingBtn && (showAddTrackingBtn.style.display = "inline-block");
    detailAddMsg && (detailAddMsg.textContent = "追加しました");

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

  // ===== 初期表示：現在の認証状態で画面を整える =====
  const user = auth.currentUser;
  if (user) {
    loginView && (loginView.style.display = "none");
    signupView && (signupView.style.display = "none");
    mainView   && (mainView.style.display   = "block");
    showView("add-case-view");
    initAddCaseView();
    startSessionTimer();
  } else {
    loginView && (loginView.style.display = "block");
    signupView && (signupView.style.display = "none");
    mainView   && (mainView.style.display   = "none");
  }
});

// ================================================================
// 認証状態監視（画面切替）
// ================================================================
auth.onAuthStateChanged(async user => {
  const statusContainer = document.getElementById("login-status-container");
  statusContainer && (statusContainer.textContent = "");

  if (user) {
    // 管理者判定
    try {
      const snap = await db.ref(`admins/${user.uid}`).once("value");
      isAdmin = snap.val() === true;
    } catch (e) {
      console.error("管理者判定エラー:", e);
      isAdmin = false;
    }

    document.getElementById("login-view")  && (document.getElementById("login-view").style.display  = "none");
    document.getElementById("signup-view") && (document.getElementById("signup-view").style.display = "none");
    document.getElementById("main-view")   && (document.getElementById("main-view").style.display   = "block");

    statusContainer && (statusContainer.textContent = `${user.email || "ログイン中"} でログイン中`);

    // 初期は案件追加画面
    const showView = (id) => {
      document.querySelectorAll(".subview").forEach(el => el.style.display = "none");
      const target = document.getElementById(id);
      if (target) target.style.display = "block";
    };
    showView("add-case-view");

    // 初期化（DOM 側関数に依存）
    if (typeof window.initAddCaseView === "function") {
      window.initAddCaseView();
    } else {
      // DOMContentLoaded 内の initAddCaseView はスコープ内関数なので再実装
      const trackingRows = document.getElementById("tracking-rows");
      if (trackingRows) trackingRows.innerHTML = "";
    }

    startSessionTimer();

    const delBtn = document.getElementById("delete-selected-btn");
    delBtn && (delBtn.style.display = isAdmin ? "block" : "none");
  } else {
    isAdmin = false;
    document.getElementById("login-view")  && (document.getElementById("login-view").style.display  = "block");
    document.getElementById("signup-view") && (document.getElementById("signup-view").style.display = "none");
    document.getElementById("main-view")   && (document.getElementById("main-view").style.display   = "none");
    clearLoginTime();
    statusContainer && (statusContainer.textContent = "ログインしてください");
  }
});
