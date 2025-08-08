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

// キャリア表示ラベル
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
  // 飛騨運輸は個別番号をURLに付けない
  hida:    "http://www.hida-unyu.co.jp/WP_HIDAUNYU_WKSHO_GUEST/KW_UD04015.do?_Action_=a_srcAction",
  sagawa:  "https://k2k.sagawa-exp.co.jp/p/web/okurijosearch.do?okurijoNo="
};

// ================================================================
//  カメラ／ファイル読み取り（html5-qrcode）
// ================================================================

// モバイル端末判定（スマホ・タブレット）
function isMobileDevice() {
  const ua = navigator.userAgent || navigator.vendor || window.opera;
  return /android|iPad|iPhone|iPod/i.test(ua);
}

// カメラが使えるか（スマホ＋getUserMedia）
function canUseCamera() {
  return isMobileDevice() &&
         !!(navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === "function");
}

// --- ファイルから厳格に読み取り（allowedFormats: ["QR_CODE"] など） ---
// postprocess: "QR" なら (formatName==="QR_CODE" の場合のみ) ZLIB64展開
//              "CODABAR" なら 先頭末尾 A/B/C/D 除去
async function scanFileForInputStrict(file, inputId, {
  allowedFormats = null,   // 例: ["QR_CODE","PDF_417"] / ["CODABAR"]
  postprocess = null       // "QR" / "CODABAR" / null
} = {}) {
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
    // true で詳細結果（formatName 等）を取得
    const res = await scanner.scanFile(file, true);
    const decodedRaw = typeof res === "string" ? res : res.decodedText;
    const formatName = (res && res.result && res.result.format && res.result.format.formatName)
      ? res.result.format.formatName : null;

    if (!decodedRaw) throw new Error("デコード結果なし");

    // 許可フォーマット厳格チェック（formatName が取れない環境ではスキップ）
    if (allowedFormats && formatName && !allowedFormats.includes(formatName)) {
      alert(`この画面では ${allowedFormats.join(" / ")} のみ対応です（選択は ${formatName || "不明"}）。`);
      return;
    }

    let decoded = decodedRaw;

    if (postprocess === "QR" && formatName === "QR_CODE") {
      // QR のときだけ ZLIB64 展開
      if (decoded.startsWith("ZLIB64:")) {
        const b64 = decoded.slice(7);
        const bin = atob(b64);
        const arr = new Uint8Array([...bin].map(c => c.charCodeAt(0)));
        const dec = pako.inflate(arr);
        decoded = new TextDecoder().decode(dec).trim().replace(/「[^」]*」/g, "");
      }
    } else if (postprocess === "CODABAR") {
      // CODABAR：先頭/末尾 A/B/C/D を除去
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

// ミリメートル→ピクセル（プレビューの外枠計算）
function mmToPx(mm) { return mm * (96 / 25.4); }

// --- レンズ選択：広角(次に倍率が高い) → 超広角(最小倍率) → その他
//     判別不能時は「末尾から二番目」→「先頭」でフォールバック
async function choosePreferredBackCameraId() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const backs = devices.filter(d => d.kind === "videoinput" && /back|rear|environment/i.test(d.label));
    if (backs.length === 0) return null;

    const norm = s => (s || "").toLowerCase();

    // 「超広角」を先に除外したうえで「広角」を最優先
    const ultraIndex = backs.findIndex(d => {
      const l = norm(d.label);
      return /ultra[\s-]?wide|超広角|^0\.5x$| 0\.5x|0\.5x|0,5x/.test(l) || (l.includes("ultra") && l.includes("wide"));
    });

    const wideIndex = backs.findIndex(d => {
      const l = norm(d.label);
      // ultra を含む "ultra-wide" は除外し、1x / wide / wide-angle / 標準 などを拾う
      return !l.includes("ultra") && (/\bwide(?!-?macro)\b/.test(l) || /\bwide-?angle\b/.test(l) || /\b1(\.0)?x\b/.test(l) || l.includes("標準"));
    });

    // 今回の仕様：最初に広角を狙う
    if (wideIndex !== -1) return backs[wideIndex].deviceId;
    // 広角が無ければ超広角
    if (ultraIndex !== -1) return backs[ultraIndex].deviceId;

    // どれでもない場合：末尾から二番目（比較的広角寄りのことが多い）→1本だけならそれ
    if (backs.length >= 2) return backs[backs.length - 2].deviceId;
    return backs[0].deviceId;
  } catch (e) {
    console.warn("カメラ列挙失敗:", e);
    return null;
  }
}

// html5-qrcode ランタイム
let html5QrCode = null;
let scanningInputId = null;
let currentFormats = null; // 今のスキャン対象フォーマット（QR or CODABAR）
let torchOn = false;

// --- カメラ起動（スマホのみ）。案件追加は QR/PDF417、追跡は CODABAR を想定
async function startScanning(formats, inputId) {
  if (!canUseCamera()) {
    alert("このデバイスではカメラ機能は使用できません（スマホのみ）");
    return;
  }
  // 二重起動回避
  if (html5QrCode) {
    try { await html5QrCode.stop(); html5QrCode.clear(); } catch (_) {}
    html5QrCode = null;
  }
  scanningInputId = inputId;
  currentFormats  = formats;

  // オーバーレイ 9:16
  const margin = mmToPx(5) * 2;
  const vw = window.innerWidth, vh = window.innerHeight, ratio = 9/16;
  let w = vw - margin, h = vh - margin;
  if (w / h > ratio) w = h * ratio; else h = w / ratio;
  const sc = document.getElementById("scanner-container");
  if (sc) { sc.style.width = `${w}px`; sc.style.height = `${h}px`; }
  const overlay = document.getElementById("scanner-overlay");
  if (overlay) { overlay.style.display = "flex"; document.body.style.overflow = "hidden"; }

  html5QrCode = new Html5Qrcode("video-container", false);

  // ★ここでレンズ選択：広角優先→超広角→フォールバック
  const deviceId = await choosePreferredBackCameraId();
  const constraints = deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { exact: "environment" } };

  const config = {
    fps: 10,
    formatsToSupport: formats, // 例) [Html5QrcodeSupportedFormats.QR_CODE, Html5QrcodeSupportedFormats.PDF_417]
    experimentalFeatures: { useBarCodeDetectorIfSupported: true },
    useBarCodeDetectorIfSupported: true
  };

  // 成功時：第二引数 decodedResult から formatName を取得
  const onDecode = (decodedRaw, decodedResult) => {
    const inputEl = document.getElementById(scanningInputId);
    if (!inputEl) { stopScanning(); return; }
    try {
      const formatName = decodedResult?.result?.format?.formatName || null;
      let decoded = decodedRaw || "";

      if (formatName === "CODABAR") {
        // CODABAR：先頭/末尾 A/B/C/D を削除
        if (decoded.length >= 2) {
          const pre = decoded[0], suf = decoded[decoded.length - 1];
          if (/[ABCD]/i.test(pre) && /[ABCD]/i.test(suf)) {
            decoded = decoded.substring(1, decoded.length - 1);
          }
        }
      } else if (formatName === "QR_CODE") {
        // QR：案件追加の可能性が高いので ZLIB64 展開に対応
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
    // ★ズーム最小（端末対応時）
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

  // ▼プレビュー下の「ファイルを読み込み」ボタン（毎回ハンドラ更新）
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
    container.appendChild(importBtn);
  }
  importBtn.onclick = () => {
    const fi = document.createElement("input");
    fi.type = "file";
    fi.accept = "image/*";
    fi.capture = "environment";
    fi.onchange = e => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;

      // 現在のスキャン文脈に応じて許容フォーマットを切替
      if (currentFormats.some(fm => fm === Html5QrcodeSupportedFormats.QR_CODE || fm === Html5QrcodeSupportedFormats.PDF_417)) {
        // 案件追加：QR と PDF417 を許可（QR の時だけ ZLIB64 展開）
        scanFileForInputStrict(f, scanningInputId, { allowedFormats: ["QR_CODE","PDF_417"], postprocess: "QR" });
      } else {
        // 追跡番号：CODABAR 限定
        scanFileForInputStrict(f, scanningInputId, { allowedFormats: ["CODABAR"], postprocess: "CODABAR" });
      }
      stopScanning();
    };
    fi.click();
  };

  // プレビュータップで AF（端末依存）
  const videoContainer = document.getElementById("video-container");
  if (videoContainer) {
    videoContainer.addEventListener("click", async () => {
      try { await html5QrCode.applyVideoConstraints({ advanced: [{ focusMode: "single-shot" }] }); } catch (_) {}
    });
  }
}

  scanningInputId = inputId;
  currentFormats  = formats;

  // オーバーレイ（9:16枠、上下左右 5mm 余白）
  const margin = mmToPx(5) * 2;
  const vw = window.innerWidth, vh = window.innerHeight, ratio = 9 / 16;
  let w = vw - margin, h = vh - margin;
  if (w / h > ratio) w = h * ratio; else h = w / ratio;
  const sc = document.getElementById("scanner-container");
  if (sc) { sc.style.width = `${w}px`; sc.style.height = `${h}px`; }
  const overlay = document.getElementById("scanner-overlay");
  if (overlay) { overlay.style.display = "flex"; document.body.style.overflow = "hidden"; }

  // 初期化
  html5QrCode = new Html5Qrcode("video-container", false);

  // レンズ選択（最小倍率優先のヒューリスティック）
  const deviceId = await choosePreferredBackCameraId();
  const constraints = deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { exact: "environment" } };

  const config = {
    fps: 10,
    formatsToSupport: formats, // 例： [Html5QrcodeSupportedFormats.QR_CODE] / [Html5QrcodeSupportedFormats.CODABAR]
    experimentalFeatures: { useBarCodeDetectorIfSupported: true },
    useBarCodeDetectorIfSupported: true
  };

  const onDecode = decoded => {
    const inputEl = document.getElementById(scanningInputId);
    if (!inputEl) { stopScanning(); return; }
    try {
      let out = decoded || "";

      if (currentFormats && currentFormats.length === 1 &&
          currentFormats[0] === Html5QrcodeSupportedFormats.CODABAR) {
        // CODABAR：先頭末尾 A/B/C/D を削除
        if (out.length >= 2) {
          const pre = out[0], suf = out[out.length - 1];
          if (/[ABCD]/i.test(pre) && /[ABCD]/i.test(suf)) out = out.substring(1, out.length - 1);
        }
      } else {
        // QR：ZLIB64展開
        if (out.startsWith("ZLIB64:")) {
          const b64 = out.slice(7);
          const bin = atob(b64);
          const arr = new Uint8Array([...bin].map(c => c.charCodeAt(0)));
          const dec = pako.inflate(arr);
          out = new TextDecoder().decode(dec).trim().replace(/「[^」]*」/g, "");
        }
      }

      inputEl.value = out;
      inputEl.dispatchEvent(new Event("input", { bubbles: true }));
      inputEl.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      stopScanning();
    } catch (e) {
      console.error("デコード後処理に失敗:", e);
      stopScanning();
    }
  };

  try {
    await html5QrCode.start(constraints, config, onDecode, () => {});
    // ズーム能力があるなら最小ズーム（=最小倍率・最広角）に寄せる
    try {
      const track = html5QrCode.getRunningTrack();
      const caps = track.getCapabilities?.();
      if (caps && typeof caps.zoom !== "undefined") {
        const min = caps.zoom.min ?? caps.zoom?.min ?? 1;
        const step = caps.zoom.step ?? 0;
        const next = step ? Math.min(min + step, caps.zoom.max ?? min) : min;
        // ここで「最小か次に大きい」どちらか。最小を基準に適用（必要なら next に変更）
        await html5QrCode.applyVideoConstraints({ advanced: [{ zoom: min }] });
      }
    } catch (_) {}
  } catch (e) {
    console.error("カメラ起動失敗:", e);
    alert("カメラ起動に失敗しました");
    stopScanning();
  }

  // プレビュー下に「ファイルを読み込み」ボタンを設置（毎回再生成しないように一度だけ）
  const scn = document.getElementById("scanner-container");
  if (scn && !document.getElementById("overlay-file-import-btn")) {
    const importBtn = document.createElement("button");
    importBtn.id = "overlay-file-import-btn";
    importBtn.className = "overlay-btn";
    importBtn.style.top = "auto";
    importBtn.style.bottom = "12px";
    importBtn.style.left = "12px";
    importBtn.textContent = "ファイルを読み込み";
    scn.appendChild(importBtn);

    importBtn.addEventListener("click", () => {
      const fi = document.createElement("input");
      fi.type = "file";
      fi.accept = "image/*";          // 撮影画像を想定
      fi.capture = "environment";     // 背面カメラでの撮影を促す（対応端末のみ）
      fi.onchange = e => {
        const f = e.target.files && e.target.files[0];
        if (!f) return;
        // ライブスキャンは止めてからファイルスキャン
        const isQR = currentFormats && currentFormats[0] === Html5QrcodeSupportedFormats.QR_CODE;
        const isCodabar = currentFormats && currentFormats[0] === Html5QrcodeSupportedFormats.CODABAR;
        // QR限定 or CODABAR限定 で厳格に読み込む
        scanFileForInputStrict(f, scanningInputId, { forQR: !!isQR, forCodabar: !!isCodabar });
        // オーバーレイは任意で閉じる（ここでは残してもOKだが、一旦閉じる）
        stopScanning();
      };
      fi.click();
    });
  }

  // プレビュー領域タップでAF（端末対応次第）
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

// ライト ON/OFF
async function toggleTorch() {
  if (!html5QrCode) return;
  try {
    const settings = html5QrCode.getRunningTrackSettings();
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

// DOMContentLoaded 内の案件追加ボタン初期化部分を置換
window.addEventListener("DOMContentLoaded", () => {
  document.getElementById("close-button")?.addEventListener("click", stopScanning);
  document.getElementById("torch-button")?.addEventListener("click", toggleTorch);

  // 案件追加：QR/PDF417
  const caseCameraBtn = document.getElementById("case-camera-btn");
  if (caseCameraBtn) {
    if (canUseCamera()) {
      // スマホ：カメラ起動表示（QR/PDF417）
      caseCameraBtn.style.display = "inline-block";
      caseCameraBtn.textContent = "カメラ起動";
      caseCameraBtn.onclick = () => {
        startScanning([Html5QrcodeSupportedFormats.QR_CODE, Html5QrcodeSupportedFormats.PDF_417], "case-barcode");
      };
    } else {
      // PC：カメラボタン非表示、代わりに「ファイルを選択」を常に表示（QR/PDF417）
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
        fi.accept = "*/*";            // すべて表示（要望）
        fi.capture = "environment";   // PCでは効果なし
        fi.onchange = e => {
          const f = e.target.files && e.target.files[0];
          if (f) scanFileForInputStrict(f, "case-barcode", { allowedFormats: ["QR_CODE","PDF_417"], postprocess: "QR" });
        };
        fi.click();
      };
    }
  }
});

// ================================================================
//  以降：アプリ本体（認証・画面遷移・CRUD・検索・詳細 など）
// ================================================================

let isAdmin = false;
let sessionTimer = null;
let currentOrderId = null;

// --- DOM取得（ログイン／メイン） ---
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

// --- DOM取得（新規登録） ---
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

// 管理者用 全選択
const selectAllContainer = document.getElementById("select-all-container");
const selectAllCheckbox  = document.getElementById("select-all-checkbox");
if (selectAllCheckbox) {
  selectAllCheckbox.onchange = () => {
    const boxes = searchResults.querySelectorAll(".select-case-checkbox");
    boxes.forEach(cb => cb.checked = selectAllCheckbox.checked);
  };
}

// --- DOM取得（詳細ビュー） ---
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

function clearLoginTime() { localStorage.removeItem("loginTime"); }
function markLoginTime()  { localStorage.setItem("loginTime", Date.now().toString()); }
function isSessionExpired() {
  const t = parseInt(localStorage.getItem("loginTime") || "0", 10);
  return Date.now() - t > SESSION_LIMIT_MS;
}
// 期限切れなら即サインアウト
if (isSessionExpired()) {
  auth.signOut().catch(err => console.warn("期限切れサインアウト失敗:", err));
  clearLoginTime();
}

// 操作時にタイマー＆loginTime更新
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
//  画面遷移
// ================================================================
function showView(id) {
  document.querySelectorAll(".subview").forEach(el => el.style.display = "none");
  const target = document.getElementById(id);
  if (target) target.style.display = "block";
}

// ================================================================
//  認証監視
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
    if (mainView)   mainView.style.display   = "block";

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
    if (loginView) loginView.style.display = "block";
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
    // onAuthStateChanged でメインへ
  } catch (e) {
    signupErrorEl.textContent = e.message;
  }
};
// 新規登録→ログインへ戻る
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
  searchInput.value = "";
  startDateInput.value = "";
  endDateInput.value   = "";
  searchAll();
});

// ================================================================
//  追跡行（入力欄＋カメラ/ファイルボタン）
//   - スマホのみ「カメラ起動」ボタンを表示（ライブスキャン：CODABAR）
//   - PC等は「ファイルを選択」（CODABARだけを厳格）
// ================================================================
function createTrackingRow(context = "add") {
  const row = document.createElement("div");
  row.className = "tracking-row";

  // 運送会社 select
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
      if (context === "detail") detailAddRowBtn.click();
      else addTrackingRowBtn.click();
      setTimeout(() => {
        const newInputs = Array.from(row.parentElement.querySelectorAll('input[type="text"]'));
        if (newInputs[countBefore]) newInputs[countBefore].focus();
      }, 0);
    }
  });

  row.appendChild(inp);

  // スマホのみ「カメラ起動」表示（CODABARライブ）/ PCはファイル選択（CODABAR）
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
    // PC 等：ファイル選択（画像）→ CODABAR 限定で読み取り
    const fileBtn = document.createElement("button");
    fileBtn.type = "button";
    fileBtn.textContent = "ファイルを選択";
    fileBtn.className = "camera-btn";
    fileBtn.addEventListener("click", () => {
      const fi = document.createElement("input");
      fi.type = "file";
      fi.accept = "*/*";          // すべて表示（要望）
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
      carrierVal = fixedCarrierCheckbox.checked ? fixedCarrierSelect.value : row.querySelector("select")?.value;
    } else {
      carrierVal = fixedCarrierCheckboxDetail.checked ? fixedCarrierSelectDetail.value : row.querySelector("select")?.value;
    }
    if (tnVal && !carrierVal) row.classList.add("missing-carrier");
    else row.classList.remove("missing-carrier");
  }
  inp.addEventListener("input", updateMissingHighlight);
  row.querySelector("select")?.addEventListener("change", updateMissingHighlight);

  return row;
}

// ================================================================
//  詳細画面：一括運送会社固定のON/OFF反映
// ================================================================
if (fixedCarrierCheckboxDetail) {
  fixedCarrierCheckboxDetail.onchange = () => {
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
  };
}

// ================================================================
//  初期化：案件追加ビュー
// ================================================================
function initAddCaseView() {
  if (scanModeDiv) scanModeDiv.style.display = "block";
  if (manualModeDiv) manualModeDiv.style.display = "none";
  if (caseDetailsDiv) caseDetailsDiv.style.display = "none";

  document.getElementById("case-barcode").value = "";
  if (manualOrderIdInput) manualOrderIdInput.value = "";
  if (manualCustomerInput) manualCustomerInput.value = "";
  if (manualTitleInput) manualTitleInput.value = "";
  if (addCaseMsg) addCaseMsg.textContent = "";

  if (fixedCarrierCheckbox) fixedCarrierCheckbox.checked = false;
  if (fixedCarrierSelect) { fixedCarrierSelect.style.display = "none"; fixedCarrierSelect.value = ""; }

  if (trackingRows) {
    trackingRows.innerHTML = "";
    for (let i = 0; i < 10; i++) trackingRows.appendChild(createTrackingRow());
  }
}

// 追跡行 追加・固定キャリア切替
addTrackingRowBtn.onclick = () => {
  for (let i = 0; i < 10; i++) trackingRows.appendChild(createTrackingRow());
};
fixedCarrierCheckbox.onchange = () => {
  fixedCarrierSelect.style.display = fixedCarrierCheckbox.checked ? "block" : "none";
  Array.from(trackingRows.children).forEach(row => {
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

// IME無効（QR欄）
document.getElementById("case-barcode").addEventListener("compositionstart", e => e.preventDefault());

// QR→テキスト展開（案件追加） Enterで確定
document.getElementById("case-barcode").addEventListener("keydown", e => {
  if (e.key !== "Enter") return;
  const raw = e.target.value.trim();
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
  document.getElementById("detail-order-id").textContent  = matches[0] || "";
  document.getElementById("detail-customer").textContent = matches[1] || "";
  document.getElementById("detail-title").textContent    = matches[2] || "";
  if (scanModeDiv) scanModeDiv.style.display = "none";
  if (caseDetailsDiv) caseDetailsDiv.style.display = "block";
});

// 手動入力切替
startManualBtn.onclick = () => { if (scanModeDiv) scanModeDiv.style.display = "none"; if (manualModeDiv) manualModeDiv.style.display = "block"; };
startScanBtn.onclick   = () => { if (manualModeDiv) manualModeDiv.style.display = "none"; if (scanModeDiv)   scanModeDiv.style.display   = "block"; };
manualConfirmBtn.onclick = () => {
  if (!manualOrderIdInput.value || !manualCustomerInput.value || !manualTitleInput.value) { alert("必須項目を入力してください"); return; }
  document.getElementById("detail-order-id").textContent  = manualOrderIdInput.value.trim();
  document.getElementById("detail-customer").textContent = manualCustomerInput.value.trim();
  document.getElementById("detail-title").textContent    = manualTitleInput.value.trim();
  if (manualModeDiv) manualModeDiv.style.display = "none";
  if (caseDetailsDiv) caseDetailsDiv.style.display = "block";
};

// 登録（案件＋追跡番号群）
confirmAddCaseBtn.onclick = async () => {
  const orderId  = document.getElementById("detail-order-id").textContent.trim();
  const customer = document.getElementById("detail-customer").textContent.trim();
  const title    = document.getElementById("detail-title").textContent.trim();
  if (!orderId || !customer || !title) { addCaseMsg.textContent = "情報不足"; return; }

  const snap = await db.ref(`shipments/${orderId}`).once("value");
  const existObj = snap.val() || {};
  const existSet = new Set(Object.values(existObj).map(it => `${it.carrier}:${it.tracking}`));

  const items = [];
  let missingCarrier = false;

  Array.from(trackingRows.children).forEach(row => row.classList.remove("missing-carrier"));

  Array.from(trackingRows.children).forEach(row => {
    const tn = row.querySelector("input").value.trim();
    const carrier = fixedCarrierCheckbox.checked ? fixedCarrierSelect.value : row.querySelector("select")?.value;
    if (tn && !carrier) { missingCarrier = true; row.classList.add("missing-carrier"); }
    if (!tn || !carrier) return;

    const key = `${carrier}:${tn}`;
    if (existSet.has(key)) return;
    existSet.add(key);
    items.push({ carrier, tracking: tn });
  });

  if (missingCarrier) { addCaseMsg.textContent = "運送会社を選択してください"; return; }
  if (items.length === 0) { alert("新規追跡なし"); return; }

  await db.ref(`cases/${orderId}`).set({ 注番: orderId, 得意先: customer, 品名: title, createdAt: Date.now() });

  for (const it of items) {
    await db.ref(`shipments/${orderId}`).push({ carrier: it.carrier, tracking: it.tracking, createdAt: Date.now() });
  }

  addCaseMsg.textContent = "登録完了";
  await showCaseDetail(orderId, { 得意先: customer, 品名: title });
};

anotherCaseBtn.onclick  = () => { showView("add-case-view"); initAddCaseView(); };
anotherCaseBtn2.onclick = () => { showView("add-case-view"); initAddCaseView(); };

// ================================================================
//  検索
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
      if (e.target instanceof HTMLInputElement) return;
      showCaseDetail(item.orderId, item);
    };

    searchResults.appendChild(li);
  });

  deleteSelectedBtn.style.display = isAdmin ? "block" : "none";
  selectAllContainer.style.display = isAdmin ? "block" : "none";
  if (selectAllCheckbox) selectAllCheckbox.checked = false;

  const boxes = searchResults.querySelectorAll(".select-case-checkbox");
  boxes.forEach(cb => cb.onchange = updateSelectAllState);
  updateSelectAllState();
}
function updateSelectAllState() {
  if (!isAdmin) return;
  const boxes = searchResults.querySelectorAll(".select-case-checkbox");
  const checked = searchResults.querySelectorAll(".select-case-checkbox:checked");
  selectAllCheckbox.checked = (boxes.length > 0 && boxes.length === checked.length);
}

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
    searchInput.value = ""; startDateInput.value = ""; endDateInput.value = ""; searchAll();
  } else {
    searchAll(kw);
  }
};
listAllBtn.onclick = () => {
  searchInput.value = ""; startDateInput.value = ""; endDateInput.value = ""; showView("search-view"); searchAll();
};

// 選択削除（管理者）
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
//  詳細表示＋配送ステータス取得
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

// ステータス取得（Cloudflare Worker 経由）
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
    if (!carrier) { missingCarrier = true; row.classList.add("missing-carrier"); return; }
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

  addTrackingDetail.style.display = "none";
  detailTrackingRows.innerHTML = "";
  showAddTrackingBtn.style.display = "inline-block";
  detailAddMsg.textContent = "追加しました";

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
