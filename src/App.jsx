import { useState, useEffect } from 'react';
import './App.css';
import { getElectronVersion, getNodeVersion, getChromeVersion } from './shared/api/electron-api';

function App() {
  const [electronVersion, setElectronVersion] = useState('загрузка...');
  const [nodeVersion, setNodeVersion] = useState('загрузка...');
  const [chromeVersion, setChromeVersion] = useState('загрузка...');

  useEffect(() => {
    // Получаем версии из Electron API
    const electronVer = getElectronVersion();
    const nodeVer = getNodeVersion();
    const chromeVer = getChromeVersion();
    
    if (electronVer) setElectronVersion(electronVer);
    if (nodeVer) setNodeVersion(nodeVer);
    if (chromeVer) setChromeVersion(chromeVer);
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <h1>🚀 No-code UI</h1>
        <p>Electron + React приложение</p>
      </header>
      
      <main className="app-main">
        <div className="info-card">
          <h2>Информация о системе</h2>
          <div className="info-list">
            <div className="info-item">
              <span className="label">Electron:</span>
              <span className="value">{electronVersion}</span>
            </div>
            <div className="info-item">
              <span className="label">Node.js:</span>
              <span className="value">{nodeVersion}</span>
            </div>
            <div className="info-item">
              <span className="label">Chromium:</span>
              <span className="value">{chromeVersion}</span>
            </div>
          </div>
        </div>

        <div className="welcome-card">
          <h2>Добро пожаловать!</h2>
          <p>Ваше приложение Electron + React успешно настроено и готово к работе.</p>
          <p>Начните разработку, редактируя файл <code>src/App.jsx</code></p>
        </div>
      </main>
    </div>
  );
}

export default App;
