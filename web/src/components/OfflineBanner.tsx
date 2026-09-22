import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../lib/useOnlineStatus';

/** Aviso claro quando a internet cai — nunca mostramos agenda desatualizada em silêncio. */
export default function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;
  return (
    <div className="offline-banner" role="status">
      <WifiOff size={16} aria-hidden="true" />
      Sem conexão — os dados podem estar incompletos até a internet voltar.
    </div>
  );
}
