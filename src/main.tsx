import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>
);

// role: browser entry — mounts <App/> into #root.
// invariants: no visualizer logic here; StrictMode stays on so double-mount bugs surface.
// owner milestone: M1
