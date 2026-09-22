import { createContext, useContext } from 'react';

interface PendingCountValue {
  count: number;
  setCount: (n: number) => void;
}

/** Contador de professores pendentes, compartilhado entre o badge do menu (Layout),
 * o aviso do Painel (AdminDashboard) e a lista (AdminProfessors), para ficarem em sincronia
 * sem duplicar buscas. Provider vive no Layout (só monta em telas de admin). */
export const PendingCountCtx = createContext<PendingCountValue>({ count: 0, setCount: () => {} });

export const usePendingCount = () => useContext(PendingCountCtx);
