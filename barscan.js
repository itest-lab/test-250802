(function (root, factory) {
  if (typeof define === 'function' && define.amd) { define([], factory); }
  else if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.BarScanJS = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  "use strict";

  const DEFAULTS = {
    trimABCD: true,
    minLen: 10,
    maxLen: null,
    aggressive: false,
    allow2D: false,
    cdn: {
      pdfjs: [
        "https://unpkg.com/pdfjs-dist@2.16.105/build/pdf.min.js",
        "https://cdn.jsdelivr.net/npm/pdfjs-dist@2.16.105/build/pdf.min.js"
      ],
      pdfjs_worker: "https://cdn.jsdelivr.net/npm/pdfjs-dist@2.16.105/build/pdf.worker.min.js",
      quagga2: [
        "https://cdn.jsdelivr.net/npm/quagga2@1.8.2/dist/quagga.js",
        "https://cdn.jsdelivr.net/npm/quagga2@1.8.1/dist/quagga.js",
        "https://unpkg.com/quagga2@1.8.2/dist/quagga.js",
        "https://unpkg.com/quagga2@1.8.1/dist/quagga.js",
        "https://cdn.jsdelivr.net/npm/quagga2@1.6.0/dist/quagga.js",
        "https://unpkg.com/quagga2@1.6.0/dist/quagga.js",
        "https://cdn.jsdelivr.net/npm/quagga2@1.8.1/umd/quagga.min.js",
        "https://unpkg.com/quagga2@1.8.1/umd/quagga.min.js"
      ],
      quagga_legacy: [
        "https://cdn.jsdelivr.net/npm/quagga@0.12.1/dist/quagga.min.js",
        "https://unpkg.com/quagga@0.12.1/dist/quagga.min.js"
      ],
      zxing: [
        "https://unpkg.com/@zxing/library@0.20.0/umd/index.min.js",
        "https://cdn.jsdelivr.net/npm/@zxing/library@0.20.0/umd/index.min.js"
      ],
      opencv: [
        "https://docs.opencv.org/4.x/opencv.js",
        "https://docs.opencv.org/4.7.0/opencv.js",
        "https://cdn.jsdelivr.net/npm/@techstark/opencv-js@4.7.0/build/opencv.js"
      ]
    }
  };

  const state = {
    ready: false,
    options: { ...DEFAULTS },
    libs: { pdf:false, quagga:false, zxing:false, opencv:false, barcodeDetector:false },
  };

  function mergeOptions(user){
    const o = { ...DEFAULTS, ...(user||{}) };
    if (user && user.cdn) {
      o.cdn = { ...DEFAULTS.cdn, ...user.cdn };
      for (const k of Object.keys(DEFAULTS.cdn)) {
        if (user.cdn[k]) o.cdn[k] = Array.isArray(user.cdn[k]) ? user.cdn[k] : [ user.cdn[k] ];
      }
    }
    return o;
  }

  async function loadScript(urls){
    const list = Array.isArray(urls) ? urls : [urls];
    let lastErr = null;
    for (const url of list) {
      try {
        await new Promise((resolve, reject)=>{
          const s=document.createElement('script'); s.src=url; s.async=true;
          s.onload=resolve; s.onerror=()=>reject(new Error("load error: "+url));
          document.head.appendChild(s);
        });
        return true;
      } catch(e){ lastErr = e; }
    }
    if (lastErr) throw lastErr;
    return false;
  }

  async function init(userOptions){
    state.options = mergeOptions(userOptions);
    const cdn = state.options.cdn;
    // pdf.js
    if (typeof window !== "undefined") {
      try {
        if (!window.pdfjsLib) await loadScript(cdn.pdfjs);
        if (window.pdfjsLib) {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = cdn.pdfjs_worker;
          state.libs.pdf = true;
        }
      } catch(e){ state.libs.pdf = false; }
    }
    // BarcodeDetector
    state.libs.barcodeDetector = (typeof window !== 'undefined' && 'BarcodeDetector' in window);

    // Quagga
    try {
      if (!window.Quagga) {
        await loadScript(cdn.quagga2);
        if (!window.Quagga) await loadScript(cdn.quagga_legacy);
      }
      state.libs.quagga = !!window.Quagga;
    } catch(e){ state.libs.quagga = !!window.Quagga; }

    // ZXing
    try {
      if (!window.ZXing) await loadScript(cdn.zxing);
      state.libs.zxing = !!window.ZXing;
    } catch(e){ state.libs.zxing = !!window.ZXing; }

    // OpenCV (optional)
    try {
      await loadScript(cdn.opencv);
      state.libs.opencv = !!window.cv;
    } catch(e){ state.libs.opencv = !!window.cv; }

    state.ready = true;
    return { ...state.libs };
  }

  // ===== helpers
  function normalizeCodabar(s){
    if (!s) return s;
    if (/^[ABCD]/i.test(s) && /[ABCD]$/i.test(s)) return s.slice(1,-1);
    return s;
  }
  function acceptCodabar(s, opts){
    const o = opts || state.options;
    let t = o.trimABCD ? normalizeCodabar(s) : s;
    const L = (t||'').length;
    if (L < o.minLen) return null;
    if (o.maxLen != null && L > o.maxLen) return null;
    return t;
  }
  function toCanvasFromAny(input){
    return new Promise(async (resolve, reject)=>{
      try {
        if (input instanceof HTMLCanvasElement) { resolve(input); return; }
        if (input instanceof ImageBitmap) {
          const c = document.createElement('canvas');
          c.width = input.width; c.height = input.height;
          c.getContext('2d').drawImage(input, 0, 0);
          resolve(c); return;
        }
        if (input instanceof Blob) {
          const url = URL.createObjectURL(input);
          const img = new Image(); img.onload=()=>{ const c=document.createElement('canvas'); c.width=img.naturalWidth; c.height=img.naturalHeight; c.getContext('2d').drawImage(img,0,0); URL.revokeObjectURL(url); resolve(c); }; img.onerror=reject; img.src=url;
          return;
        }
        if (typeof input === "string") {
          const img = new Image(); img.crossOrigin="anonymous";
          img.onload=()=>{ const c=document.createElement('canvas'); c.width=img.naturalWidth; c.height=img.naturalHeight; c.getContext('2d').drawImage(img,0,0); resolve(c); };
          img.onerror=reject; img.src=input; return;
        }
        if (input instanceof HTMLImageElement) {
          const c = document.createElement('canvas');
          c.width = input.naturalWidth; c.height = input.naturalHeight;
          c.getContext('2d').drawImage(input, 0, 0); resolve(c); return;
        }
        reject(new Error("Unsupported input type for toCanvasFromAny"));
      } catch(e){ reject(e); }
    });
  }
  function copyCanvasXY(src, sx=1, sy=1, rotate=0){
    const dst = document.createElement('canvas');
    let w = src.width, h = src.height;
    if (rotate % 180 !== 0) [w,h] = [h,w];
    dst.width = Math.max(1, Math.floor(w * sx));
    dst.height= Math.max(1, Math.floor(h * sy));
    const dctx = dst.getContext('2d');
    dctx.imageSmoothingEnabled = false;
    dctx.save();
    if (rotate) {
      dctx.translate(dst.width/2, dst.height/2);
      dctx.rotate(rotate*Math.PI/180);
      dctx.translate(-src.width/2, -src.height/2);
    }
    dctx.drawImage(src, 0, 0, src.width, src.height, 0, 0, dst.width, dst.height);
    dctx.restore();
    return dst;
  }
  function extractRegion(src, rect){
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.floor(rect.w));
    c.height= Math.max(1, Math.floor(rect.h));
    const x = c.getContext('2d');
    x.imageSmoothingEnabled = false;
    x.drawImage(src, rect.x, rect.y, rect.w, rect.h, 0, 0, c.width, c.height);
    return c;
  }
  function parseBandSize(str, fullH){
    str = String(str).trim();
    if (str.endsWith('%')) return Math.round(fullH * (parseFloat(str)/100));
    return Math.max(8, Math.round(parseFloat(str)||0));
  }

  // ===== backends
  async function barcodeDetectorDecode(cnv, opts){
    try{
      if (!('BarcodeDetector' in window)) return null;
      const formats = window.BarcodeDetector.getSupportedFormats ? await window.BarcodeDetector.getSupportedFormats() : [];
      if (formats.length && !formats.includes('codabar')) return null;
      const bd = new BarcodeDetector({ formats: ['codabar'] });
      const bitmap = await createImageBitmap(cnv);
      const det = await bd.detect(bitmap);
      if (det && det.length){
        for (const d of det){
          if (String(d.format).toLowerCase()!=='codabar') continue;
          const t = acceptCodabar((d.rawValue||'').trim(), opts);
          if (t){ return { text:t, points: d.cornerPoints||null, bbox: d.boundingBox||null }; }
        }
      }
    } catch(e){ /* ignore */ }
    return null;
  }
  async function quaggaDecodeFromCanvas(cnv, opts){
    if (!window.Quagga) return null;
    return new Promise((resolve) => {
      const dataURL = cnv.toDataURL('image/png');
      window.Quagga.decodeSingle({
        src: dataURL,
        numOfWorkers: 0,
        inputStream: { size: cnv.width + 'x' + cnv.height },
        locator: { halfSample: true, patchSize: 'medium' },
        decoder: { readers: ['codabar_reader'] },
        locate: true
      }, (result) => {
        if (result && result.codeResult && result.codeResult.code) {
          const t = acceptCodabar(result.codeResult.code.trim(), opts);
          if (t) resolve({ text:t, points: result.box||result.line||null, bbox:null });
          else resolve(null);
        } else resolve(null);
      });
    });
  }
  async function zxingDecodeFromCanvas(cnv, opts){
    if (!window.ZXing || !window.ZXing.BrowserMultiFormatReader) return null;
    try{
      const Types = window.ZXing;
      let reader=null, hints=null;
      try {
        hints = new Types.Map();
        const formats = [Types.BarcodeFormat.CODABAR];
        if (opts.allow2D){ formats.push(Types.BarcodeFormat.QR_CODE, Types.BarcodeFormat.PDF_417); }
        hints.set(Types.DecodeHintType.POSSIBLE_FORMATS, formats);
        hints.set(Types.DecodeHintType.TRY_HARDER, true);
        reader = new Types.BrowserMultiFormatReader(hints);
      } catch { reader = new Types.BrowserMultiFormatReader(); }
      const r = await reader.decodeFromImageUrl(cnv.toDataURL('image/png'));
      const text = r.text || (r.getText && r.getText()) || "";
      const fmt  = (r.format || (r.getBarcodeFormat && r.getBarcodeFormat()))+"";
      if (!/CODABAR|QR_CODE|PDF_417/.test(fmt)) return null;
      const accepted = /CODABAR/.test(fmt) ? acceptCodabar(text.trim(), opts) : (opts.allow2D ? text.trim() : null);
      if (accepted) return { text:accepted, points: r.points||null, bbox:null, format:fmt };
    }catch(e){}
    return null;
  }

  function cvAvailable(){ return typeof window.cv !== 'undefined' && cv && cv.Mat; }
  function cvPreprocess(cnv){
    if (!cvAvailable()) return null;
    try{
      const src = cv.imread(cnv);
      let gray = new cv.Mat(); cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
      let bin = new cv.Mat(); cv.threshold(gray, bin, 0, 255, cv.THRESH_OTSU);
      let kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(23,3));
      let closed = new cv.Mat(); cv.morphologyEx(bin, closed, cv.MORPH_CLOSE, kernel);
      const dst = document.createElement('canvas'); dst.width=cnv.width; dst.height=cnv.height; cv.imshow(dst, closed);
      src.delete(); gray.delete(); bin.delete(); kernel.delete(); closed.delete();
      return dst;
    }catch(e){ return null; }
  }

  async function decodeWithBackends(cnv, opts){
    // 0 native
    let r = await barcodeDetectorDecode(cnv, opts);
    if (r) return r;
    // 1 quagga
    r = await quaggaDecodeFromCanvas(cnv, opts);
    if (r) return r;
    // 2 zxing
    r = await zxingDecodeFromCanvas(cnv, opts);
    if (r) return r;
    // 3 cv-preprocess then retry
    const cvC = cvPreprocess(cnv);
    if (cvC){
      r = await quaggaDecodeFromCanvas(cvC, opts); if (r) return r;
      r = await zxingDecodeFromCanvas(cvC, opts); if (r) return r;
    }
    return null;
  }

  // ===== Public API =====
  async function scanImage(input, userOpts){
    const opts = { ...state.options, ...(userOpts||{}) };
    const cnv = await toCanvasFromAny(input);
    const results = [];
    const W = cnv.width, H = cnv.height;
    const ag = !!opts.aggressive;
    const bands = [];
    const baseBands = ['18%','28%'];
    const moreBands = ag ? ['12%','36%','60%'] : [];
    const allBands = [...baseBands, ...moreBands];
    for (const bhRaw of allBands){
      const bh = parseBandSize(bhRaw, H);
      for (let cy=bh/2; cy<H; cy += Math.floor(bh * (ag?0.5:0.6))){
        bands.push({ x:0, y: Math.max(0, Math.round(cy-bh/2)), w: W, h: Math.min(H, bh) });
      }
    }
    bands.unshift({ x:0, y:0, w:W, h:H }); // include full

    const baseAngles = [-8,-5,-3,0,3,5,8];
    const baseScales = [[3,2],[4,2],[2,2]];
    const angles = ag ? Array.from(new Set([...baseAngles, -12,-10,-7,-4,-2,2,4,7,10,12])) : baseAngles;
    const scales = ag ? [...baseScales, [5,2],[6,2],[3,3]] : baseScales;

    for (const rect of bands){
      const band = extractRegion(cnv, rect);
      for (const [sx,sy] of scales){
        for (const ang of angles){
          const v = copyCanvasXY(band, sx, sy, ang);
          const res = await decodeWithBackends(v, opts);
          if (res && res.text){
            results.push({
              text: res.text,
              format: 'CODABAR',
              page: null,
              bbox: res.bbox || { x: rect.x, y: rect.y, width: rect.w, height: rect.h },
              points: res.points || null
            });
          }
        }
      }
    }
    // merge duplicates (same text)
    const unique = [];
    const seen = new Set();
    for (const r of results){
      const key = r.text;
      if (!seen.has(key)) { seen.add(key); unique.push(r); }
    }
    return unique;
  }

  async function scanPDF(fileOrBuffer, userOpts){
    if (!state.libs.pdf) throw new Error("pdf.js not loaded");
    const opts = { ...state.options, ...(userOpts||{}) };
    let data = null;
    if (fileOrBuffer instanceof ArrayBuffer) data = fileOrBuffer;
    else if (fileOrBuffer && fileOrBuffer.arrayBuffer) data = await fileOrBuffer.arrayBuffer();
    else throw new Error("scanPDF expects File/Blob or ArrayBuffer");
    const pdf = await pdfjsLib.getDocument({ data }).promise;
    const pages = [];
    for (let i=1;i<=pdf.numPages;i++) pages.push(i);
    const results = [];
    for (const p of pages){
      const page = await pdf.getPage(p);
      const vp = page.getViewport({ scale: 2.0 });
      const c = document.createElement('canvas'); c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
      await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
      const r = await scanImage(c, opts);
      for (const it of r){ it.page = p; }
      results.push(...r);
    }
    return results;
  }

  function drawOverlays(container, results){
    // container: HTML element that wraps the canvas (position:relative recommended)
    // results: [{bbox:{x,y,width,height}, text, page?}]
    const frag = document.createDocumentFragment();
    for (const r of results){
      const {x,y,width,height} = r.bbox || {x:0,y:0,width:0,height:0};
      const box = document.createElement('div'); box.style.position='absolute';
      Object.assign(box.style, { left:x+'px', top:y+'px', width:width+'px', height:height+'px',
        border:'2px solid rgba(21,101,192,.9)', borderRadius:'2px', pointerEvents:'none' });
      const badge = document.createElement('div'); badge.textContent = r.text;
      Object.assign(badge.style, { position:'absolute', left:(x+width/2)+'px', top:y+'px',
        transform:'translate(-50%,-120%)', background:'rgba(21,101,192,.9)', color:'#fff', fontSize:'12px',
        padding:'2px 6px', borderRadius:'6px', cursor:'pointer', pointerEvents:'auto' });
      badge.addEventListener('click', ()=>{
        if (navigator.clipboard) navigator.clipboard.writeText(r.text).catch(()=>{});
      });
      frag.appendChild(box); frag.appendChild(badge);
    }
    container.appendChild(frag);
  }

  return { init, scanImage, scanPDF, drawOverlays, _state: state };
});
