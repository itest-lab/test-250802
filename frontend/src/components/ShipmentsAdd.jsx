import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useIsMobile } from '../useIsMobile';
import { addShipments } from '../api';

const carriers = ['sagawa', 'yamato', 'seino', 'tonami', 'fukuyama', 'hida'];

export default function ShipmentsAdd() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [rows, setRows] = useState(Array.from({ length: 10 }, () => ({ carrier: '', trackingNo: '' })));
  const [bulkCarrier, setBulkCarrier] = useState('');

  const addMore = () => setRows(prev => [...prev, ...Array.from({ length: 5 }, () => ({ carrier: '', trackingNo: '' }))]);
  const applyBulk = () => setRows(prev => prev.map(r => ({ ...r, carrier: bulkCarrier })));

  const handleChange = (idx, key, val) => {
    const newRows = [...rows];
    newRows[idx][key] = val;
    setRows(newRows);
  };

  const handleSubmit = async () => {
    const shipments = rows.filter(r => r.carrier && r.trackingNo);
    await addShipments(state.id, shipments);
    navigate(`/cases/${state.id}`);
  };

  return (
    <div>
      <h2>追跡番号追加 ({state.orderNo})</h2>
      <div>
        <label>運送会社一括設定: </label>
        <select value={bulkCarrier} onChange={e => setBulkCarrier(e.target.value)}>
          <option value=''>指定なし</option>
          {carriers.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <button onClick={applyBulk}>適用</button>
      </div>
      <table>
        <thead>
          <tr><th>#</th><th>運送会社</th><th>追跡番号</th><th>カメラ</th></tr>
        </thead>
        <tbody>
          {rows.map((r,i) => (
            <tr key={i}>
              <td>{i+1}</td>
              <td>
                <select value={r.carrier} onChange={e => handleChange(i,'carrier',e.target.value)}>
                  <option value=''>選択</option>
                  {carriers.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </td>
              <td><input value={r.trackingNo} onChange={e => handleChange(i,'trackingNo',e.target.value)} /></td>
              <td>{isMobile && <button>カメラ</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <button onClick={addMore}>＋5 行追加</button>
      <button onClick={handleSubmit}>登録</button>
    </div>
}
