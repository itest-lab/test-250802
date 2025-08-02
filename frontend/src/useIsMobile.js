import { useState, useEffect } from 'react';
export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    setIsMobile(/Mobi|Android|iPhone|iPad/.test(navigator.userAgent));
  }, []);
  return isMobile;
}
