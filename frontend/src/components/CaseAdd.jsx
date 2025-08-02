import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useIsMobile } from '../useIsMobile';
import { parseZlib64 } from '../parseZlib64';
import { createCase } from '../api';

export default function CaseAdd() {
  const isMobile = useIsMobile();
  const videoRef = useRef(null);
  const [scanning, setScanning] = useState(false);
  const [orderNo, setOrderNo] = useState('');
  const [client, setClient] = useState('');
  const [product, setProduct] = useState('');
  const navigate = useNavigate();

  const openCamera = async () => {
    setScanning(true);
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    videoRef.current.srcObject = stream;
    // TODO: jsQR でスキャン処理 → parseZlib64 → set fields → stop stream → setScanning(false)
  };

  const handleSubmit = async () => {
    const result = await createCase({ orderNo, clientName: client, product });
    navigate('/shipments', { state: result });
  };

  return (
    <div>
      <h2>案件追加</h2>
      {isMobile && <button onClick={openCamera}>カメラ起動</button>}
      <video ref={videoRef} style={{ display: scanning ? 'block' : 'none' }} autoPlay />
      <div>
        <label>受注番号</label>
        <input value={orderNo} onChange={e => setOrderNo(e.target.value)} />
      </div>
      <div>
        <label>得意先</label>
        <input value={client} onChange={e => setClient(e.target.value)} />
      </div>
      <div>
        <label>品名</label>
        <input value={product} onChange={e => setProduct(e.target.value)} />
      </div>
      <button onClick={handleSubmit}>次へ</button>
    </div>
}
