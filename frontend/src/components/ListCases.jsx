import React, { useEffect, useState } from 'react';
import { firestore } from '../firebase';
import { collection, query, orderBy, getDocs } from 'firebase/firestore';
import { Link } from 'react-router-dom';

export default function ListCases() {
  const [cases, setCases] = useState([]);
  useEffect(() => {
    async function load() {
      const q = query(collection(firestore,'cases'), orderBy('createdAt','desc'));
      const snap = await getDocs(q);
      setCases(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }
    load();
  }, []);
  return (
    <div>
      <h2>案件一覧</h2>
      <ul>
        {cases.map(c => (
          <li key={c.id}>
            <Link to={`/cases/${c.id}`}>{c.orderNo} / {c.client} / {c.product}</Link>
          </li>
        ))}
      </ul>
    </div>
}
