import React from 'react';
import TextoComFormulas from './TextoComFormulas';

// Renderiza um array de blocos.
//
// Tipos de bloco:
//   { tipo: 'texto',  valor }                 texto; fórmulas em LaTeX entre $...$ viram fórmula desenhada
//   { tipo: 'imagem', valor: url, tamanho? }  tamanho 'm' = média (figura de alternativa importada do PDF)
//   { tipo: 'tabela', valor, cabecalho? }     uma linha por linha da tabela, células separadas por "|"
//                                             cabecalho: 'linha' (1ª linha, padrão) ou 'coluna' (1ª coluna)
//
// Padrão (alternativas): texto e imagem na mesma linha, imagem pequena (altura imgHeight).
// imagensGrandes (enunciado): cada imagem fica na linha dela, centralizada e no tamanho
// do Gráfico / Tabela Central — sem distorcer a proporção original da figura.

export function TabelaBloco({ valor, cabecalho = 'linha' }) {
  const linhas = String(valor || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.split('|').map((c) => c.trim()));
  if (linhas.length === 0) return null;

  return (
    <span className="block w-full overflow-x-auto my-3">
      <table className="mx-auto border-collapse text-sm">
        <tbody>
          {linhas.map((celulas, i) => (
            <tr key={i}>
              {celulas.map((c, j) => {
                const eCabecalho = cabecalho === 'coluna' ? j === 0 : i === 0;
                const Tag = eCabecalho ? 'th' : 'td';
                return (
                  <Tag
                    key={j}
                    scope={eCabecalho ? (cabecalho === 'coluna' ? 'row' : 'col') : undefined}
                    className={`border border-slate-300 px-3 py-1.5 text-center ${
                      eCabecalho ? 'bg-brand-orange text-white font-bold' : 'bg-white text-slate-800'
                    }`}
                  >
                    <TextoComFormulas texto={c} />
                  </Tag>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </span>
  );
}

export default function RenderBlocos({ blocos, imgHeight = 'h-12', placeholder, imagensGrandes = false }) {
  if (!blocos || blocos.length === 0) {
    return placeholder ? <span className="text-slate-300 italic">{placeholder}</span> : null;
  }

  if (imagensGrandes) {
    return (
      <span className="block">
        {blocos.map((b, i) => {
          if (b.tipo === 'tabela') return <TabelaBloco key={i} valor={b.valor} cabecalho={b.cabecalho} />;
          if (b.tipo === 'imagem') {
            return b.valor ? (
              <img
                key={i}
                src={b.valor}
                alt="Imagem da questão"
                className="block mx-auto my-4 max-h-72 max-w-full w-auto h-auto object-contain rounded-xl border border-slate-200 bg-white p-1"
              />
            ) : null;
          }
          return (
            <span key={i} className="whitespace-pre-wrap">
              <TextoComFormulas texto={b.valor} />
            </span>
          );
        })}
      </span>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 align-middle">
      {blocos.map((b, i) => {
        if (b.tipo === 'tabela') return <TabelaBloco key={i} valor={b.valor} cabecalho={b.cabecalho} />;
        if (b.tipo === 'imagem') {
          return b.valor ? (
            <img
              key={i}
              src={b.valor}
              alt="Imagem da questão"
              className={`${b.tamanho === 'm' ? 'h-24 md:h-28' : imgHeight} w-auto max-w-full object-contain rounded border border-slate-200 bg-white p-0.5 inline-block align-middle`}
            />
          ) : null;
        }
        return (
          <span key={i}>
            <TextoComFormulas texto={b.valor} />
          </span>
        );
      })}
    </span>
  );
}
