import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, signInAnonymously } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';

const AuthContext = createContext({ user: null, signInAnonymously: () => {} });

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  useEffect(() => onAuthStateChanged(auth, setUser), []);
  return (
    <AuthContext.Provider value={{ user, signInAnonymously }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
