import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, ListOrdered, Loader2, X } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { ordemDaArvore, ordenarQuestoes } from '../lib/ordemQuestoes';
import { useAvisos } from '../components/Avisos';

// Janela do admin para definir a ordem das questões de um assunto (a "lista").
// É a ordem e a numeração que o aluno vê no Banco de Questões.
export default function OrdenarQuestoes({ turmaId, turmas = [], onFechar }) {
  const avisos = useAvisos();
  const [assuntos, setAssuntos] = useState([]);
  const [assuntoId, setAssuntoId] = useState('');
  const [lista, setLista] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [alterada, setAlterada] = useState(false);

  useEffect(() => {
    let query = supabase
      .from('assuntos_hierarquia')
      .select('id, nome, categoria_pai_id, turma_id, created_at')
      .order('created_at', { ascending: true });
    if (turmaId) query = query.eq('turma_id', turmaId);
    query.then(({ data }) => setAssuntos(data ?? []));
  }, [turmaId]);

  // Assuntos na mesma ordem da árvore do aluno, com recuo para as subpastas.
  const opcoes = useMemo(() => {
    const posicao = ordemDaArvore(assuntos);
    const porId = Object.fromEntries(assuntos.map((a) => [a.id, a]));
    const nivel = (a) => {
      let n = 0;
      let pai = porId[a.categoria_pai_id];
      while (pai && n < 5) { n += 1; pai = porId[pai.categoria_pai_id]; }
      return n;
    };
    const nomeTurma = (id) => turmas.find((t) => t.id === id)?.nome;
    return [...assuntos]
      .sort((a, b) => (posicao[a.id] ?? 1e9) - (posicao[b.id] ?? 1e9))
      .map((a) => ({
        id: a.id,
        rotulo: `${'   '.repeat(nivel(a))}${a.nome}${!turmaId && !a.categoria_pai_id && nomeTurma(a.turma_id) ? ` (${nomeTurma(a.turma_id)})` : ''}`,
      }));
  }, [assuntos, turmas, turmaId]);

  useEffect(() => {
    if (!assuntoId) { setLista([]); return; }
    setCarregando(true);
    setAlterada(false);
    supabase
      .from('questoes')
      .select('id, enunciado, assunto_id, ordem, created_at, dificuldade')
      .eq('assunto_id', assuntoId)
      .then(({ data, error }) => {
        if (error) avisos.erro('Não foi possível carregar as questões desse assunto.');
        setLista(ordenarQuestoes(data ?? []));
        setCarregando(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assuntoId]);

  const mover = (i, delta) => {
    const j = i + delta;
    if (j < 0 || j >= lista.length) return;
    const nova = [...lista];
    [nova[i], nova[j]] = [nova[j], nova[i]];
    setLista(nova);
    setAlterada(true);
  };

  const salvar = async () => {
    setSalvando(true);
    const { error } = await supabase.rpc('reordenar_questoes', { p_ids: lista.map((q) => q.id) });
    setSalvando(false);
    if (error) {
      avisos.erro('Não foi possível salvar a ordem. Tente de novo.');
      return;
    }
    setAlterada(false);
    avisos.sucesso('Ordem salva! Os alunos já veem as questões nessa ordem.');
  };

  const fechar = async () => {
    if (alterada && !(await avisos.confirmar({
      titulo: 'Sair sem salvar?',
      mensagem: 'A nova ordem ainda não foi salva.',
      confirmarTexto: 'Sair sem salvar',
      perigo: true,
    }))) return;
    onFechar();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" aria-label="Fechar" onClick={fechar} className="absolute inset-0 bg-slate-950/50 cursor-default" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ordenar-titulo"
        className="relative w-full max-w-2xl max-h-[90vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-slate-100 flex items-start justify-between gap-4">
          <div>
            <h2 id="ordenar-titulo" className="text-lg font-black text-slate-900 flex items-center gap-2">
              <ListOrdered className="w-5 h-5 text-brand-orange" /> Ordenar questões
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Escolha o assunto e use as setas. A posição vira o número da questão no Banco de Questões do aluno.
            </p>
          </div>
          <button type="button" onClick={fechar} aria-label="Fechar" className="p-1.5 text-slate-400 hover:text-slate-700 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-4 border-b border-slate-100">
          <div className="relative">
            <select
              aria-label="Assunto"
              value={assuntoId}
              onChange={(e) => setAssuntoId(e.target.value)}
              className="w-full appearance-none bg-white border border-slate-200 rounded-xl py-2.5 pl-4 pr-10 text-sm font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-brand-orange focus:border-brand-orange cursor-pointer"
            >
              <option value="">Escolha um assunto…</option>
              {opcoes.map((o) => <option key={o.id} value={o.id}>{o.rotulo}</option>)}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {!assuntoId ? (
            <p className="text-sm text-slate-500 text-center py-10">Escolha um assunto para ver as questões dele.</p>
          ) : carregando ? (
            <div className="flex items-center justify-center gap-2 py-10 text-slate-400"><Loader2 className="w-5 h-5 animate-spin" /> Carregando…</div>
          ) : lista.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-10">Nenhuma questão cadastrada nesse assunto.</p>
          ) : (
            <ol className="space-y-2">
              {lista.map((q, i) => (
                <li key={q.id} className="flex items-center gap-3 p-2.5 rounded-xl border border-slate-200 bg-white">
                  <span className="w-9 h-9 rounded-lg bg-orange-50 text-brand-orange font-black text-sm flex items-center justify-center shrink-0">{i + 1}</span>
                  <p className="flex-1 min-w-0 text-sm font-medium text-slate-700 truncate">{q.enunciado || 'Questão sem texto (só imagem/blocos)'}</p>
                  <div className="flex gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => mover(i, -1)}
                      disabled={i === 0}
                      aria-label={`Subir questão ${i + 1}`}
                      className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-brand-orange disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                    >
                      <ArrowUp className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => mover(i, 1)}
                      disabled={i === lista.length - 1}
                      aria-label={`Descer questão ${i + 1}`}
                      className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-brand-orange disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                    >
                      <ArrowDown className="w-4 h-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2">
          <button type="button" onClick={fechar} className="px-5 py-2.5 rounded-xl text-sm font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 cursor-pointer">
            Fechar
          </button>
          <button
            type="button"
            onClick={salvar}
            disabled={!alterada || salvando}
            className="px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-brand-orange hover:bg-orange-800 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center gap-2"
          >
            {salvando && <Loader2 className="w-4 h-4 animate-spin" />} Salvar ordem
          </button>
        </div>
      </div>
    </div>
  );
}
