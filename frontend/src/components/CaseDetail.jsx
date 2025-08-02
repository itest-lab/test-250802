import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { firestore } from '../firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { trackStatus } from '../api';
import ShipmentsAdd from './ShipmentsAdd';

export default function CaseDetail() {
  const { id } = useParams();
  const [shipments, setShipments] = useState([]);
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    async function load() {
      const q = query(collection(firestore,'shipments'), where('caseId','==',id));
      const snap = await getDocs(q);
      const data = snap.docs.map(d => ({ id: d.id, ...d.data(), status:'', time:'' }));
      setShipments(data);
    }
    load();
  }, [id]);

  const refreshStatus = async (idx) => {
    const s = shipments[idx];
    const res = await trackStatus(s.carrier, s.trackingNo);
    const newList = [...shipments];
    newList[idx] = { ...newList[idx], status: res.status, time: res.time };
    setShipments(newList);
  };

  return (
    <div>
      <h2>案件詳細</h2>
      <button onClick={() => setShowAdd(!showAdd)}>＋5 件追加</button>
      {showAdd && <ShipmentsAdd state={{ id }} />}
      <table>
        <thead><tr><th>運送会社</th><th>追跡番号</th><th>ステータス</th><th>更新</th></tr></thead>
        <tbody>
          {shipments.map((s,i) => (
            <tr key={s.id}>
              <td>{s.carrier}</td>
              <td>{s.trackingNo}</td>
              <td>{s.status} {s.time}</td>
              <td><button onClick={() => refreshStatus(i)}>再取得</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
}
