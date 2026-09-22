import { RefreshCw, X } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';

/** Aviso discreto quando há uma versão nova do app publicada. Nunca atualiza sozinho. */
export default function UpdateToast() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError: (err) => console.error('Falha ao registrar o service worker', err),
  });

  if (!needRefresh) return null;

  return (
    <div className="update-toast" role="status">
      <span>Nova versão disponível</span>
      <div className="update-toast-actions">
        <button className="btn small primary" onClick={() => void updateServiceWorker(true)}>
          <RefreshCw size={14} aria-hidden="true" />
          Atualizar
        </button>
        <button className="icon-btn" onClick={() => setNeedRefresh(false)} aria-label="Dispensar">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
