// Escolha de questões específicas de um PDF (ex.: "136, 140, 150-153").

// "136, 140; 150-153" → [136, 140, 150, 151, 152, 153] (na ordem digitada, sem repetir).
export function lerNumeros(texto) {
  const numeros = [];
  const vistos = new Set();
  for (const parte of String(texto || '').split(/[,;\s]+/)) {
    if (!parte) continue;
    const faixa = parte.match(/^(\d{1,4})\s*[-–a]\s*(\d{1,4})$/i) || parte.match(/^(\d{1,4})-(\d{1,4})$/);
    if (faixa) {
      let [a, b] = [Number(faixa[1]), Number(faixa[2])];
      if (a > b) [a, b] = [b, a];
      if (b - a > 200) continue;
      for (let n = a; n <= b; n += 1) if (!vistos.has(n)) { vistos.add(n); numeros.push(n); }
    } else if (/^\d{1,4}$/.test(parte)) {
      const n = Number(parte);
      if (!vistos.has(n)) { vistos.add(n); numeros.push(n); }
    }
  }
  return numeros;
}

// Acha a página onde cada questão começa, procurando "Questão 136" no texto das páginas.
// textos[i] = texto da página i + 1. Devolve { pagina: { 136: 18, ... }, faltando: [..] }.
export function acharPaginas(textos, numeros) {
  const pagina = {};
  textos.forEach((texto, i) => {
    // Tolerante a letras separadas pelo PDF ("Q UESTÃO   139").
    const re = /q\s*u\s*e\s*s\s*t\s*[ãa]\s*o\s*(?:n\s*)?[º°.]?\s*0*(\d{1,4})(?!\d)/giu;
    let m;
    while ((m = re.exec(texto || ''))) {
      const n = Number(m[1]);
      if (!(n in pagina)) pagina[n] = i + 1;
    }
  });
  const achadas = {};
  const faltando = [];
  for (const n of numeros) {
    if (n in pagina) achadas[n] = pagina[n];
    else faltando.push(n);
  }
  return { pagina: achadas, faltando };
}

// Lotes para a IA: páginas de 2 em 2 (em ordem), e a página seguinte à última do lote
// como contexto, para a questão que continua na outra página.
export function montarLotes(paginas, total) {
  const ordenadas = [...new Set(paginas)].sort((a, b) => a - b);
  const lotes = [];
  for (let i = 0; i < ordenadas.length; i += 2) {
    const extrair = ordenadas.slice(i, i + 2);
    const seguinte = extrair[extrair.length - 1] + 1;
    const contexto = seguinte <= total && !extrair.includes(seguinte) ? [seguinte] : [];
    lotes.push({ extrair, contexto });
  }
  return lotes;
}
