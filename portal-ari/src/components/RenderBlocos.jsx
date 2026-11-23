import React from 'react';

// Renderiza um array de blocos [{tipo, valor}].
//
// Padrão (alternativas): texto e imagem na mesma linha, imagem pequena (altura imgHeight).
// imagensGrandes (enunciado): cada imagem fica na linha dela, centralizada e no tamanho
// do Gráfico / Tabela Central — sem distorcer a proporção original da figura.
export default function RenderBlocos({ blocos, imgHeight = 'h-12', placeholder, imagensGrandes = false }) {
  if (!blocos || blocos.length === 0) {
    return placeholder ? <span className="text-slate-300 italic">{placeholder}</span> : null;
  }

  if (imagensGrandes) {
    return (
      <span className="block">
        {blocos.map((b, i) =>
          b.tipo === 'imagem' ? (
            b.valor ? (
              <img
                key={i}
                src={b.valor}
                alt="Imagem da questão"
                className="block mx-auto my-4 max-h-72 max-w-full w-auto h-auto object-contain rounded-xl border border-slate-200 bg-white p-1"
              />
            ) : null
          ) : (
            <span key={i} className="whitespace-pre-wrap">{b.valor}</span>
          )
        )}
      </span>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 align-middle">
      {blocos.map((b, i) =>
        b.tipo === 'imagem' ? (
          b.valor ? (
            <img
              key={i}
              src={b.valor}
              alt="Imagem da questão"
              className={`${imgHeight} w-auto object-contain rounded border border-slate-200 bg-white p-0.5 inline-block align-middle`}
            />
          ) : null
        ) : (
          <span key={i}>{b.valor}</span>
        )
      )}
    </span>
  );
}
