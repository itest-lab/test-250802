import React, { useRef, useState } from 'react';
import { useIsMobile } from './useIsMobile';
import { parseZlib64 } from './parseZlib64';

export default function CaseAdd() {
  const isMobile = useIsMobile();
  const [isScanning, setIsScanning] = useState(false);
  const videoRef = useRef(null);
  const [orderNo, setOrderNo] = useState('');
  const [client, setClient] = useState('');
  const [product, setProduct] = useState('');

  const openCamera = async () => {
    setIsScanning(true);
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    videoRef.current.srcObject = stream;
    // TODO: jsQRでスキャン → 成功時 stopStream() → setFields → setIsScanning(false)
  };

  return (
    <div>
      <h2>案件追加</h2>
      {isMobile && <button onClick={openCamera}>カメラ起動</button>}
      <video ref={videoRef} style={{ display: isScanning ? 'block' : 'none' }} autoPlay />
      <div>
        <label>受注番号</label><input value={orderNo} onChange={e => setOrderNo(e.target.value)} />
      </div>
      <div>
        <label>得意先</label><input value={client} onChange={e => setClient(e.target.value)} />
      </div>
      <div>
        <label>品名</label><input value={product} onChange={e => setProduct(e.target.value)} />
      </div>
    </div>
  );
}
