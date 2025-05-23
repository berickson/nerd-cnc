import React from 'react';
import { createRoot } from 'react-dom/client';
import StartPage from './pages/start_page';

const container = document.getElementById('app');
if (container) {
  const root = createRoot(container);
  root.render(<StartPage />);
}