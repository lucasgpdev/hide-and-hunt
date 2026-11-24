import { useEffect, useState } from 'react';
import { AdminPage } from './pages/AdminPage';
import { Notices } from './components/Notices';
import { useNetwork } from './hooks/useNetwork';
import { network } from './multiplayer/NetworkClient';
import { GameScreen } from './pages/GameScreen';
import { MainMenu } from './pages/MainMenu';
import { useSettings } from './settings/settings';

export function App() {
  const { room, player } = useNetwork();
  const settings = useSettings();

  // Abre a conexão em tempo real assim que a aplicação carrega. A conexão
  // vive enquanto a página estiver aberta (connect() ignora chamadas repetidas).
  useEffect(() => {
    network.connect();
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('high-contrast', settings.highContrast);
    root.classList.toggle('colorblind', settings.colorblind);
    root.classList.toggle('reduced-motion', settings.reducedMotion);
    root.style.setProperty('--ui-scale', String(settings.uiScale));
  }, [settings.highContrast, settings.colorblind, settings.reducedMotion, settings.uiScale]);

  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const onHash = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  if (hash === '#admin') return <AdminPage />;
  return (
    <>
      {room && player ? <GameScreen /> : <MainMenu />}
      <Notices />
    </>
  );
}
