/* Main layout wrapper */

import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import { useState } from 'react';

export default function Layout() {
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <div
        style={{
          flex: 1,
          marginLeft: 260, /* matches sidebar expanded width */
          display: 'flex',
          flexDirection: 'column',
          transition: 'margin-left 0.25s ease',
        }}
      >
        <Header />
        <main
          style={{
            flex: 1,
            padding: 32,
            maxWidth: 1440,
            width: '100%',
          }}
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}
