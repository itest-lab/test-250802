import React from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import CaseAdd from './components/CaseAdd';
import ShipmentsAdd from './components/ShipmentsAdd';
import ListCases from './components/ListCases';
import CaseDetail from './components/CaseDetail';
import { useAuth } from './AuthProvider';

export default function App() {
  const { user, signInAnonymously } = useAuth();
  if (!user) {
    return (
      <div>
        <h2>ログイン</h2>
        <button onClick={signInAnonymously}>ゲストログイン</button>
      </div>
    );
  }
  return (
    <div>
      <nav>
        <Link to="/">案件追加</Link> | <Link to="/cases">案件一覧</Link>
      </nav>
      <Routes>
        <Route path="/" element={<CaseAdd />} />
        <Route path="/shipments" element={<ShipmentsAdd />} />
        <Route path="/cases" element={<ListCases />} />
        <Route path="/cases/:id" element={<CaseDetail />} />
      </Routes>
    </div>
  );
}
