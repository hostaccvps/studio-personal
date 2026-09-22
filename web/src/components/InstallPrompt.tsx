import { useEffect, useState } from 'react';
import { Download, Share, X } from 'lucide-react';
import Modal from './Modal';
import { usePwaInstall } from '../lib/usePwaInstall';

const DISMISS_KEY = 'sp-install-dismissed-until';
const DISMISS_DAYS = 7;

function readDismissed(): boolean {
  try {
    const until = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
    return Date.now() < until;
  } catch {
    return false;
  }
}

/** Botão discreto para instalar o PWA (Android/desktop) ou, no iPhone, o passo a passo do Safari. */
export default function InstallPrompt() {
  const { installed, canPrompt, showIosHint, promptInstall } = usePwaInstall();
  const [dismissed, setDismissed] = useState(readDismissed);
  const [showIosSteps, setShowIosSteps] = useState(false);

  useEffect(() => {
    if (canPrompt || showIosHint) setDismissed(readDismissed());
  }, [canPrompt, showIosHint]);

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_DAYS * 86_400_000));
    } catch {
      /* modo privado: sem problema, só não lembra na próxima visita */
    }
  }

  if (installed || dismissed || (!canPrompt && !showIosHint)) return null;

  return (
    <>
      <div className="install-banner">
        <span>Instale o app para abrir mais rápido e em tela cheia.</span>
        <div className="install-banner-actions">
          {canPrompt ? (
            <button className="btn small primary" onClick={() => void promptInstall()}>
              <Download size={14} aria-hidden="true" />
              Instalar app
            </button>
          ) : (
            <button className="btn small primary" onClick={() => setShowIosSteps(true)}>
              <Share size={14} aria-hidden="true" />
              Como instalar
            </button>
          )}
          <button className="icon-btn" onClick={dismiss} aria-label="Dispensar">
            <X size={16} />
          </button>
        </div>
      </div>

      {showIosSteps && (
        <Modal title="Instalar no iPhone" onClose={() => setShowIosSteps(false)}>
          <ol className="ios-steps">
            <li>
              Toque no ícone <strong>Compartilhar</strong> <Share size={14} aria-hidden="true" /> na barra do Safari.
            </li>
            <li>
              Escolha <strong>Adicionar à Tela de Início</strong>.
            </li>
            <li>
              Toque em <strong>Adicionar</strong>. Pronto — o app abre como um aplicativo normal.
            </li>
          </ol>
        </Modal>
      )}
    </>
  );
}
