/*
     * encryption.js
     *
     * このモジュールは AES‑GCM を利用した簡易的な暗号化／復号処理を
     * 提供します。暗号化キーは PBKDF2 によってパスフレーズから導出
     * されるため、ソースコード内に鍵をハードコードする必要がありません。
     * 暗号化結果には初期化ベクトル (IV) と暗号化したデータを配列形式で
     * 保持し、そのまま JSON としてデータベースに保存することができます。
     * グローバルオブジェクト `EncryptionUtils` に非同期関数
     * `encryptData` と `decryptData` を公開しています。
     *
     * 利用例:
     *   // オブジェクトを暗号化
     *   const payload = await EncryptionUtils.encryptData('パスフレーズ', {foo: 'bar'});
     *   // 後で復号化
     *   const obj = await EncryptionUtils.decryptData('パスフレーズ', payload);
     */

(() => {
  const SALT = '案件管理システム固定ソルト';

  /**
   * パスフレーズから PBKDF2 によって暗号化用鍵を生成します。生成される
   * キーは AES‑GCM に適した形式となります。ここではソルトを固定して
   * いるため、同じパスフレーズから常に同じ鍵が得られます。実際の運用
   * ではソルトをランダムにして暗号データと一緒に保存することも検討
   * してください。
   *
   * @param {string} passphrase ユーザーが設定するパスフレーズ
   * @returns {Promise<CryptoKey>} 生成された AES‑GCM 用鍵
   */
  async function deriveKey(passphrase) {
    const enc = new TextEncoder();
    const passphraseKey = await window.crypto.subtle.importKey(
      'raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']
    );
    return await window.crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: enc.encode(SALT),
        iterations: 100000,
        hash: 'SHA-256'
      },
      passphraseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  /**
   * JavaScript の値を暗号化し、IV と暗号文を含むオブジェクトとして
   * 返します。暗号化前に対象の値は JSON 文字列に変換されます。返され
   * る IV と暗号文は通常の配列なので、そのまま JSON として保存する
   * ことができます。復号の際は同じパスフレーズで
   * `decryptData` を呼び出してください。
   *
   * @param {string} passphrase 暗号化に使用するパスフレーズ
   * @param {any} value 暗号化したい JavaScript の値
   * @returns {Promise<{iv: number[], cipher: number[]}>} 暗号化データ
   */
  async function encryptData(passphrase, value) {
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(passphrase);
    const enc = new TextEncoder();
    const data = enc.encode(JSON.stringify(value));
    const cipherBuffer = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv }, key, data
    );
    return {
      iv: Array.from(iv),
      cipher: Array.from(new Uint8Array(cipherBuffer))
    };
  }

  /**
   * `encryptData` で暗号化されたペイロードを復号します。パスフレーズ
   * が正しくない場合は復号に失敗し例外が発生します。
   *
   * @param {string} passphrase 暗号化時に使用したパスフレーズ
   * @param {{iv: number[], cipher: number[]}} payload 暗号化されたデータ
   * @returns {Promise<any>} 復号された値
   */
  async function decryptData(passphrase, payload) {
    const key = await deriveKey(passphrase);
    const iv = new Uint8Array(payload.iv);
    const cipher = new Uint8Array(payload.cipher);
    const plainBuffer = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv }, key, cipher
    );
    const dec = new TextDecoder();
    return JSON.parse(dec.decode(plainBuffer));
  }

  window.EncryptionUtils = {
    encryptData,
    decryptData
  };
})();