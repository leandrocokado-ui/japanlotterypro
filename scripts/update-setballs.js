// scripts/update-setballs.js
//
// Atualiza data/setball-history.json com o conjunto de bolas (A-J) usado em cada
// sorteio de Loto 7, Loto 6 e Mini Loto.
//
// IMPORTANTE: o conjunto de bolas é sorteado ALEATORIAMENTE a cada sorteio — não
// existe como prever qual será usado no próximo. Este script só registra o
// HISTÓRICO (o que já aconteceu), nunca uma previsão do próximo conjunto.
//
// Numbers 3 e Numbers 4 não usam conjunto de bolas (mecanismo de sorteio
// diferente, por dígitos), por isso não aparecem aqui.
//
// Fonte: lotodb.com — a página de resultados de cada loteria já traz o conjunto
// usado em cada sorteio numa tabela, junto com os números sorteados.
//
// Este script foi escrito a partir da estrutura real da página (inspecionada em
// 28/08/2026), mas NÃO foi testado rodando de verdade (ambiente de desenvolvimento
// sem acesso à internet). Rode manualmente pelo GitHub Actions ("Run workflow")
// na primeira vez e confira o log antes de confiar no agendamento automático.

import fs from 'fs';
import * as cheerio from 'cheerio';

const SOURCES = {
  loto7: 'https://lotodb.com/win_res_7',
  loto6: 'https://lotodb.com/win_res_6',
  mini: 'https://lotodb.com/win_res_5',
};

const DATA_PATH = 'data/setball-history.json';
const VALID_SETS = new Set(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']);

async function fetchPage(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JapanLotteryProBot/1.0; +https://japanlotterypro.vercel.app)' }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} em ${url}`);
  return res.text();
}

// Cada linha da tabela de resultados traz, nesta ordem: nº sequencial da linha,
// nº do sorteio (抽選回), data (抽選日, formato aaaa/mm/dd), conjunto de bolas
// (セット球, uma letra A-J), seguido dos números sorteados e outras colunas.
// Validamos posição + formato de cada célula para não confundir com outras
// colunas numéricas da tabela (prêmios, quantidades, etc.).
function parseSetBalls(html) {
  const $ = cheerio.load(html);
  const results = [];
  $('table').each((_, table) => {
    $(table).find('tr').each((__, tr) => {
      const cells = $(tr).find('th,td').map((___, c) => $(c).text().trim()).get();
      if (cells.length < 4) return;
      const id = parseInt(cells[1], 10);
      const date = cells[2];
      const set = cells[3];
      if (Number.isInteger(id) && id > 0 && /^\d{4}\/\d{2}\/\d{2}$/.test(date) && VALID_SETS.has(set)) {
        results.push({ id, set });
      }
    });
  });
  return results;
}

async function fetchSetBalls(url) {
  const html = await fetchPage(url);
  const rows = parseSetBalls(html);
  const seen = new Set();
  return rows.filter(r => (seen.has(r.id) ? false : (seen.add(r.id), true)));
}

async function main() {
  const current = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  let changed = false;
  let anyError = false;

  for (const [id, url] of Object.entries(SOURCES)) {
    try {
      const rows = await fetchSetBalls(url);
      if (rows.length) {
        const existing = (current[id] && current[id].sets) || {};
        const merged = { ...existing };
        rows.forEach(r => { merged[r.id] = r.set; });
        const before = JSON.stringify(existing);
        const after = JSON.stringify(merged);
        if (before !== after) changed = true;
        current[id] = { sets: merged };
        console.log(`[${id}] ok — ${rows.length} sorteios lidos nesta página, ${Object.keys(merged).length} no histórico total`);
      } else {
        console.warn(`[${id}] nenhum conjunto encontrado — estrutura da página pode ter mudado. Mantendo dados anteriores.`);
        anyError = true;
      }
    } catch (e) {
      console.error(`[${id}] ERRO: ${e.message} — mantendo dados anteriores`);
      anyError = true;
    }
  }

  if (changed) {
    fs.writeFileSync(DATA_PATH, JSON.stringify(current, null, 2) + '\n');
    console.log('✅ data/setball-history.json atualizado.');
  } else {
    console.log('Nenhuma mudança — dados já estavam em dia.');
  }

  if (anyError) {
    console.warn('⚠️ Uma ou mais loterias falharam ao atualizar. Confira o log acima.');
  }
}

main().catch(e => { console.error('Erro fatal:', e); process.exit(1); });
