// scripts/update-draws.js
//
// Atualiza data/lottery-data.json automaticamente com os sorteios reais mais recentes.
// Fonte: takarakuji.rakuten.co.jp/backnumber/ — a página sempre mostra o MÊS ATUAL,
// URL fixa, sem precisar saber o número do sorteio de antemão.
//
// IMPORTANTE: Bingo5 não é vendido pela Rakuten, então não está incluso aqui.
// Continue atualizando o Bingo5 manualmente no data/lottery-data.json.

import fs from 'fs';
import * as cheerio from 'cheerio';

const SOURCES = {
  loto7: { url: 'https://takarakuji.rakuten.co.jp/backnumber/loto7/', type: 'balls' },
  loto6: { url: 'https://takarakuji.rakuten.co.jp/backnumber/loto6/', type: 'balls' },
  mini:  { url: 'https://takarakuji.rakuten.co.jp/backnumber/mini/',  type: 'balls' },
  num3:  { url: 'https://takarakuji.rakuten.co.jp/backnumber/numbers3/', type: 'numbers' },
  num4:  { url: 'https://takarakuji.rakuten.co.jp/backnumber/numbers4/', type: 'numbers' },
};

const DATA_PATH = 'data/lottery-data.json';

function toDDMMYYYY(yyyy_mm_dd) {
  const parts = (yyyy_mm_dd || '').split('/');
  if (parts.length !== 3) return null;
  const [y, m, d] = parts;
  return `${d}/${m}/${y}`;
}

async function fetchDraws(id, { url, type }) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JapanLotteryProBot/1.0; +https://japanlotterypro.vercel.app)' }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const $ = cheerio.load(html);
  const draws = [];

  $('table').each((_, table) => {
    let drawId = null, date = null, mains = null, bonus = [];

    $(table).find('tr').each((__, tr) => {
      const cells = $(tr).find('th,td').map((___, c) => $(c).text().trim()).get();
      if (!cells.length) return;
      const label = cells[0];
      const values = cells.slice(1).filter(v => v !== '');

      if (label.includes('回号')) {
        const m = values[0]?.match(/第0*(\d+)回/);
        if (m) drawId = parseInt(m[1], 10);
      } else if (label.includes('抽せん日')) {
        if (values[0]) date = toDDMMYYYY(values[0]);
      } else if (label.includes('本数字') || label.includes('当せん番号')) {
        if (type === 'balls') {
          mains = values.map(v => parseInt(v, 10)).filter(n => !isNaN(n));
        } else {
          const digits = (values[0] || '').replace(/\D/g, '');
          if (digits) mains = digits;
        }
      } else if (label.includes('ボーナス数字')) {
        bonus = values.map(v => parseInt(v.replace(/[()]/g, ''), 10)).filter(n => !isNaN(n));
      }
    });

    const hasMains = type === 'numbers' ? !!mains : (mains && mains.length);
    if (drawId && hasMains) {
      const draw = { id: drawId, date, nums: mains };
      if (bonus.length) draw.bonus = bonus.length === 1 ? bonus[0] : bonus;
      draws.push(draw);
    }
  });

  const seen = new Set();
  return draws
    .filter(d => (seen.has(d.id) ? false : (seen.add(d.id), true)))
    .sort((a, b) => b.id - a.id)
    .slice(0, 5);
}

async function main() {
  const current = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  let changed = false;
  let anyError = false;

  for (const [id, cfg] of Object.entries(SOURCES)) {
    try {
      const draws = await fetchDraws(id, cfg);
      if (draws.length) {
        const before = JSON.stringify(current[id]?.lastDraws || []);
        const after = JSON.stringify(draws);
        if (before !== after) changed = true;
        current[id] = { ...(current[id] || {}), lastDraws: draws };
        console.log(`[${id}] ok — ${draws.length} sorteios, mais recente: #${draws[0].id} (${draws[0].date})`);
      } else {
        console.warn(`[${id}] nenhum sorteio encontrado na página — estrutura pode ter mudado. Mantendo dados anteriores.`);
        anyError = true;
      }
    } catch (e) {
      console.error(`[${id}] ERRO: ${e.message} — mantendo dados anteriores`);
      anyError = true;
    }
  }

  if (changed) {
    fs.writeFileSync(DATA_PATH, JSON.stringify(current, null, 2) + '\n');
    console.log('✅ data/lottery-data.json atualizado.');
  } else {
    console.log('Nenhuma mudança — dados já estavam em dia.');
  }

  if (anyError) {
    console.warn('⚠️ Uma ou mais loterias falharam ao atualizar. Confira o log acima — pode ser hora de eu ajustar o scraper.');
  }
}

main().catch(e => { console.error('Erro fatal:', e); process.exit(1); });
