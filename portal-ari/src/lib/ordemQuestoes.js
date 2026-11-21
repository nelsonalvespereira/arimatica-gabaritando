// Ordem das questões no Banco de Questões.
//
// 1. Pela posição do assunto na árvore (a mesma ordem da lista de assuntos do filtro:
//    pasta, as subpastas dela, depois a próxima pasta).
// 2. Dentro do assunto, pela `ordem` que o professor definiu no admin.
// 3. Questões ainda sem ordem vão para o fim do assunto, da mais antiga para a mais nova.

export function ordemDaArvore(arvore = []) {
  const filhos = new Map();
  for (const a of arvore) {
    const pai = a.categoria_pai_id ?? null;
    if (!filhos.has(pai)) filhos.set(pai, []);
    filhos.get(pai).push(a.id);
  }

  const posicao = {};
  const visitar = (id) => {
    if (id in posicao) return;
    posicao[id] = Object.keys(posicao).length;
    for (const f of filhos.get(id) ?? []) visitar(f);
  };
  for (const raiz of filhos.get(null) ?? []) visitar(raiz);
  return posicao;
}

export function ordenarQuestoes(questoes = [], arvore = []) {
  const posicao = ordemDaArvore(arvore);
  const pos = (q) => posicao[q.assunto_id] ?? Number.MAX_SAFE_INTEGER;
  const ord = (q) => (q.ordem == null ? Number.MAX_SAFE_INTEGER : q.ordem);

  return [...questoes].sort(
    (a, b) =>
      pos(a) - pos(b) ||
      ord(a) - ord(b) ||
      String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''))
  );
}
