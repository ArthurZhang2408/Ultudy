'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface ModalContextType {
  registerModal: (id: string) => void;
  unregisterModal: (id: string) => void;
  isAnyModalOpen: boolean;
}

const ModalContext = createContext<ModalContextType | undefined>(undefined);

export function ModalProvider({ children }: { children: ReactNode }) {
  const [openModals, setOpenModals] = useState<Set<string>>(new Set());

  const registerModal = (id: string) => {
    setOpenModals(prev => new Set(prev).add(id));
  };

  const unregisterModal = (id: string) => {
    setOpenModals(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const isAnyModalOpen = openModals.size > 0;

  return (
    <ModalContext.Provider value={{ registerModal, unregisterModal, isAnyModalOpen }}>
      {children}
    </ModalContext.Provider>
  );
}

export function useModal(isOpen: boolean, id?: string) {
  const context = useContext(ModalContext);
  if (!context) {
    throw new Error('useModal must be used within ModalProvider');
  }

  const modalId = id || `modal-${Math.random().toString(36).substr(2, 9)}`;

  useEffect(() => {
    if (isOpen) {
      context.registerModal(modalId);
      return () => context.unregisterModal(modalId);
    }
  }, [isOpen, modalId, context]);

  return context;
}
