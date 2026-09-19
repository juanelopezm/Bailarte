// ~20-line hash router (per plan: react-router-dom deliberately skipped for 5 flat routes).
import { useEffect, useState } from 'react';
import { StageScreen } from './ui/StageScreen.tsx';
import { PhoneHome } from './phone/PhoneHome.tsx';
import { PhoneVote } from './phone/PhoneVote.tsx';
import { BattleScreen } from './battle/BattleScreen.tsx';
import { HallOfFame } from './ui/HallOfFame.tsx';

function useHashRoute(): string {
  const [hash, setHash] = useState(() => location.hash.replace(/^#/, '') || '/');
  useEffect(() => {
    const onChange = () => setHash(location.hash.replace(/^#/, '') || '/');
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return hash;
}

export function App() {
  const route = useHashRoute().split('?')[0];

  if (route === '/phone') return <PhoneHome />;
  if (route === '/vote') return <PhoneVote />;
  if (route === '/battle') return <BattleScreen />;
  if (route === '/halloffame') return <HallOfFame />;
  return <StageScreen />;
}
