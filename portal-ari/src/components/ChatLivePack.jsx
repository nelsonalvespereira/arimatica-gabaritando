import React, { useEffect, useRef, useState } from 'react';
import { MessageSquare, Send, Loader2, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { useAvisos } from './Avisos';

// Chat em tempo real da live de um pack. Só quem tem o pack (e o admin) vê e escreve:
// quem garante isso é a RLS da tabela pack_live_chat. O nome do autor vem do perfil.
export default function ChatLivePack({ itemId, userId, ehAdmin = false, className = '' }) {
  const avisos = useAvisos();
  const [mensagens, setMensagens] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const listaRef = useRef(null);

  useEffect(() => {
    if (!itemId) return undefined;
    let ativo = true;
    setCarregando(true);
    supabase
      .from('pack_live_chat')
      .select('id, user_id, autor, texto, created_at')
      .eq('item_id', itemId)
      .order('created_at', { ascending: true })
      .limit(300)
      .then(({ data }) => {
        if (!ativo) return;
        setMensagens(data ?? []);
        setCarregando(false);
      });

    const canal = supabase
      .channel(`pack_live_chat_${itemId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pack_live_chat', filter: `item_id=eq.${itemId}` }, (payload) => {
        setMensagens((atuais) => (atuais.some((m) => m.id === payload.new.id) ? atuais : [...atuais, payload.new]));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'pack_live_chat' }, (payload) => {
        setMensagens((atuais) => atuais.filter((m) => m.id !== payload.old.id));
      })
      .subscribe();

    return () => {
      ativo = false;
      supabase.removeChannel(canal);
    };
  }, [itemId]);

  // Desce para a última mensagem quando chega uma nova.
  useEffect(() => {
    const el = listaRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [mensagens.length]);

  const enviar = async (e) => {
    e.preventDefault();
    const limpo = texto.trim();
    if (!limpo || enviando) return;
    setEnviando(true);
    const { data, error } = await supabase
      .from('pack_live_chat')
      .insert({ item_id: itemId, texto: limpo.slice(0, 500) })
      .select('id, user_id, autor, texto, created_at')
      .single();
    setEnviando(false);
    if (error) {
      avisos.erro('Não foi possível enviar a mensagem.');
      return;
    }
    setTexto('');
    setMensagens((atuais) => (atuais.some((m) => m.id === data.id) ? atuais : [...atuais, data]));
  };

  const apagar = async (id) => {
    if (!(await avisos.confirmar({ titulo: 'Apagar mensagem?', confirmarTexto: 'Apagar', perigo: true }))) return;
    const { error } = await supabase.from('pack_live_chat').delete().eq('id', id);
    if (error) return avisos.erro('Não foi possível apagar a mensagem.');
    setMensagens((atuais) => atuais.filter((m) => m.id !== id));
  };

  const hora = (iso) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  return (
    <section aria-label="Chat da live" className={`bg-slate-900 border border-slate-800 rounded-2xl flex flex-col overflow-hidden ${className}`}>
      <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-2">
        <MessageSquare className="w-4 h-4 text-brand-orangeLight" />
        <h3 className="text-sm font-bold text-white">Chat da live</h3>
        <span className="ml-auto flex items-center gap-1.5 text-[11px] font-bold text-red-300">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /> Ao vivo
        </span>
      </div>

      <div ref={listaRef} className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0" aria-live="polite">
        {carregando ? (
          <div className="flex items-center justify-center gap-2 text-slate-500 text-sm py-8">
            <Loader2 className="w-4 h-4 animate-spin" /> Carregando mensagens…
          </div>
        ) : mensagens.length === 0 ? (
          <p className="text-center text-slate-500 text-sm py-8">Nenhuma mensagem ainda. Mande a primeira!</p>
        ) : (
          mensagens.map((m) => {
            const minha = m.user_id === userId;
            return (
              <div key={m.id} className="group flex items-start gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${minha ? 'bg-brand-orange text-white' : 'bg-slate-800 text-slate-300'}`}>
                  {(m.autor || 'A').trim().charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs">
                    <span className={`font-bold ${minha ? 'text-brand-orangeLight' : 'text-slate-200'}`}>{minha ? 'Você' : m.autor}</span>
                    <span className="text-slate-500 ml-2">{hora(m.created_at)}</span>
                  </p>
                  <p className="text-sm text-slate-300 break-words whitespace-pre-wrap">{m.texto}</p>
                </div>
                {ehAdmin && (
                  <button
                    type="button"
                    onClick={() => apagar(m.id)}
                    aria-label="Apagar mensagem"
                    className="p-1 text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 focus:opacity-100 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      <form onSubmit={enviar} className="p-3 border-t border-slate-800 flex gap-2">
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          maxLength={500}
          placeholder="Escreva sua mensagem…"
          aria-label="Mensagem"
          className="flex-1 min-w-0 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none focus:border-brand-orange"
        />
        <button
          type="submit"
          disabled={!texto.trim() || enviando}
          aria-label="Enviar mensagem"
          className="px-4 rounded-xl bg-brand-orange hover:bg-orange-800 text-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center"
        >
          {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </form>
    </section>
  );
}
