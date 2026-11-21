import React, { useEffect, useRef } from 'react';

// Botões numerados para ir direto a uma questão (1, 2, 3...).
// Computador: coluna fixa ao lado da questão. Celular (horizontal): faixa que arrasta para o lado.
// O botão da questão aberta fica destacado e sempre visível na coluna/faixa.
export default function NavegadorQuestoes({ total, atual, onIr, horizontal = false, className = '' }) {
  const atualRef = useRef(null);

  useEffect(() => {
    atualRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [atual]);

  const botoes = Array.from({ length: total }, (_, i) => {
    const ativo = i === atual;
    return (
      <button
        key={i}
        ref={ativo ? atualRef : null}
        type="button"
        onClick={() => onIr(i)}
        aria-label={`Questão ${i + 1}`}
        aria-current={ativo ? 'true' : undefined}
        className={`shrink-0 w-10 h-10 rounded-xl text-sm font-black transition-colors cursor-pointer ${
          ativo
            ? 'bg-brand-orange text-white shadow-sm'
            : 'bg-white border border-slate-200 text-slate-600 hover:border-brand-orange hover:text-brand-orange'
        }`}
      >
        {i + 1}
      </button>
    );
  });

  if (horizontal) {
    return (
      <nav aria-label="Ir para a questão" className={`bg-[#f3f4f6]/95 backdrop-blur border-b border-slate-200 ${className}`}>
        <div className="flex gap-2 overflow-x-auto px-4 py-2.5">{botoes}</div>
      </nav>
    );
  }

  return (
    <nav
      aria-label="Ir para a questão"
      className={`w-[76px] bg-white border-r border-slate-200 shrink-0 flex-col ${className}`}
    >
      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center pt-4 pb-2">Questões</p>
      <div className="flex-1 overflow-y-auto flex flex-col items-center gap-2 px-2 pb-4">{botoes}</div>
    </nav>
  );
}
