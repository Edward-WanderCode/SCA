/* Main layout wrapper */

import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import { useState, useEffect } from 'react';

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) {
        setSidebarOpen(false);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} isMobile={isMobile} />
      <div
        style={{
          flex: 1,
          marginLeft: isMobile ? 0 : 260,
          display: 'flex',
          flexDirection: 'column',
          transition: 'margin-left 0.25s ease',
        }}
      >
        <Header onMenuClick={() => setSidebarOpen(!sidebarOpen)} isMobile={isMobile} />
        <main
          style={{
            flex: 1,
            padding: isMobile ? '16px' : '24px 32px',
            maxWidth: '100%',
            width: '100%',
            overflowX: 'hidden',
          }}
        >

          <Outlet />
        </main>
      </div>
    </div>
  );
}
