/*
 * app.js
 *
 * このファイルは案件管理システムの中核ロジックを定義します。メールアドレスと
 * パスワードによる認証、新規ユーザー登録、データベースへの案件保存・取得、
 * 2 次元／1 次元バーコードの読み取り、暗号化処理、画面遷移などを
 * まとめています。UI は複数のセクション（ビュー）を持ち、状態に応じて
 * 表示・非表示を切り替えます。
 *
 * Firebase の初期化や管理者 UID の設定は firebase-config.js で行います。
 * データの暗号化には app.js 内で定義された固定の秘密鍵
 * `APP_ENCRYPTION_SECRET` が用いられ、ユーザーがパスフレーズを入力する
 * 必要はありません。
 */

// -----------------------------------------------------------------------------
// 設定
//
// 管理者として扱うユーザーの UID の一覧。ここに登録された UID を持つ
// ユーザーだけが案件を削除できます。実際の UID を公開リポジトリに
// コミットしないよう注意してください。
const ADMIN_UIDS = [];

// 全角を半角に変換する関数
function toHalfWidth(str) {
  return str.replace(/[！-～]/g, function(ch) {
    return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0);
  }).replace(/　/g, ' ');
}

// -----------------------------------------------------------------------------
// 自作追跡APIのURL
//
// Cloudflare Workers や Deno Deploy などにデプロイした追跡APIの
// エンドポイントを指定します。末尾にパス名やクエリを付けず、
// 例: "https://example.workers.dev/track" のように設定してください。
// 本プロジェクトでは track-api.hr46-ksg.workers.dev が利用されます。
window.TRACKING_API_URL = "https://track-api.hr46-ksg.workers.dev/track";

// -----------------------------------------------------------------------------
// グローバル状態
// 暗号化／復号に使用する固定の秘密文字列。安全のためご自身でランダムな
// 文字列に置き換えてください。ユーザーがパスフレーズを入力する必要はなく、
// Firestore への保存時に自動的に暗号化されます。
const APP_ENCRYPTION_SECRET = 'PLEASE_REPLACE_THIS_WITH_A_RANDOM_SECRET';
let currentUser = null;
let currentCaseData = null; // holds orderNumber, customer, product before saving
let currentShipments = [];   // holds shipments before saving

// 2 次元／1 次元バーコード読み取り用のインスタンス。カメラを何度も
// 初期化し直さないようにインスタンスを使い回します。
let html5Qr2d = null;
let html5Qr1d = null;

// ケース入力画面で手動モードかどうかを記録する。true の場合はスキャン用
// コンテナを非表示にし、「バーコード入力に切り替え」というボタン表示に
// 変更する。
let isManualCaseInputMode = false;

// デバイスがスマートフォンかどうかを簡易判定する。モバイル端末では
// カメラボタンを表示し、PC では隠すために使用する。
const IS_MOBILE = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

// 自動ログアウト用のタイマー
let autoLogoutTimer = null;

// -----------------------------------------------------------------------------
// ユーティリティ関数

/**
 * 指定されたビュー（section 要素）だけを表示し、それ以外を非表示にする。
 *
 * @param {string} viewId 表示するビューの ID
 */
function showView(viewId) {
  const views = document.querySelectorAll('.view');
  views.forEach(v => {
    if (v.id === viewId) {
      v.classList.remove('hidden');
    } else {
      v.classList.add('hidden');
    }
  });
}

/**
 * ステータスメッセージを特定の要素に表示する。
 *
 * @param {string} elementId メッセージを表示する要素の ID
 * @param {string} message 表示するメッセージ
 */
function setStatus(elementId, message) {
  const el = document.getElementById(elementId);
  if (el) {
    el.textContent = message;
  }
}

/**
 * 初期化処理。ボタンやフォームにイベントハンドラを登録し、認証状態の
 * 変化を監視します。ユーザーがログインすると一覧ビューを表示し、
 * ログアウトするとログインビューに戻ります。
 */
function init() {
  // ページ読み込み時に既存のログインセッションがある場合でもリセットする。
  // リロード時の自動ログアウトを実現するため、init の最初で signOut() を
  // 呼び出しておく。エラーは無視する。
  auth.signOut().catch(() => {});

  // Buttons in login view
  document.getElementById('loginButton').addEventListener('click', login);
  // ゲストログインボタンを追加。匿名認証を利用して一時的なアカウントを作成する。
  document.getElementById('guestButton').addEventListener('click', guestLogin);
  // Navigate to registration view
  document.getElementById('goToRegisterButton').addEventListener('click', () => {
    document.getElementById('regEmailInput').value = '';
    document.getElementById('regPasswordInput').value = '';
    document.getElementById('regConfirmInput').value = '';
    setStatus('registerStatus', '');
    showView('registerView');
  });

  // Buttons in case input view
  document.getElementById('scan2dButton').addEventListener('click', start2DScanner);
  document.getElementById('caseNextButton').addEventListener('click', goToShipments);
  document.getElementById('logoutButton').addEventListener('click', logout);

  // Buttons in shipments view
  document.getElementById('addMoreShipmentsButton').addEventListener('click', () => addShipmentsRows(5));
  document.getElementById('saveCaseButton').addEventListener('click', saveCase);
  document.getElementById('backToCaseButton').addEventListener('click', () => showView('caseInputView'));
  document.getElementById('carrierAllSelect').addEventListener('change', applyCarrierToAll);

  // Buttons in list view
  document.getElementById('refreshListButton').addEventListener('click', loadCasesList);
  document.getElementById('logoutButton2').addEventListener('click', logout);
  document.getElementById('searchInput').addEventListener('input', filterCaseList);

  // Buttons in details view
  document.getElementById('addMoreShipmentsDetailsButton').addEventListener('click', () => addShipmentInputsToDetails(5));
  document.getElementById('deleteCaseButton').addEventListener('click', deleteCurrentCase);
  document.getElementById('backToListButton').addEventListener('click', () => showView('listView'));

  // Buttons in register view
  document.getElementById('registerSubmitButton').addEventListener('click', createAccount);
  document.getElementById('cancelRegisterButton').addEventListener('click', () => {
    showView('loginView');
  });

  // メニュー画面のボタン
  document.getElementById('menuAddCaseButton').addEventListener('click', () => {
    // スタート用のバーコード入力画面に遷移する。必要な状態を初期化。
    currentCaseData = null;
    document.getElementById('barcodeInput').value = '';
    setStatus('startStatus', '');
    showView('addCaseStartView');
    // テキスト入力にフォーカスを当てる
    setTimeout(() => document.getElementById('barcodeInput').focus(), 0);
  });
  document.getElementById('menuSearchCaseButton').addEventListener('click', async () => {
    // 案件一覧ビューを表示し、最新データを読み込む
    showView('listView');
    await loadCasesList();
  });

  // 案件追加スタート画面のイベント
  document.getElementById('barcodeCameraButton').addEventListener('click', startStartScanner);
  document.getElementById('barcodeInput').addEventListener('keypress', handleBarcodeKeypress);

  // 手動入力ボタン：バーコードを使わずに案件入力画面へ遷移する
  document.getElementById('manualInputButton').addEventListener('click', () => {
    // カメラが起動していた場合は停止
    if (html5Qr2d) {
      html5Qr2d.stop().catch(() => {});
    }
    document.getElementById('startQrReader').classList.add('hidden');
    setStatus('startStatus', '手動入力モードに切り替えました');
    // バーコード入力欄をクリア
    document.getElementById('barcodeInput').value = '';
    // 次の画面を空欄で表示
    document.getElementById('orderNumberInput').value = '';
    document.getElementById('customerInput').value = '';
    document.getElementById('productInput').value = '';
    setStatus('caseStatus', '');
    showView('caseInputView');
    setTimeout(() => document.getElementById('orderNumberInput').focus(), 0);
    // 手動モードに切り替える
    isManualCaseInputMode = true;
    document.getElementById('scan2dContainer').style.display = 'none';
    const switchBtn = document.getElementById('switchInputModeButton');
    if (switchBtn) switchBtn.textContent = 'バーコード入力に切り替え';
  });

  // 入力モード切替ボタン
  document.getElementById('switchInputModeButton').addEventListener('click', () => {
    // トグル前の状態を保存
    const wasManual = isManualCaseInputMode;
    // トグル
    isManualCaseInputMode = !isManualCaseInputMode;
    if (isManualCaseInputMode) {
      // 手動モード: スキャンコンテナ非表示
      document.getElementById('scan2dContainer').style.display = 'none';
      document.getElementById('switchInputModeButton').textContent = 'バーコード入力に切り替え';
    } else {
      // バーコードモードに切り替えた場合はスタート画面に戻す
      // 現在のフォームをリセットし、バーコード入力画面に遷移
      document.getElementById('scan2dContainer').style.display = '';
      document.getElementById('switchInputModeButton').textContent = '手動入力に切り替え';
      // スタート画面へ戻る
      currentCaseData = null;
      currentShipments = [];
      document.getElementById('barcodeInput').value = '';
      setStatus('startStatus', '');
      showView('addCaseStartView');
      // フォーカスを設定
      setTimeout(() => document.getElementById('barcodeInput').focus(), 0);
    }
  });

  // メニューへ戻るボタン
  document.getElementById('backToMenuFromCaseButton').addEventListener('click', () => showView('menuView'));
  document.getElementById('backToMenuFromShipmentsButton').addEventListener('click', () => showView('menuView'));
  document.getElementById('backToMenuFromListButton').addEventListener('click', () => showView('menuView'));
  document.getElementById('backToMenuFromStartButton').addEventListener('click', () => showView('menuView'));

  // メニュー画面のログアウトボタン
  const logoutMenuBtn = document.getElementById('logoutButtonMenu');
  if (logoutMenuBtn) logoutMenuBtn.addEventListener('click', logout);

  // グローバルログアウトボタン（ヘッダー右上）
  const globalLogoutBtn = document.getElementById('globalLogoutButton');
  if (globalLogoutBtn) {
    globalLogoutBtn.addEventListener('click', logout);
  }

  // 半角変換: class="halfwidth" が付いた入力に対して全角→半角を実施
  document.addEventListener('input', (e) => {
    const target = e.target;
    if (target && target.classList && target.classList.contains('halfwidth')) {
      target.value = toHalfWidth(target.value);
    }
  });

  // PC ではカメラ関連のボタンを非表示にする
  if (!IS_MOBILE) {
    const hideIds = ['barcodeCameraButton', 'scan2dButton'];
    hideIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
    // カメラ列全体を非表示にする
    document.querySelectorAll('.camera-col').forEach(el => {
      el.style.display = 'none';
    });
  }

  // 自動ログアウトタイマーのリセットをユーザー操作に紐付ける
  function resetAutoLogoutTimer() {
    if (autoLogoutTimer) clearTimeout(autoLogoutTimer);
    // 30分（1800秒）で自動ログアウト
    autoLogoutTimer = setTimeout(() => {
      // タイマー発火時にログアウトする
      logout();
      alert('30分間操作がなかったためログアウトしました');
    }, 30 * 60 * 1000);
  }
  // イベント登録
  ['click', 'keypress', 'mousemove', 'touchstart'].forEach(ev => {
    document.addEventListener(ev, resetAutoLogoutTimer);
  });

  // Auth state observer
  auth.onAuthStateChanged(async user => {
    currentUser = user;
    if (user) {
      // ログイン直後はメニュー画面を表示し、自動ログアウトタイマーをセット
      showView('menuView');
      resetAutoLogoutTimer();
      // グローバルログアウトボタンを表示
      const globalLogout = document.getElementById('globalLogoutButton');
      if (globalLogout) globalLogout.classList.remove('hidden');
    } else {
      // Not logged in
      showView('loginView');
      // ログアウト時にはタイマーを停止
      if (autoLogoutTimer) clearTimeout(autoLogoutTimer);
      // グローバルログアウトボタンを非表示
      const globalLogout = document.getElementById('globalLogoutButton');
      if (globalLogout) globalLogout.classList.add('hidden');
    }
  });
}

// -----------------------------------------------------------------------------
// 認証関連の関数群

/**
 * メールアドレスとパスワードでログインする。暗号化に必要な秘密鍵は
 * コード内に固定されているため、ユーザーがパスフレーズを入力する必要はありません。
 */
async function login() {
  const email = document.getElementById('emailInput').value.trim();
  const pwd = document.getElementById('passwordInput').value;
  if (!email || !pwd) {
    setStatus('authStatus', 'メールとパスワードを入力してください');
    return;
  }
  setStatus('authStatus', 'ログイン中...');
  try {
    await auth.signInWithEmailAndPassword(email, pwd);
    setStatus('authStatus', '');
    // Auth observer will handle view change
  } catch (err) {
    setStatus('authStatus', 'ログイン失敗: ' + err.message);
  }
}

/**
 * 新規登録画面でアカウントを作成する。メールアドレス・パスワード・確認用
 * パスワードを受け取り、入力値がすべて揃っているか、パスワードと確認用
 * パスワードが一致しているかを検証する。一致しない場合はエラーメッセージを
 * 表示し、登録処理を行わない。成功すると自動的にログインした状態となり、
 * 一覧画面へ遷移します。
 */
async function createAccount() {
  const email = document.getElementById('regEmailInput').value.trim();
  const pwd = document.getElementById('regPasswordInput').value;
  const confirm = document.getElementById('regConfirmInput').value;
  if (!email || !pwd || !confirm) {
    setStatus('registerStatus', 'すべての項目を入力してください');
    return;
  }
  if (pwd !== confirm) {
    setStatus('registerStatus', 'パスワードと確認用パスワードが一致しません');
    return;
  }
  setStatus('registerStatus', '登録中...');
  try {
    await auth.createUserWithEmailAndPassword(email, pwd);
    setStatus('registerStatus', '登録成功。ログインしました。');
    // Navigate to list view handled by auth observer
  } catch (err) {
    setStatus('registerStatus', '登録失敗: ' + err.message);
  }
}

// Remove old register function. Registration is handled by createAccount()

/**
 * ゲストログインを行う。Firebase の匿名認証を用いて一時的なユーザー
 * アカウントを作成し、ログイン状態にする。匿名ユーザーはメールアドレス
 * やパスワードを入力する必要がないが、一部機能制限（例: パスワード変更など）
 * が存在する。成功するとメニュー画面が表示される。
 */
async function guestLogin() {
  try {
    setStatus('authStatus', 'ゲストログイン中...');
    await auth.signInAnonymously();
    setStatus('authStatus', '');
    // 認証状態変更ハンドラでメニューに遷移する
  } catch (err) {
    setStatus('authStatus', 'ゲストログイン失敗: ' + err.message);
  }
}

/**
 * 現在のユーザーをログアウトさせる。ユーザー関連の一時情報をリセットし、
 * ログイン画面に戻る。
 */
async function logout() {
  await auth.signOut();
  currentCaseData = null;
  currentShipments = [];
  showView('loginView');
  // 自動ログアウトタイマーを停止
  if (autoLogoutTimer) clearTimeout(autoLogoutTimer);
}

// -----------------------------------------------------------------------------
// 2D barcode scanning for case information

/**
 * ZLIB64 形式でエンコードされた 2 次元バーコードを読み取る。
 *
 * html5‑qrcode ライブラリを用いてカメラを起動し、読み取りに成功すると
 * コールバック関数が呼ばれる。読み取った文字列から "ZLIB64:" という
 * プレフィックスを除去し、`atob` で Base64 文字列をバイト列に変換して
 * から pako.inflate で zlib 展開を行う【264503526820217†L346-L376】【923982417776980†L126-L137】。
 * 展開結果は JSON 文字列であることを想定し、注文番号（orderNumber）、
 * 得意先（customer）、品名（product）などのフィールドを取得して
 * 入力欄に自動で反映する。成功したらカメラを停止して読み取りエリアを
 * 非表示に戻す。
 */
function start2DScanner() {
  const readerContainer = document.getElementById('qrReader');
  readerContainer.classList.remove('hidden');
  setStatus('caseStatus', 'カメラを起動しました。バーコードを読み取ってください');
  // Create instance if not exists
  if (!html5Qr2d) {
    html5Qr2d = new Html5Qrcode('qrReader');
  }
  const config = { fps: 10, qrbox: 250, rememberLastUsedCamera: true };
  const decodeCallback = async (decodedText, decodedResult) => {
    try {
      // Stop scanning after first success
      await html5Qr2d.stop();
      readerContainer.classList.add('hidden');
      // Remove prefix
      const prefix = 'ZLIB64:';
      let code = decodedText;
      if (code.startsWith(prefix)) {
        code = code.substring(prefix.length);
      }
      // Base64 decode
      const binaryString = atob(code);
      const charData = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        charData[i] = binaryString.charCodeAt(i);
      }
      const inflated = pako.inflate(charData, { to: 'string' });
      const data = JSON.parse(inflated);
      if (data.orderNumber) document.getElementById('orderNumberInput').value = data.orderNumber;
      if (data.customer) document.getElementById('customerInput').value = data.customer;
      if (data.product) document.getElementById('productInput').value = data.product;
      setStatus('caseStatus', '読み取り成功: データを入力しました');
    } catch (err) {
      setStatus('caseStatus', '読み取りまたは解凍に失敗: ' + err);
    }
  };
  if (IS_MOBILE) {
    // モバイルではファイル入力で撮影・読み取り
    setStatus('caseStatus', 'カメラを起動します');
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.capture = 'environment';
    fileInput.onchange = async (event) => {
      const file = event.target.files[0];
      if (!file) return;
      try {
        if (!html5Qr2d) {
          html5Qr2d = new Html5Qrcode('qrReader');
        }
        const result = await html5Qr2d.scanFile(file, true);
        await decodeCallback(result, null);
      } catch (err) {
        setStatus('caseStatus', '画像からの読み取りに失敗しました: ' + err);
      }
    };
    fileInput.click();
  } else {
    html5Qr2d.start({ facingMode: 'environment' }, config, decodeCallback)
      .catch(() => {
        // PC でもカメラが使えない場合はフォールバック
        setStatus('caseStatus', 'カメラを使用できませんでした。写真から読み取ります');
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.capture = 'environment';
        fileInput.onchange = async (event) => {
          const file = event.target.files[0];
          if (!file) return;
          try {
            if (!html5Qr2d) {
              html5Qr2d = new Html5Qrcode('qrReader');
            }
            const result = await html5Qr2d.scanFile(file, true);
            await decodeCallback(result, null);
          } catch (err) {
            setStatus('caseStatus', '画像からの読み取りに失敗しました: ' + err);
          }
        };
        fileInput.click();
      });
  }
}

// -----------------------------------------------------------------------------
// 案件追加スタート画面のバーコード読み取り

/**
 * 案件追加スタート画面でカメラを起動し、2 次元バーコードを読み取る。読み取り
 * 成功後に `processStartCode` を呼び出し、次の画面へ遷移する。スマートフォン
 * ではカメラボタンから起動し、PC では USB 接続バーコードリーダーからの入力を
 * `Enter` キーで処理する。
 */
function startStartScanner() {
  const container = document.getElementById('startQrReader');
  container.classList.remove('hidden');
  setStatus('startStatus', 'カメラを起動しました。バーコードを読み取ってください');
  // html5Qr2d インスタンスを使い回す。既に読み取り中の場合は停止して再利用。
  if (!html5Qr2d) {
    html5Qr2d = new Html5Qrcode('startQrReader');
  }
  const config = { fps: 10, qrbox: 250, rememberLastUsedCamera: true };
  const callback = async (decodedText, decodedResult) => {
    try {
      await html5Qr2d.stop();
      container.classList.add('hidden');
      await processStartCode(decodedText);
    } catch (err) {
      setStatus('startStatus', '読み取りに失敗しました: ' + err);
    }
  };
  // start() は Promise を返すため、カメラ起動に失敗した場合は
  // input type=file を用いたフォールバックを試みる。
  // スマホではブラウザ内カメラが起動しない場合が多いため、
  // 直接ファイル入力から撮影・読み取りを行う
  if (IS_MOBILE) {
    // フォールバックのみを実行
    setStatus('startStatus', 'カメラを起動します');
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.capture = 'environment';
    fileInput.onchange = async (event) => {
      const file = event.target.files[0];
      if (!file) return;
      try {
        if (!html5Qr2d) {
          html5Qr2d = new Html5Qrcode('startQrReader');
        }
        const result = await html5Qr2d.scanFile(file, true);
        await processStartCode(result);
      } catch (err) {
        setStatus('startStatus', '画像からの読み取りに失敗しました: ' + err);
      }
    };
    fileInput.click();
  } else {
    html5Qr2d.start({ facingMode: 'environment' }, config, callback)
      .catch(() => {
        // PC でもカメラが使えない場合はフォールバック
        setStatus('startStatus', 'カメラを使用できませんでした。写真から読み取ります');
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.capture = 'environment';
        fileInput.onchange = async (event) => {
          const file = event.target.files[0];
          if (!file) return;
          try {
            if (!html5Qr2d) {
              html5Qr2d = new Html5Qrcode('startQrReader');
            }
            const result = await html5Qr2d.scanFile(file, true);
            await processStartCode(result);
          } catch (err) {
            setStatus('startStatus', '画像からの読み取りに失敗しました: ' + err);
          }
        };
        fileInput.click();
      });
  }
}

/**
 * スタート画面の入力欄で Enter キーが押された場合の処理。入力された
 * バーコード文字列を受け取り、必要に応じて ZLIB64 解凍を試みる。
 * PC などのバーコードリーダーからの入力は末尾に Enter を送ることが多いため
 * このハンドラで自動的に次の画面へ遷移する。
 *
 * @param {KeyboardEvent} event キーボードイベント
 */
function handleBarcodeKeypress(event) {
  if (event.key === 'Enter') {
    event.preventDefault();
    const code = event.target.value.trim();
    // 空白のときは何もしない
    if (!code) return;
    processStartCode(code);
  }
}

/**
 * バーコード文字列を解析して案件情報を抽出し、案件入力画面へ遷移する。
 * ZLIB64 形式の場合はプレフィックスを除去し Base64 デコード→ zlib 展開
 *→ JSON パースを行う。展開に失敗した場合は手動入力とみなし、空欄のまま
 * 次の画面へ進む。成功すれば受注番号・得意先・品名を入力欄に事前設定する。
 *
 * @param {string} code バーコードから読み取った文字列
 */
async function processStartCode(code) {
  let orderNumber = '';
  let customer = '';
  let product = '';
  // 読み取り結果が完全に揃っているかどうかを判定するフラグ
  let autoProceed = false;
  if (code) {
    try {
      let payload = code;
      const prefix = 'ZLIB64:';
      if (payload.startsWith(prefix)) {
        payload = payload.substring(prefix.length);
      }
      // Base64 デコード
      const binaryString = atob(payload);
      const charData = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        charData[i] = binaryString.charCodeAt(i);
      }
      const inflated = pako.inflate(charData, { to: 'string' });
      const data = JSON.parse(inflated);
      orderNumber = data.orderNumber || '';
      customer = data.customer || '';
      product = data.product || '';
      setStatus('startStatus', '読み取り成功。次の画面に移動します');
      // orderNumber・customer・product がすべて非空なら次の画面へ自動遷移する
      autoProceed = !!(orderNumber && customer && product);
    } catch (err) {
      // 解凍やパースに失敗した場合は手動入力とみなす
      setStatus('startStatus', '読み取りまたは解凍に失敗しました。手動入力してください');
    }
  }
  // 次の画面に値を設定
  document.getElementById('orderNumberInput').value = orderNumber;
  document.getElementById('customerInput').value = customer;
  document.getElementById('productInput').value = product;
  // 状態リセット
  setStatus('caseStatus', '');
  // 案件入力画面を表示
  // すべての項目が取得できた場合は自動的に発送情報入力画面へ
  if (autoProceed) {
    // currentCaseData を仮登録して shipment に進む
    currentCaseData = { orderNumber, customer, product };
    // Reset shipments and show shipments view via goToShipments logic
    document.getElementById('shipmentsBody').innerHTML = '';
    addShipmentsRows(10);
    document.getElementById('carrierAllSelect').value = '';
    setStatus('shipmentsStatus', '');
    const summaryDiv = document.getElementById('caseSummary');
    if (summaryDiv) {
      summaryDiv.innerHTML = `<strong>受注番号:</strong> ${orderNumber}<br><strong>得意先:</strong> ${customer}<br><strong>品名:</strong> ${product}`;
    }
    showView('shipmentsView');
  } else {
    // 案件入力画面を表示
    showView('caseInputView');
    // フォーカス設定
    setTimeout(() => {
      if (!orderNumber) document.getElementById('orderNumberInput').focus();
      else if (!customer) document.getElementById('customerInput').focus();
      else if (!product) document.getElementById('productInput').focus();
    }, 0);
  }
}

// -----------------------------------------------------------------------------
// Shipments (tracking numbers) input and scanning

/**
 * 全体設定で選択された運送会社を空欄の行に適用する。上部の
 * ドロップダウンで運送会社を指定すると、各行の運送会社が未設定の
 * 行に対してその値を適用する。
 */
function applyCarrierToAll() {
  const globalCarrier = document.getElementById('carrierAllSelect').value;
  const selects = document.querySelectorAll('.carrierSelect');
  selects.forEach(select => {
    if (select.value === '' && globalCarrier) {
      select.value = globalCarrier;
    }
  });
}

/**
 * 発送情報の入力テーブルに指定された件数の行を追加する。既存の行が
 * ある場合は末尾に追記される。各行には運送会社選択セレクト、追跡番号
 * 入力欄、スマートフォン用カメラボタンを生成する。
 *
 * @param {number} count 追加する行数
 */
function addShipmentsRows(count) {
  const tbody = document.getElementById('shipmentsBody');
  const startIndex = tbody.children.length;
  for (let i = 0; i < count; i++) {
    const rowIndex = startIndex + i;
    const tr = document.createElement('tr');
    // index column
    const tdIndex = document.createElement('td');
    tdIndex.textContent = rowIndex + 1;
    tr.appendChild(tdIndex);
    // carrier select
    const tdCarrier = document.createElement('td');
    const select = document.createElement('select');
    select.className = 'carrierSelect';
    select.innerHTML = '<option value="">未設定</option>' +
      '<option value="yamato">ヤマト</option>' +
      '<option value="sagawa">佐川</option>' +
      '<option value="seino">西濃</option>' +
      '<option value="tonami">トナミ</option>' +
      '<option value="fukuyama">福山</option>' +
      '<option value="hida">飛騨</option>';
    tdCarrier.appendChild(select);
    tr.appendChild(tdCarrier);
    // tracking input
    const tdTracking = document.createElement('td');
    const input = document.createElement('input');
    input.type = 'text';
    // 半角入力用クラスを付与し、追跡番号は半角に変換する
    input.className = 'trackingInput halfwidth';
    tdTracking.appendChild(input);
    tr.appendChild(tdTracking);
    // camera button for smartphone
    const tdBtn = document.createElement('td');
    tdBtn.className = 'camera-col';
    const btn = document.createElement('button');
    btn.textContent = 'カメラ';
    btn.addEventListener('click', () => start1DScannerForRow(rowIndex));
    // PC 環境ではカメラ列を丸ごと非表示にする
    if (!IS_MOBILE) {
      tdBtn.style.display = 'none';
    } else {
      // スマホの場合のみカメラボタンを表示
      tdBtn.appendChild(btn);
    }
    tr.appendChild(tdBtn);
    tbody.appendChild(tr);
  }
  applyCarrierToAll();
}

/**
 * 特定の行の 1 次元バーコードを読み取る。読み取り結果はその行の追跡番号
 * 入力欄に自動で入力される。成功するとカメラを停止し読み取りエリアを
 * 非表示にする。html5‑qrcode ライブラリはバージョン 2.0.0 以降で
 * 1 次元および 2 次元コードの両方に対応している【194101813668927†L190-L194】。
 * @param {number} rowIndex 読み取り対象となるテーブル行のインデックス
 */
function start1DScannerForRow(rowIndex) {
  const readerContainer = document.getElementById('barcodeReader');
  readerContainer.classList.remove('hidden');
  // Create instance if necessary
  if (!html5Qr1d) {
    html5Qr1d = new Html5Qrcode('barcodeReader');
  }
  const config = {
    fps: 10,
    // Support 1D barcodes using supported formats list. Without
    // specifying, it scans both QR and 1D codes【194101813668927†L59-L102】.
    rememberLastUsedCamera: true
  };
  const callback = async (decodedText, decodedResult) => {
    try {
      await html5Qr1d.stop();
      readerContainer.classList.add('hidden');
      // Insert into correct row
      const tbody = document.getElementById('shipmentsBody');
      const tr = tbody.children[rowIndex];
      if (tr) {
        const input = tr.querySelector('.trackingInput');
        input.value = decodedText;
        setStatus('shipmentsStatus', 'バーコード読み取り成功');
      }
    } catch (err) {
      setStatus('shipmentsStatus', 'バーコード読み取り失敗: ' + err);
    }
  };
  html5Qr1d.start({ facingMode: 'environment' }, config, callback, err => {
    // ignore scanning errors
  });
}

/**
 * 受注番号・得意先・品名がすべて入力されているかを確認し、発送情報
 * 入力画面へ遷移する。入力値はグローバル変数 `currentCaseData` に保存
 * しておき、発送情報と一緒に Firestore へ保存する際に使用する。
 */
function goToShipments() {
  const orderNumber = document.getElementById('orderNumberInput').value.trim();
  const customer = document.getElementById('customerInput').value.trim();
  const product = document.getElementById('productInput').value.trim();
  if (!orderNumber || !customer || !product) {
    setStatus('caseStatus', '受注番号・得意先・品名をすべて入力してください');
    return;
  }
  currentCaseData = { orderNumber, customer, product };
  // Reset shipments table
  document.getElementById('shipmentsBody').innerHTML = '';
  addShipmentsRows(10);
  document.getElementById('carrierAllSelect').value = '';
  setStatus('shipmentsStatus', '');
  // サマリー表示を更新する
  const summaryDiv = document.getElementById('caseSummary');
  if (summaryDiv) {
    summaryDiv.innerHTML = `<strong>受注番号:</strong> ${orderNumber}<br><strong>得意先:</strong> ${customer}<br><strong>品名:</strong> ${product}`;
  }
  showView('shipmentsView');
}

/**
 * 発送情報入力テーブルから値を収集する。運送会社または追跡番号が空欄の
 * 行は無視し、運送会社と追跡番号の組み合わせが重複している行は1件目
 * だけを採用する。返り値は `{carrier, tracking}` の配列で、登録可能な
 * 行がなければ空配列を返す。
 */
function collectShipmentsFromTable() {
  const tbody = document.getElementById('shipmentsBody');
  const shipments = [];
  const seen = new Set();
  for (const tr of tbody.children) {
    const select = tr.querySelector('.carrierSelect');
    const input = tr.querySelector('.trackingInput');
    const carrier = select.value;
    const tracking = input.value.trim();
    if (carrier && tracking) {
      const key = carrier + '|' + tracking;
      if (!seen.has(key)) {
        seen.add(key);
        shipments.push({ carrier, tracking });
      } else {
        // skip duplicates
      }
    }
  }
  return shipments;
}

/**
 * 現在入力されている案件情報と発送情報を Firestore に保存する。発送情報
 * が1件もなければ保存せずにエラーを表示する。`currentCaseData` に
 * 保存されている受注番号・得意先・品名と、テーブルから収集した
 * 発送情報を統合し、暗号化ユーティリティで AES‑GCM 暗号化した上で
 * `data` フィールドに格納する。また検索のために平文の受注番号・
 * 得意先・品名・作成日時を別フィールドとして保存する。保存に成功すると
 * 入力フォームをクリアし、一覧画面に戻る。
 */
async function saveCase() {
  const shipments = collectShipmentsFromTable();
  if (shipments.length === 0) {
    setStatus('shipmentsStatus', '少なくとも1件の運送会社と追跡番号を入力してください');
    return;
  }
  if (!currentCaseData) {
    setStatus('shipmentsStatus', '案件情報が失われました。最初からやり直してください');
    return;
  }
  try {
    setStatus('shipmentsStatus', '保存中...');
    // Combine with case data
    const casePayload = {
      ...currentCaseData,
      shipments
    };
    // Encrypt the payload using the fixed secret
    const encrypted = await EncryptionUtils.encryptData(APP_ENCRYPTION_SECRET, casePayload);
    // Write to Firestore
    await db.collection('cases').add({
      uid: currentUser ? currentUser.uid : null,
      orderNumber: currentCaseData.orderNumber,
      customer: currentCaseData.customer,
      product: currentCaseData.product,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      data: encrypted
    });
    setStatus('shipmentsStatus', '登録が完了しました');
    // Reset forms
    document.getElementById('orderNumberInput').value = '';
    document.getElementById('customerInput').value = '';
    document.getElementById('productInput').value = '';
    currentCaseData = null;
    currentShipments = [];
    showView('listView');
    await loadCasesList();
  } catch (err) {
    setStatus('shipmentsStatus', '保存に失敗しました: ' + err);
  }
}

// -----------------------------------------------------------------------------
// Cases list and search

let unsubscribeCasesListener = null;
let casesCache = [];
// 管理者が一覧から複数案件を削除するための選択リスト
let selectedCaseIds = [];

/**
 * Firestore から作成日時の降順で案件を読み込む。`onSnapshot` により
 * リアルタイムで変更を監視し、新規追加や削除があると一覧を更新する。
 * 取得した結果は検索処理用に `casesCache` にキャッシュする。ログイン
 * 状態でのみ呼び出される。
 */
async function loadCasesList() {
  setStatus('listStatus', '読み込み中...');
  // Remove previous listener
  if (unsubscribeCasesListener) {
    unsubscribeCasesListener();
    unsubscribeCasesListener = null;
  }
  // Query with order by
  const query = db.collection('cases').orderBy('createdAt', 'desc');
  unsubscribeCasesListener = query.onSnapshot(snapshot => {
    casesCache = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      casesCache.push({ id: doc.id, orderNumber: data.orderNumber, customer: data.customer, product: data.product, createdAt: data.createdAt, encryptedData: data.data });
    });
    renderCaseList(casesCache);
    setStatus('listStatus', '');
  }, err => {
    setStatus('listStatus', '読み込み失敗: ' + err);
  });
}

/**
 * 与えられた配列から案件一覧をレンダリングする。各エントリはクリック
 * 可能で、詳細画面に遷移する。検索ボックスに入力がある場合はその
 * キーワードを含む受注番号・得意先・品名の案件のみを表示する。
 *
 * @param {Array} list 表示対象の案件オブジェクト配列
 */
function renderCaseList(list) {
  const container = document.getElementById('casesList');
  container.innerHTML = '';
  selectedCaseIds = [];
  const search = document.getElementById('searchInput').value.trim().toLowerCase();
  // sort by createdAt desc (newer first)
  const sorted = [...list].sort((a, b) => {
    if (a.createdAt && b.createdAt) {
      return b.createdAt.seconds - a.createdAt.seconds;
    }
    return 0;
  });
  const isAdmin = currentUser && ADMIN_UIDS.includes(currentUser.uid);
  // 管理者の場合は全選択・削除ボタンを表示
  if (isAdmin && sorted.length > 0) {
    const controlsDiv = document.createElement('div');
    controlsDiv.className = 'list-controls';
    const selectAllBox = document.createElement('input');
    selectAllBox.type = 'checkbox';
    selectAllBox.id = 'selectAllCases';
    const selectAllLabel = document.createElement('label');
    selectAllLabel.htmlFor = 'selectAllCases';
    selectAllLabel.textContent = '全選択';
    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = '選択した案件を削除';
    deleteBtn.addEventListener('click', deleteSelectedCases);
    selectAllBox.addEventListener('change', (e) => {
      const checkboxes = container.querySelectorAll('.case-select');
      checkboxes.forEach(cb => {
        cb.checked = e.target.checked;
        if (e.target.checked) {
          if (!selectedCaseIds.includes(cb.dataset.id)) selectedCaseIds.push(cb.dataset.id);
        } else {
          selectedCaseIds = [];
        }
      });
    });
    controlsDiv.appendChild(selectAllBox);
    controlsDiv.appendChild(selectAllLabel);
    controlsDiv.appendChild(deleteBtn);
    container.appendChild(controlsDiv);
  }
  list.filter(item => {
    if (!search) return true;
    return (item.orderNumber && item.orderNumber.toLowerCase().includes(search)) ||
           (item.customer && item.customer.toLowerCase().includes(search)) ||
           (item.product && item.product.toLowerCase().includes(search));
  }).forEach(item => {
    // 各案件の行
    const row = document.createElement('div');
    row.className = 'case-item';
    // チェックボックス
    if (isAdmin) {
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'case-select';
      cb.dataset.id = item.id;
      cb.addEventListener('change', (e) => {
        const id = e.target.dataset.id;
        if (e.target.checked) {
          if (!selectedCaseIds.includes(id)) selectedCaseIds.push(id);
        } else {
          selectedCaseIds = selectedCaseIds.filter(x => x !== id);
        }
      });
      row.appendChild(cb);
    }
    // 情報部分
    const span = document.createElement('span');
    span.textContent = `${item.orderNumber} | ${item.customer} | ${item.product}`;
    span.addEventListener('click', () => openCaseDetails(item.id));
    span.style.cursor = 'pointer';
    row.appendChild(span);
    container.appendChild(row);
  });
  if (list.length === 0) {
    const p = document.createElement('p');
    p.textContent = '案件がありません。';
    container.appendChild(p);
  }
}

/**
 * Filter the list when user types in search input.
 */
function filterCaseList() {
  renderCaseList(casesCache);
}

// -----------------------------------------------------------------------------
// Case details

let currentDetailCaseId = null;
let currentDetailData = null;

/**
 * 指定された案件 ID に対する詳細画面を開く。Firestore から取得した
 * `data` フィールドを固定鍵で復号し、受注番号・得意先・品名と
 * 発送情報を表示する。発送情報ごとに運送会社の公開ページをクロール
 * し、配送状態を取得する。管理者 UID に該当するユーザーのみ削除ボタンを
 * 表示する。
 *
 * @param {string} docId Firestore ドキュメント ID
 */
async function openCaseDetails(docId) {
  // Find case data
  const entry = casesCache.find(item => item.id === docId);
  if (!entry) return;
  currentDetailCaseId = docId;
  try {
    setStatus('detailsStatus', '読み込み中...');
    // Decrypt using fixed secret
    const decrypted = await EncryptionUtils.decryptData(APP_ENCRYPTION_SECRET, entry.encryptedData);
    currentDetailData = { ...decrypted, orderNumber: entry.orderNumber, customer: entry.customer, product: entry.product };
    // Render info
    const infoDiv = document.getElementById('detailsInfo');
    infoDiv.innerHTML = '';
    const p = document.createElement('p');
    p.innerHTML = `<strong>受注番号:</strong> ${currentDetailData.orderNumber}<br>` +
                  `<strong>得意先:</strong> ${currentDetailData.customer}<br>` +
                  `<strong>品名:</strong> ${currentDetailData.product}`;
    infoDiv.appendChild(p);
    // Render shipments
    renderShipmentsInDetails();
    // Show or hide delete button based on admin status
    const deleteBtn = document.getElementById('deleteCaseButton');
    if (currentUser && ADMIN_UIDS.includes(currentUser.uid)) {
      deleteBtn.style.display = 'inline-block';
    } else {
      deleteBtn.style.display = 'none';
    }
    setStatus('detailsStatus', '');
    showView('detailsView');
  } catch (err) {
    setStatus('detailsStatus', '復号に失敗しました: ' + err);
  }
}

/**
 * 詳細画面で発送情報を描画し、それぞれの追跡ステータスを表示する。
 * 配送状態は `fetchTrackingStatus` が各社の公開ページから取得した
 * キーワードに基づき「配達完了」「輸送中」「情報取得中」などに分類
 * される。
 */
async function renderShipmentsInDetails() {
  const container = document.getElementById('shipmentsList');
  container.innerHTML = '';
  const shipments = currentDetailData.shipments || [];
  // Show each shipment with status
  for (const ship of shipments) {
    const div = document.createElement('div');
    div.className = 'form-group';
    const statusObj = await fetchTrackingStatus(ship.carrier, ship.tracking);
    // 追跡番号を公式サイトへのリンクにする
    const url = getTrackingUrl(ship.carrier, ship.tracking);
    const trackingLink = `<a href="${url}" target="_blank" rel="noopener">${ship.tracking}</a>`;
    // 配達完了日時がある場合は表示
    const timeStr = statusObj.deliveredAt ? ` (${statusObj.deliveredAt})` : '';
    div.innerHTML = `<strong>${translateCarrier(ship.carrier)}</strong> | ${trackingLink} | 状態: ${statusObj.status}${timeStr}`;
    container.appendChild(div);
  }
  if (shipments.length === 0) {
    container.textContent = '発送情報がありません。';
  }
  // Add container for additional inputs if needed
  const extraContainer = document.createElement('div');
  extraContainer.id = 'extraShipmentInputs';
  container.appendChild(extraContainer);
}

/**
 * Translate carrier codes to Japanese names for display.
 * @param {string} code Carrier slug.
 * @returns {string}
 */
function translateCarrier(code) {
  switch (code) {
    case 'yamato': return 'ヤマト';
    case 'sagawa': return '佐川';
    case 'seino': return '西濃';
    case 'tonami': return 'トナミ';
    case 'fukuyama': return '福山';
    case 'hida': return '飛騨';
    default: return code;
  }
}

/**
 * 運送会社コードと追跡番号から公式の追跡URLを生成します。
 * 各社のURL形式に合わせて作成します。
 * @param {string} code 運送会社スラッグ
 * @param {string} tracking 追跡番号
 * @returns {string} 追跡ページのURL
 */
function getTrackingUrl(code, tracking) {
  switch (code) {
    case 'yamato':
      return `https://toi.kuronekoyamato.co.jp/cgi-bin/tneko?number00=1&number01=${encodeURIComponent(tracking)}`;
    case 'sagawa':
      return `https://k2k.sagawa-exp.co.jp/p/web/okurijosearch.do?okurijoNo=${encodeURIComponent(tracking)}`;
    case 'seino':
      return `https://track.seino.co.jp/cgi-bin/gnpquery.pgm?GNPNO1=${encodeURIComponent(tracking)}`;
    case 'tonami':
      return `https://trc1.tonami.co.jp/trc/search3/excSearch3?id[0]=${encodeURIComponent(tracking)}`;
    case 'fukuyama':
      return `https://corp.fukutsu.co.jp/situation/tracking_no_hunt/${encodeURIComponent(tracking)}`;
    case 'hida':
      return `https://www.hidayuso.co.jp/trace?no=${encodeURIComponent(tracking)}`;
    default:
      return '#';
  }
}

/**
 * 詳細画面で追跡番号を追加登録するための入力欄を複数生成する。各入力セット
 * には運送会社のセレクトボックス、追跡番号入力欄、スマホ用のカメラボタン
 * が含まれる。追加登録ボタンを押すと新しい発送情報のみが既存データに
 * 追加される。
 *
 * @param {number} count 生成する入力セットの数
 */
function addShipmentInputsToDetails(count) {
  const container = document.getElementById('extraShipmentInputs');
  for (let i = 0; i < count; i++) {
    const wrapper = document.createElement('div');
    wrapper.className = 'form-group';
    // select
    const select = document.createElement('select');
    select.innerHTML = '<option value="">未設定</option>' +
      '<option value="yamato">ヤマト</option>' +
      '<option value="sagawa">佐川</option>' +
      '<option value="seino">西濃</option>' +
      '<option value="tonami">トナミ</option>' +
      '<option value="fukuyama">福山</option>' +
      '<option value="hida">飛騨</option>';
    // input
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = '追跡番号';
    // camera button
    const btn = document.createElement('button');
    btn.textContent = 'カメラ';
    btn.addEventListener('click', () => start1DScannerForExtra(input));
    // PC ではカメラボタンを表示しない
    if (!IS_MOBILE) {
      btn.style.display = 'none';
    }
    wrapper.appendChild(select);
    wrapper.appendChild(input);
    wrapper.appendChild(btn);
    container.appendChild(wrapper);
  }
  // Add a save button if not exists
  if (!document.getElementById('saveExtraShipmentsButton')) {
    const saveBtn = document.createElement('button');
    saveBtn.id = 'saveExtraShipmentsButton';
    saveBtn.textContent = '追加登録';
    saveBtn.addEventListener('click', saveExtraShipments);
    container.appendChild(saveBtn);
  }
}

/**
 * Start 1D scanner for an input field used in details view. The
 * scanned code fills the provided input element. The camera closes
 * automatically after scanning.
 * @param {HTMLInputElement} input The input field to populate.
 */
function start1DScannerForExtra(input) {
  const readerContainer = document.getElementById('barcodeReader');
  readerContainer.classList.remove('hidden');
  if (!html5Qr1d) {
    html5Qr1d = new Html5Qrcode('barcodeReader');
  }
  const config = { fps: 10, rememberLastUsedCamera: true };
  const callback = async (decodedText) => {
    try {
      await html5Qr1d.stop();
      readerContainer.classList.add('hidden');
      input.value = decodedText;
      setStatus('detailsStatus', 'バーコード読み取り成功');
    } catch (err) {
      setStatus('detailsStatus', 'バーコード読み取り失敗: ' + err);
    }
  };
  html5Qr1d.start({ facingMode: 'environment' }, config, callback, err => {});
}

/**
 * 詳細画面で入力された追加の発送情報を保存する。既存の発送情報と重複
 * する組み合わせ（運送会社＋追跡番号）は無視され、新規分のみを
 * `currentDetailData` に追加する。更新後に案件ドキュメントを再度
 * 暗号化して上書きする。
 */
async function saveExtraShipments() {
  const container = document.getElementById('extraShipmentInputs');
  const children = Array.from(container.children);
  const newShipments = [];
  // Collect new shipments from inputs (excluding the save button)
  for (const child of children) {
    if (child.tagName === 'BUTTON') continue;
    const select = child.querySelector('select');
    const input = child.querySelector('input');
    const carrier = select.value;
    const tracking = input.value.trim();
    if (carrier && tracking) {
      newShipments.push({ carrier, tracking });
    }
  }
  // Remove duplicates with existing shipments
  const existing = new Set(currentDetailData.shipments.map(s => s.carrier + '|' + s.tracking));
  const unique = newShipments.filter(s => !existing.has(s.carrier + '|' + s.tracking));
  if (unique.length === 0) {
    setStatus('detailsStatus', '新規の発送情報がありません');
    return;
  }
  try {
    setStatus('detailsStatus', '追加登録中...');
    currentDetailData.shipments = currentDetailData.shipments.concat(unique);
    const encrypted = await EncryptionUtils.encryptData(APP_ENCRYPTION_SECRET, currentDetailData);
    await db.collection('cases').doc(currentDetailCaseId).update({ data: encrypted });
    setStatus('detailsStatus', `追加登録しました (${unique.length}件)`);
    // Clear extra inputs
    container.innerHTML = '';
    await openCaseDetails(currentDetailCaseId);
  } catch (err) {
    setStatus('detailsStatus', '追加登録に失敗: ' + err);
  }
}

/**
 * 現在表示している案件を削除する。管理者でない場合は操作を拒否する。
 */
async function deleteCurrentCase() {
  if (!currentDetailCaseId) return;
  if (!currentUser || !ADMIN_UIDS.includes(currentUser.uid)) {
    alert('削除権限がありません');
    return;
  }
  if (!confirm('この案件を削除しますか？')) return;
  try {
    await db.collection('cases').doc(currentDetailCaseId).delete();
    setStatus('detailsStatus', '削除しました');
    showView('listView');
    await loadCasesList();
  } catch (err) {
    setStatus('detailsStatus', '削除に失敗: ' + err);
  }
}

/**
 * 一覧画面で選択された案件を削除する。管理者でない場合は操作を拒否する。
 */
async function deleteSelectedCases() {
  if (!currentUser || !ADMIN_UIDS.includes(currentUser.uid)) {
    alert('削除権限がありません');
    return;
  }
  if (selectedCaseIds.length === 0) {
    alert('削除対象が選択されていません');
    return;
  }
  if (!confirm(`${selectedCaseIds.length} 件の案件を削除しますか？`)) return;
  try {
    // Firestore の削除を順番に実行
    for (const id of selectedCaseIds) {
      await db.collection('cases').doc(id).delete();
    }
    selectedCaseIds = [];
    await loadCasesList();
    alert('削除しました');
  } catch (err) {
    alert('削除に失敗しました: ' + err);
  }
}

// -----------------------------------------------------------------------------
// Tracking status retrieval via public tracking pages
//
// Official carrier APIs are not used. Instead, the application
// queries publicly accessible tracking pages through a CORS proxy
// (https://api.allorigins.win/raw) and parses the resulting HTML.
// Because carriers may change their page structure without notice
// this method should be considered best‑effort. When the status
// cannot be determined the function returns "情報取得中". Delivered
// shipments are detected when keywords such as "配達完了" or
// "お渡し済み" appear in the page.
/**
 * 各運送会社の公開されている追跡ページを CORS プロキシ経由で取得し、
 * HTML から配送状況を判定する。GET パラメータまたは URL の形式は
 * 運送会社ごとに異なるため `switch` 文で組み立てている。リクエストや
 * 解析に失敗した場合は「情報取得中」として扱う。数千件レベルの
 * リクエストでも API キーの制限を受けないよう、AfterShip を用いず
 * 公開ページのスクレイピング方式にしている。
 *
 * @param {string} carrier 運送会社スラッグ（yamato, sagawa など）
 * @param {string} tracking 追跡番号
 * @returns {Promise<{status: string, deliveredAt: string|null}>} 状態と配達日
 */
/**
 * 自作の追跡APIを利用して配送ステータスを取得します。Cloudflare Workers など
 * のサーバレス環境にデプロイしたAPIがJSON形式で状態を返すことを想定
 * しています。デフォルト値は空文字列なので、利用前に TRACKING_API_URL を
 * 設定してください。
 *
 * @param {string} carrier 運送会社スラッグ（yamato, sagawa など）
 * @param {string} tracking 追跡番号
 * @returns {Promise<{status: string, deliveredAt: string|null}>}
 */
async function fetchTrackingStatus(carrier, tracking) {
  try {
    if (!window.TRACKING_API_URL) {
      // ワーカーURLが設定されていない場合はステータスを取得できない
      return { status: '情報取得中', deliveredAt: null };
    }
    const url = `${window.TRACKING_API_URL}?carrier=${encodeURIComponent(carrier)}&tracking=${encodeURIComponent(tracking)}`;
    const resp = await fetch(url);
    if (!resp.ok) {
      return { status: '情報取得中', deliveredAt: null };
    }
    const data = await resp.json();
    /*
     * サーバから返されるJSONは環境によりプロパティ名が異なる可能性がある。
     * Cloudflare Worker版は state/time、従来版は status/deliveredAt を返すため
     * 両方のキーをチェックして最終的なステータスと日時を決定する。
     */
    let status = '情報取得中';
    if (data.state && typeof data.state === 'string' && data.state.trim()) {
      status = data.state.trim();
    } else if (data.status && typeof data.status === 'string' && data.status.trim()) {
      status = data.status.trim();
    }
    let deliveredAt = null;
    if (data.time) {
      deliveredAt = data.time;
    } else if (data.deliveredAt) {
      deliveredAt = data.deliveredAt;
    }
    return { status, deliveredAt };
  } catch (err) {
    return { status: '情報取得中', deliveredAt: null };
  }
}

/**
 * 追跡ページの HTML から配送状態を抽出する簡易パーサー。文字列に対して
 * 「配達完了」や「発送」などのキーワードを検索し、該当するものがあれば
 * 状態を返す。今後運送会社のページ構造が変わった場合はキーワードを
 * 追加・調整することで対応できる。
 *
 * @param {string} carrier 運送会社スラッグ
 * @param {string} html HTML コンテンツ
 * @returns {{status: string, deliveredAt: string|null}} 状態と配達日
 */
function parseStatusFromHtml(carrier, html) {
  // Normalise fullwidth characters and spaces
  const text = html.replace(/\s+/g, '');
  // Keywords for delivered
  const deliveredKeywords = ['配達完了', 'お届け済', 'お届け先に配達完了', 'お届け先にお渡し済'];
  for (const kw of deliveredKeywords) {
    if (text.includes(kw)) {
      return { status: '配達完了', deliveredAt: null };
    }
  }
  // Keywords for in transit or pickup
  const transitKeywords = ['発送', '出荷', '輸送中', '荷物受付', '受付', '輸送'];
  for (const kw of transitKeywords) {
    if (text.includes(kw)) {
      return { status: '輸送中', deliveredAt: null };
    }
  }
  // Unknown: return default
  return { status: '情報取得中', deliveredAt: null };
}

// -----------------------------------------------------------------------------
// Start the application
window.addEventListener('DOMContentLoaded', init);