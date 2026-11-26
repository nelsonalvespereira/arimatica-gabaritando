import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  FileUp, Loader2, ArrowLeft, Crop, Trash2, Eye, EyeOff, AlertTriangle, CheckCircle2, Sparkles, X, Plus, FileText,
} from 'lucide-react';
import AdminSidebar from './AdminSidebar';
import { useTurmas } from '../hooks/useAdmin';
import { supabase } from '../lib/supabaseClient';
import { useAvisos } from '../components/Avisos';
import RenderBlocos from '../components/RenderBlocos';
import { ordemDaArvore } from '../lib/ordemQuestoes';
import {
  abrirPdf, renderizarPagina, imagemComGrade, lerPdfComIA, mesclarResultados, recortar, canvasParaBlob, textosDasPaginas,
} from '../lib/importarPdf';
import { lerNumeros, acharPaginas, montarLotes } from '../lib/selecaoQuestoes';

let proximaFonte = 1;
const novaFonte = () => ({ id: proximaFonte++, arquivo: null, totalPaginas: 0, numeros: '', de: 1, ate: 1, erro: '' });

const DIFICULDADES = [
  { valor: 'facil', rotulo: 'Fácil' },
  { valor: 'medio', rotulo: 'Médio' },
  { valor: 'dificil', rotulo: 'Difícil' },
];
// Preço do Claude Sonnet 5.5 (US$ por milhão de tokens) — só para mostrar a estimativa.
const PRECO = { entrada: 2, saida: 10 };

// ---------------------------------------------------------------------------
// Janela para redesenhar o recorte de uma figura arrastando o mouse sobre a página.
function AjusteRecorte({ canvas, regiao, onConfirmar, onCancelar }) {
  const imagem = useMemo(() => {
    const c = document.createElement('canvas');
    const escala = Math.min(1, 900 / canvas.width);
    c.width = Math.round(canvas.width * escala);
    c.height = Math.round(canvas.height * escala);
    c.getContext('2d').drawImage(canvas, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.85);
  }, [canvas]);
  const [r, setR] = useState(regiao);
  const area = useRef(null);
  const inicio = useRef(null);
  const caixa = useRef(null);

  const pos = (e) => {
    const b = area.current.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(100, ((e.clientX - b.left) / b.width) * 100)),
      y: Math.max(0, Math.min(100, ((e.clientY - b.top) / b.height) * 100)),
    };
  };
  const baixar = (e) => { e.preventDefault(); area.current.setPointerCapture(e.pointerId); const p = pos(e); inicio.current = p; setR({ ...r, x0: p.x, y0: p.y, x1: p.x, y1: p.y }); };
  const mover = (e) => { if (!inicio.current) return; const p = pos(e); setR((v) => ({ ...v, x0: inicio.current.x, y0: inicio.current.y, x1: p.x, y1: p.y })); };
  const soltar = () => { inicio.current = null; };

  const x0 = Math.min(r.x0, r.x1), x1 = Math.max(r.x0, r.x1), y0 = Math.min(r.y0, r.y1), y1 = Math.max(r.y0, r.y1);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[92vh] flex flex-col">
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
          <div>
            <p className="font-black text-slate-900">Ajustar recorte</p>
            <p className="text-xs text-slate-500">Clique e arraste sobre a página para marcar a figura.</p>
          </div>
          <button type="button" onClick={onCancelar} className="p-2 text-slate-400 hover:text-slate-700" aria-label="Fechar"><X className="w-5 h-5" /></button>
        </div>
        <div className="overflow-auto p-4 bg-slate-100">
          <div
            ref={area}
            onPointerDown={baixar}
            onPointerMove={mover}
            onPointerUp={soltar}
            className="relative mx-auto select-none touch-none cursor-crosshair"
            style={{ width: 'min(100%, 760px)' }}
          >
            <img src={imagem} alt="Página do PDF" className="w-full block pointer-events-none" draggable={false} onLoad={() => caixa.current?.scrollIntoView({ block: 'center' })} />
            <div
              ref={caixa}
              className="absolute border-2 border-brand-orange bg-brand-orange/10"
              style={{ left: `${x0}%`, top: `${y0}%`, width: `${x1 - x0}%`, height: `${y1 - y0}%` }}
            />
          </div>
        </div>
        <div className="px-5 py-3 border-t border-slate-200 flex justify-end gap-2">
          <button type="button" onClick={onCancelar} className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-lg">Cancelar</button>
          <button type="button" onClick={() => onConfirmar({ ...r, x0, y0, x1, y1 })} disabled={x1 - x0 < 0.5 || y1 - y0 < 0.5} className="px-4 py-2 text-sm font-bold text-white bg-brand-orange hover:bg-brand-orangeHover disabled:bg-slate-300 rounded-lg">Usar este recorte</button>
        </div>
      </div>
    </div>
  );
}

// Miniatura de uma região recortada.
function Miniatura({ canvases, regiao, altura = 'max-h-48' }) {
  const url = useMemo(() => {
    const c = canvases[regiao.pagina - 1];
    if (!c) return null;
    return recortar(c, regiao).toDataURL('image/png');
  }, [canvases, regiao]);
  if (!url) return <span className="text-xs text-red-600">Página {regiao.pagina} não encontrada</span>;
  return <img src={url} alt="Figura recortada" className={`${altura} max-w-full w-auto border border-slate-200 rounded bg-white`} />;
}

// ---------------------------------------------------------------------------
// Cartão de revisão de uma questão.
function RevisaoQuestao({ q, canvases, onMudar, onAjustar }) {
  const [verPrevia, setVerPrevia] = useState(false);
  const mudar = (campo, valor) => onMudar({ ...q, [campo]: valor });
  const mudarBloco = (i, novo) => mudar('enunciado', q.enunciado.map((b, j) => (j === i ? novo : b)));
  const tirarBloco = (i) => mudar('enunciado', q.enunciado.filter((_, j) => j !== i));
  const mudarAlt = (i, novo) => mudar('alternativas', q.alternativas.map((a, j) => (j === i ? novo : a)));

  // Prévia: as figuras entram como imagens recortadas (data URL).
  const previa = useMemo(() => {
    if (!verPrevia) return null;
    const blocos = q.enunciado.map((b) => {
      if (b.tipo === 'figura' && b.regiao && canvases[b.regiao.pagina - 1]) {
        return { tipo: 'imagem', tamanho: 'g', valor: recortar(canvases[b.regiao.pagina - 1], b.regiao).toDataURL('image/png') };
      }
      if (b.tipo === 'tabela') return { tipo: 'tabela', valor: b.texto, cabecalho: b.cabecalho || 'linha' };
      return { tipo: 'texto', valor: b.texto || '' };
    });
    return blocos;
  }, [verPrevia, q.enunciado, canvases]);

  const semResposta = !q.resposta;

  return (
    <article className={`bg-white border rounded-2xl overflow-hidden ${q.incluir ? 'border-slate-200' : 'border-slate-200 opacity-50'}`}>
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 bg-slate-50 border-b border-slate-100">
        <label className="flex items-center gap-2 text-sm font-bold text-slate-700 mr-2">
          <input type="checkbox" checked={q.incluir} onChange={(e) => mudar('incluir', e.target.checked)} className="w-4 h-4 accent-brand-orange" />
          <span className="inline-flex items-center justify-center min-w-7 h-6 px-1.5 rounded-md bg-brand-orange text-white text-xs font-black">{q.numero}</span>
        </label>
        {q.fonteNome && <span className="text-xs font-medium text-slate-500 max-w-48 truncate" title={q.fonteNome}>{q.fonteNome}</span>}
        <input value={q.banca} onChange={(e) => mudar('banca', e.target.value)} placeholder="Banca" className="w-36 px-2 py-1 text-sm border border-slate-200 rounded-md" aria-label="Banca" />
        <select value={q.dificuldade} onChange={(e) => mudar('dificuldade', e.target.value)} className="px-2 py-1 text-sm border border-slate-200 rounded-md" aria-label="Dificuldade">
          {DIFICULDADES.map((d) => <option key={d.valor} value={d.valor}>{d.rotulo}</option>)}
        </select>
        <label className={`flex items-center gap-1.5 text-sm font-bold ${semResposta ? 'text-red-600' : 'text-slate-600'}`}>
          Resposta
          <select value={q.resposta} onChange={(e) => mudar('resposta', e.target.value)} className={`px-2 py-1 text-sm border rounded-md ${semResposta ? 'border-red-400 bg-red-50' : 'border-slate-200'}`}>
            <option value="">—</option>
            {q.alternativas.map((a) => <option key={a.letra} value={a.letra}>{a.letra}</option>)}
          </select>
        </label>
        <button type="button" onClick={() => setVerPrevia((v) => !v)} className="ml-auto inline-flex items-center gap-1.5 text-sm font-bold text-slate-600 hover:text-brand-orange">
          {verPrevia ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />} {verPrevia ? 'Editar' : 'Ver como o aluno vê'}
        </button>
      </div>

      {verPrevia ? (
        <div className="p-4 md:p-5 text-[15px] text-slate-800 leading-relaxed">
          <RenderBlocos blocos={previa} imagensGrandes />
          <div className="mt-3 space-y-1.5">
            {q.alternativas.map((a) => (
              <div key={a.letra} className={`flex items-center gap-2 p-2 rounded-lg border ${a.letra === q.resposta ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200'}`}>
                <span className="text-xs font-black text-slate-500 w-5">{a.letra.toLowerCase()})</span>
                {a.regiao ? <Miniatura canvases={canvases} regiao={a.regiao} altura="max-h-24" /> : <RenderBlocos blocos={[{ tipo: 'texto', valor: a.texto }]} />}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="p-4 md:p-5 space-y-3">
          {q.enunciado.map((b, i) => (
            <div key={i} className="flex items-start gap-2">
              <div className="flex-1">
                {b.tipo === 'figura' && b.regiao ? (
                  <div className="flex items-end gap-3 flex-wrap">
                    <Miniatura canvases={canvases} regiao={b.regiao} />
                    <button type="button" onClick={() => onAjustar(b.regiao, (r) => mudarBloco(i, { ...b, regiao: r }))} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-orange-50 text-brand-orange rounded-lg hover:bg-orange-100">
                      <Crop className="w-3.5 h-3.5" /> Ajustar recorte
                    </button>
                  </div>
                ) : (
                  <textarea
                    value={b.texto || ''}
                    onChange={(e) => mudarBloco(i, { ...b, texto: e.target.value })}
                    rows={b.tipo === 'tabela' ? 3 : Math.min(8, Math.max(2, Math.ceil((b.texto || '').length / 95)))}
                    className={`w-full p-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-brand-orange ${b.tipo === 'tabela' ? 'font-mono' : ''}`}
                    aria-label={b.tipo === 'tabela' ? 'Tabela' : 'Texto do enunciado'}
                  />
                )}
                {b.tipo === 'tabela' && <p className="text-[11px] text-slate-400">Tabela: uma linha por linha, células separadas por |</p>}
              </div>
              <button type="button" onClick={() => tirarBloco(i)} className="p-1.5 text-red-400 hover:text-red-600" aria-label="Tirar este bloco"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}

          <div className="grid sm:grid-cols-2 gap-2 pt-1">
            {q.alternativas.map((a, i) => (
              <div key={a.letra} className="flex items-start gap-2">
                <span className={`mt-1.5 w-6 h-6 shrink-0 rounded-md text-xs font-black flex items-center justify-center ${a.letra === q.resposta ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-500'}`}>{a.letra}</span>
                {a.regiao ? (
                  <div className="flex items-end gap-2">
                    <Miniatura canvases={canvases} regiao={a.regiao} altura="max-h-24" />
                    <button type="button" onClick={() => onAjustar(a.regiao, (r) => mudarAlt(i, { ...a, regiao: r }))} className="p-1.5 text-brand-orange hover:bg-orange-50 rounded-md" aria-label="Ajustar recorte"><Crop className="w-4 h-4" /></button>
                  </div>
                ) : (
                  <input value={a.texto} onChange={(e) => mudarAlt(i, { ...a, texto: e.target.value })} className="flex-1 px-2 py-1.5 text-sm border border-slate-200 rounded-lg outline-none focus:border-brand-orange" aria-label={`Alternativa ${a.letra}`} />
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}

// ---------------------------------------------------------------------------
export default function AdminImportarQuestoes() {
  const avisos = useAvisos();
  const navigate = useNavigate();
  const { turmas: turmasBrutas } = useTurmas();
  const turmas = useMemo(() => [...turmasBrutas].sort((a, b) => String(a.nome).localeCompare(String(b.nome))), [turmasBrutas]);

  const [turmaId, setTurmaId] = useState('');
  const [fontes, setFontes] = useState(() => [novaFonte()]); // um item por PDF
  const [avisoLeitura, setAvisoLeitura] = useState('');
  const [etapa, setEtapa] = useState('escolher'); // escolher | lendo | revisar | salvando
  const [progresso, setProgresso] = useState('');
  const [erro, setErro] = useState('');
  const [canvasesPorFonte, setCanvasesPorFonte] = useState([]); // [fonte][página - 1]
  const [lista, setLista] = useState({ titulo: '', subtitulo: '' });
  const [questoes, setQuestoes] = useState([]);
  const [uso, setUso] = useState(null);
  const [cortado, setCortado] = useState(false);
  const [assuntos, setAssuntos] = useState([]);
  const [assuntoId, setAssuntoId] = useState('novo');
  const [ajuste, setAjuste] = useState(null); // { canvas, regiao, aplicar }

  useEffect(() => { if (!turmaId && turmas.length) setTurmaId(turmas[0].id); }, [turmas, turmaId]);
  useEffect(() => {
    if (!turmaId) return;
    supabase.from('assuntos_hierarquia').select('id, nome, categoria_pai_id, created_at').eq('turma_id', turmaId).order('created_at')
      .then(({ data }) => setAssuntos(data || []));
  }, [turmaId]);

  const mudarFonte = (id, campos) => setFontes((fs) => fs.map((f) => (f.id === id ? { ...f, ...campos } : f)));

  // Ao escolher o arquivo, descobre quantas páginas ele tem.
  const escolherArquivo = async (id, file) => {
    mudarFonte(id, { arquivo: file, totalPaginas: 0, erro: '' });
    if (!file) return;
    try {
      const pdf = await abrirPdf(file);
      mudarFonte(id, { totalPaginas: pdf.numPages, de: 1, ate: pdf.numPages });
    } catch {
      mudarFonte(id, { erro: 'Não foi possível abrir este PDF.' });
    }
  };

  const fontesProntas = fontes.filter((f) => f.arquivo && f.totalPaginas);

  // Lê todos os PDFs. Em cada um: só as questões pedidas (pelo número) ou o intervalo de páginas.
  const ler = async () => {
    if (!fontesProntas.length || !turmaId) return;
    setErro('');
    setAvisoLeitura('');
    setEtapa('lendo');
    try {
      const telasPorFonte = [];
      const todas = [];
      const alertas = [];
      const usoTotal = { entrada: 0, saida: 0 };
      let algumCortado = false;
      let tituloSugerido = '';

      for (let fi = 0; fi < fontesProntas.length; fi += 1) {
        const f = fontesProntas[fi];
        const nome = f.arquivo.name.replace(/\.pdf$/i, '');
        const prefixo = fontesProntas.length > 1 ? `PDF ${fi + 1} de ${fontesProntas.length} — ` : '';
        setProgresso(`${prefixo}Abrindo ${nome}…`);
        const pdf = await abrirPdf(f.arquivo);
        const numeros = lerNumeros(f.numeros);

        // Quais páginas mandar para a IA.
        let paginas;
        let naoAchadas = [];
        if (numeros.length) {
          setProgresso(`${prefixo}Procurando as questões ${f.numeros.trim()}…`);
          const { pagina, faltando } = acharPaginas(await textosDasPaginas(pdf), numeros);
          if (faltando.length === numeros.length) {
            throw new Error(`${nome}: não achei nenhuma das questões (${f.numeros.trim()}) no texto do PDF. Se o PDF for escaneado, deixe o campo de números vazio e escolha as páginas.`);
          }
          naoAchadas = faltando;
          if (faltando.length) alertas.push(`${nome}: não achei no PDF a(s) questão(ões) ${faltando.join(', ')}.`);
          paginas = Object.values(pagina);
        } else {
          const de = Math.max(1, Math.min(f.de, pdf.numPages));
          const ate = Math.max(de, Math.min(f.ate, pdf.numPages));
          paginas = Array.from({ length: ate - de + 1 }, (_, k) => de + k);
        }

        // Desenha as páginas que vão para a IA (mais a seguinte de cada lote, como contexto).
        const lotes = montarLotes(paginas, pdf.numPages);
        const desenhar = [...new Set(lotes.flatMap((l) => [...l.extrair, ...l.contexto]))].sort((a, b) => a - b);
        if (desenhar.length > 40) throw new Error(`${nome}: são páginas demais de uma vez (máximo de 40). Divida em partes.`);
        const telas = new Array(pdf.numPages).fill(null);
        const grades = new Array(pdf.numPages).fill(null);
        for (let k = 0; k < desenhar.length; k += 1) {
          const n = desenhar[k];
          setProgresso(`${prefixo}Preparando as páginas (${k + 1} de ${desenhar.length})…`);
          const c = await renderizarPagina(pdf, n);
          telas[n - 1] = c;
          grades[n - 1] = imagemComGrade(c);
        }
        telasPorFonte[fi] = telas;

        const resultados = await lerPdfComIA(grades, ({ feitos, total }) =>
          setProgresso(`${prefixo}Lendo as questões com IA (${feitos} de ${total} partes)… pode levar alguns minutos.`), 3, paginas);
        const r = mesclarResultados(resultados);
        usoTotal.entrada += r.uso.entrada;
        usoTotal.saida += r.uso.saida;
        algumCortado = algumCortado || r.cortado;
        if (!tituloSugerido) tituloSugerido = r.titulo || '';

        let doPdf = r.questoes;
        if (numeros.length) {
          // Só as pedidas, na ordem em que foram digitadas.
          const porNumero = new Map(doPdf.map((q) => [q.numero, q]));
          const naoVieram = numeros.filter((n) => !porNumero.has(n) && !naoAchadas.includes(n));
          if (naoVieram.length) alertas.push(`${nome}: a IA não trouxe a(s) questão(ões) ${naoVieram.join(', ')}.`);
          doPdf = numeros.filter((n) => porNumero.has(n)).map((n) => porNumero.get(n));
        }
        doPdf.forEach((q) => todas.push({ ...q, fonte: fi, fonteNome: nome, chave: `${fi}-${q.numero}` }));
      }

      if (!todas.length) throw new Error('Nenhuma questão encontrada.');
      setCanvasesPorFonte(telasPorFonte);
      setLista({ titulo: fontesProntas.length === 1 ? (tituloSugerido || fontesProntas[0].arquivo.name.replace(/\.pdf$/i, '')) : '', subtitulo: '' });
      setQuestoes(todas);
      setUso(usoTotal);
      setCortado(algumCortado);
      setAvisoLeitura(alertas.join(' '));
      setEtapa('revisar');
    } catch (e) {
      console.error(e);
      setErro(e.message || 'Não foi possível ler o PDF.');
      setEtapa('escolher');
    }
  };

  // Assuntos na mesma ordem da árvore do aluno, com recuo para as subpastas.
  const assuntosArvore = useMemo(() => {
    const posicao = ordemDaArvore(assuntos);
    const porId = Object.fromEntries(assuntos.map((a) => [a.id, a]));
    const nivel = (a) => { let n = 0; let pai = porId[a.categoria_pai_id]; while (pai && n < 5) { n += 1; pai = porId[pai.categoria_pai_id]; } return n; };
    return [...assuntos]
      .sort((a, b) => (posicao[a.id] ?? 1e9) - (posicao[b.id] ?? 1e9))
      .map((a) => ({ id: a.id, nome: a.nome, rotulo: `${'\u00A0\u00A0\u00A0'.repeat(nivel(a))}${a.nome}` }));
  }, [assuntos]);

  const incluidas = questoes.filter((q) => q.incluir);
  const semResposta = incluidas.filter((q) => !q.resposta);
  const custo = uso ? (uso.entrada / 1e6) * PRECO.entrada + (uso.saida / 1e6) * PRECO.saida : 0;

  const enviarFigura = async (fonte, regiao, rotulo) => {
    const c = recortar(canvasesPorFonte[fonte][regiao.pagina - 1], regiao);
    const blob = await canvasParaBlob(c);
    const caminho = `${turmaId}/importadas/${Date.now()}-${rotulo}-${Math.random().toString(36).slice(2, 7)}.png`;
    const { error } = await supabase.storage.from('questoes_imagens').upload(caminho, blob, { contentType: 'image/png' });
    if (error) throw error;
    return supabase.storage.from('questoes_imagens').getPublicUrl(caminho).data.publicUrl;
  };

  const salvar = async () => {
    if (assuntoId === 'novo' && !lista.titulo.trim()) return avisos.erro('Dê um nome ao assunto novo.');
    if (!incluidas.length) return avisos.erro('Nenhuma questão marcada para importar.');
    if (semResposta.length) {
      const varios = new Set(incluidas.map((q) => q.fonte)).size > 1;
      return avisos.erro(`Falta a resposta das questões ${semResposta.map((q) => (varios ? `${q.numero} (${q.fonteNome})` : q.numero)).join(', ')}.`);
    }
    setEtapa('salvando');
    let salvas = 0;
    try {
      // Assunto: o escolhido ou um novo com o nome digitado.
      let idAssunto = assuntoId;
      let nomeAssunto = assuntos.find((a) => a.id === assuntoId)?.nome || lista.titulo.trim();
      if (assuntoId === 'novo') {
        const { data, error } = await supabase.from('assuntos_hierarquia').insert({ turma_id: turmaId, nome: lista.titulo.trim() }).select('id').single();
        if (error) throw error;
        idAssunto = data.id;
        nomeAssunto = lista.titulo.trim();
      }

      // Uma questão por vez, na ordem do PDF: sem ordem definida, elas aparecem
      // no fim do assunto pela ordem de cadastro (o professor pode reordenar depois).
      for (let i = 0; i < incluidas.length; i += 1) {
        const q = incluidas[i];
        setProgresso(`Salvando a questão ${i + 1} de ${incluidas.length}…`);
        const blocos = [];
        let k = 0;
        for (const b of q.enunciado) {
          if (b.tipo === 'figura' && b.regiao) blocos.push({ tipo: 'imagem', valor: await enviarFigura(q.fonte, b.regiao, `p${q.fonte}q${q.numero}-${k++}`) });
          else if (b.tipo === 'tabela') blocos.push({ tipo: 'tabela', valor: b.texto || '', cabecalho: b.cabecalho || 'linha' });
          else if ((b.texto || '').trim()) blocos.push({ tipo: 'texto', valor: b.texto.trim() });
        }
        const alternativas = [];
        for (const a of q.alternativas) {
          if (a.regiao) alternativas.push({ letra: a.letra, texto: '[FIGURA]', blocos: [{ tipo: 'imagem', tamanho: 'm', valor: await enviarFigura(q.fonte, a.regiao, `p${q.fonte}q${q.numero}${a.letra}`) }] });
          else alternativas.push({ letra: a.letra, texto: a.texto, blocos: [{ tipo: 'texto', valor: a.texto }] });
        }
        const enunciadoTexto = blocos.map((b) => (b.tipo === 'texto' ? b.valor : b.tipo === 'tabela' ? '[TABELA]' : '[IMAGEM]')).join(' ');

        const { data: nova, error } = await supabase.from('questoes').insert({
          turma_id: turmaId,
          materia: 'Matemática',
          assunto: nomeAssunto,
          assunto_id: idAssunto,
          dificuldade: q.dificuldade || 'medio',
          banca: q.banca || 'Inédita',
          ano: q.ano || null,
          enunciado: enunciadoTexto,
          blocos_enunciado: blocos,
          blocos_enunciado_superior: blocos,
          blocos_enunciado_inferior: [],
          alternativas,
        }).select('id').single();
        if (error) throw error;

        const { error: errGab } = await supabase.from('questoes_gabarito').insert({ questao_id: nova.id, resposta_correta: q.resposta });
        if (errGab) throw errGab;
        salvas += 1;
      }

      avisos.sucesso(`${incluidas.length} questões importadas para o assunto "${nomeAssunto}". Os alunos já podem ver no Banco de Questões.`);
      navigate('/admin/simulados-questoes');
    } catch (e) {
      console.error(e);
      avisos.erro(`Erro ao salvar: ${e.message || e}. ${salvas ? `${salvas} questões já foram salvas no banco.` : 'Nenhuma questão foi salva.'}`);
      setEtapa('revisar');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex font-sans">
      <AdminSidebar />
      <main className="flex-1 h-screen overflow-y-auto">
        <header className="h-16 bg-white border-b border-slate-200 px-6 md:px-8 flex items-center gap-3 sticky top-0 z-10">
          <Link to="/admin/simulados-questoes" className="p-2 -ml-2 text-slate-400 hover:text-slate-700" aria-label="Voltar"><ArrowLeft className="w-5 h-5" /></Link>
          <div className="w-9 h-9 bg-orange-50 text-brand-orange rounded-xl flex items-center justify-center shrink-0">
            <Sparkles className="w-[18px] h-[18px]" />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-900 leading-tight">Importar questões de PDF</h2>
            <p className="text-xs font-medium text-slate-500">A IA lê o PDF e monta as questões; você confere antes de salvar no Banco de Questões</p>
          </div>
        </header>

        <div className="p-6 md:p-8 max-w-4xl space-y-5">
          {(etapa === 'escolher' || etapa === 'lendo') && (
            <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
              <label className="block">
                <span className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Turma</span>
                <select value={turmaId} onChange={(e) => setTurmaId(e.target.value)} disabled={etapa === 'lendo'} className="w-full md:w-96 bg-white border border-slate-200 rounded-xl py-2.5 px-4 text-sm font-medium">
                  {turmas.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
                </select>
              </label>
              <div className="space-y-3">
                <span className="block text-xs font-bold text-slate-700 uppercase tracking-wider">PDFs e questões</span>
                {fontes.map((f, fi) => (
                  <fieldset key={f.id} disabled={etapa === 'lendo'} className="border border-slate-200 rounded-xl p-4 space-y-3 bg-slate-50/60">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-brand-orange shrink-0" />
                      <legend className="text-sm font-bold text-slate-800">PDF {fi + 1}</legend>
                      {fontes.length > 1 && (
                        <button type="button" onClick={() => setFontes((fs) => fs.filter((x) => x.id !== f.id))} className="ml-auto p-1.5 text-red-400 hover:text-red-600" aria-label={`Tirar o PDF ${fi + 1}`}>
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    <input type="file" accept="application/pdf" onChange={(e) => escolherArquivo(f.id, e.target.files?.[0] || null)} aria-label={`Arquivo do PDF ${fi + 1}`} className="block text-sm" />
                    {f.erro && <p className="text-sm text-red-700">{f.erro}</p>}
                    {f.totalPaginas > 0 && (
                      <>
                        <label className="block">
                          <span className="block text-xs font-bold text-slate-700 mb-1">Números das questões que você quer (opcional)</span>
                          <input
                            value={f.numeros}
                            onChange={(e) => mudarFonte(f.id, { numeros: e.target.value })}
                            placeholder="Ex.: 136, 140, 150-153"
                            className="w-full md:w-96 px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg"
                          />
                        </label>
                        {f.numeros.trim() ? (
                          <p className="text-xs text-slate-500">
                            {lerNumeros(f.numeros).length} questão(ões): o sistema acha a página de cada uma e manda só essas páginas para a IA.
                          </p>
                        ) : (
                          <div className="flex items-center gap-2 text-sm text-slate-700 flex-wrap">
                            <span>Ou ler da página</span>
                            <input type="number" min={1} max={f.totalPaginas} value={f.de} onChange={(e) => mudarFonte(f.id, { de: Number(e.target.value) || 1 })} aria-label={`Da página (PDF ${fi + 1})`} className="w-20 px-2 py-1.5 bg-white border border-slate-200 rounded-lg" />
                            <span>até a</span>
                            <input type="number" min={1} max={f.totalPaginas} value={f.ate} onChange={(e) => mudarFonte(f.id, { ate: Number(e.target.value) || 1 })} aria-label={`Até a página (PDF ${fi + 1})`} className="w-20 px-2 py-1.5 bg-white border border-slate-200 rounded-lg" />
                            <span className="text-slate-500">de {f.totalPaginas}</span>
                          </div>
                        )}
                      </>
                    )}
                  </fieldset>
                ))}
                <button type="button" onClick={() => setFontes((fs) => [...fs, novaFonte()])} disabled={etapa === 'lendo'} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-bold text-brand-orange bg-orange-50 hover:bg-orange-100 rounded-lg">
                  <Plus className="w-4 h-4" /> Adicionar outro PDF
                </button>
                <p className="text-xs text-slate-500">
                  Para montar um assunto com questões de vários simulados (ex.: Estatística), adicione um PDF por simulado e digite os números das questões de cada um.
                  Sem números, a IA lê as páginas escolhidas (máximo de 40 por PDF).
                </p>
              </div>
              <p className="text-xs text-slate-500">Funciona melhor com PDF digital (feito no computador). PDF escaneado também funciona, mas as figuras saem com qualidade de foto.</p>
              {erro && <p className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> {erro}</p>}
              <button type="button" onClick={ler} disabled={!fontesProntas.length || !turmaId || etapa === 'lendo'} className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-orange hover:bg-brand-orangeHover disabled:bg-slate-300 text-white text-sm font-bold rounded-xl">
                {etapa === 'lendo' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4" />}
                {etapa === 'lendo' ? 'Lendo…' : 'Ler PDF'}
              </button>
              {etapa === 'lendo' && <p className="text-sm text-slate-600" aria-live="polite">{progresso}</p>}
            </section>
          )}

          {(etapa === 'revisar' || etapa === 'salvando') && (
            <>
              <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
                <div className="grid md:grid-cols-2 gap-3">
                  <label className="block">
                    <span className="block text-xs font-bold text-slate-700 mb-1">Assunto das questões (Gerenciar Assuntos)</span>
                    <select value={assuntoId} onChange={(e) => setAssuntoId(e.target.value)} className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg">
                      <option value="novo">Criar assunto novo…</option>
                      {assuntosArvore.map((a) => <option key={a.id} value={a.id}>{a.rotulo}</option>)}
                    </select>
                  </label>
                  {assuntoId === 'novo' && (
                    <label className="block">
                      <span className="block text-xs font-bold text-slate-700 mb-1">Nome do assunto novo</span>
                      <input value={lista.titulo} onChange={(e) => setLista({ ...lista, titulo: e.target.value })} className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg" />
                    </label>
                  )}
                </div>
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                  <span className="font-bold text-slate-800">{questoes.length} questões encontradas · {incluidas.length} marcadas</span>
                  {semResposta.length > 0
                    ? <span className="text-red-600 font-bold flex items-center gap-1"><AlertTriangle className="w-4 h-4" /> {semResposta.length} sem resposta</span>
                    : <span className="text-emerald-600 font-bold flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> todas com resposta</span>}
                  {uso && <span className="text-slate-500">Custo aproximado desta leitura: US$ {custo.toFixed(2)} ({Math.round(uso.entrada / 1000)} mil tokens de entrada, {Math.round(uso.saida / 1000)} mil de saída)</span>}
                </div>
                {avisoLeitura && <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">{avisoLeitura}</p>}
                {cortado && <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">Uma parte do PDF tinha questões demais para uma leitura só e pode ter ficado incompleta. Confira se nenhuma questão faltou.</p>}
                <p className="text-xs text-slate-500">Confira cada questão: o texto, as fórmulas (use “Ver como o aluno vê”), os recortes das figuras e a resposta. Depois de salvar, as questões já aparecem para os alunos no Banco de Questões.</p>
              </section>

              {questoes.map((q, idx) => (
                <RevisaoQuestao
                  key={q.chave}
                  q={q}
                  canvases={canvasesPorFonte[q.fonte] || []}
                  onMudar={(novo) => setQuestoes((qs) => qs.map((x, j) => (j === idx ? novo : x)))}
                  onAjustar={(regiao, aplicar) => setAjuste({ canvas: canvasesPorFonte[q.fonte][regiao.pagina - 1], regiao, aplicar })}
                />
              ))}

              <div className="sticky bottom-0 bg-slate-50/95 backdrop-blur py-4 flex items-center justify-between gap-3 border-t border-slate-200">
                <button type="button" onClick={() => { setEtapa('escolher'); setQuestoes([]); }} disabled={etapa === 'salvando'} className="px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl">Começar de novo</button>
                <div className="flex items-center gap-3">
                  {etapa === 'salvando' && <span className="text-sm text-slate-600" aria-live="polite">{progresso}</span>}
                  <button type="button" onClick={salvar} disabled={etapa === 'salvando'} className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-orange hover:bg-brand-orangeHover disabled:bg-slate-300 text-white text-sm font-bold rounded-xl">
                    {etapa === 'salvando' && <Loader2 className="w-4 h-4 animate-spin" />} Salvar {incluidas.length} questões no banco
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </main>

      {ajuste && (
        <AjusteRecorte
          canvas={ajuste.canvas}
          regiao={ajuste.regiao}
          onCancelar={() => setAjuste(null)}
          onConfirmar={(r) => { ajuste.aplicar(r); setAjuste(null); }}
        />
      )}
    </div>
  );
}
