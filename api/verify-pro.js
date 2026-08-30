// api/verify-pro.js
// Confirma assinaturas recorrentes reais do Stripe e emite um token assinado
// (HMAC) que o app guarda em localStorage. Diferente de pagamento único: aqui
// verificamos se a ASSINATURA está ativa, não um pagamento pontual.
//
// Variáveis de ambiente necessárias na Vercel:
// - STRIPE_SECRET_KEY   → chave secreta do Stripe (sk_live_... ou sk_test_...)
// - PRO_TOKEN_SECRET    → qualquer string aleatória longa, só sua, usada para
//                          assinar os tokens
// - DEV_MASTER_TOKEN    → (opcional) token de desenvolvedor para acesso PRO
//                          sem pagamento, usado só por você
//
// Como o token reflete uma assinatura recorrente, ele tem validade curta
// (7 dias) — o app deve rechecar periodicamente com o Stripe para confirmar
// que a assinatura continua ativa, em vez de confiar em um token de 30 dias
// que continuaria válido mesmo se a pessoa cancelasse no meio do caminho.

import crypto from 'crypto';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function signToken(payload) {
  const secret = process.env.PRO_TOKEN_SECRET;
  const data = JSON.stringify(payload);
  const base = Buffer.from(data).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(base).digest('base64url');
  return `${base}.${sig}`;
}

function verifySignedToken(token) {
  const secret = process.env.PRO_TOKEN_SECRET;
  if (!token || !token.includes('.')) return null;
  const [base, sig] = token.split('.');
  const expectedSig = crypto.createHmac('sha256', secret).update(base).digest('base64url');
  if (sig !== expectedSig) return null;
  try {
    const payload = JSON.parse(Buffer.from(base, 'base64url').toString('utf8'));
    if (!payload.exp || Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

async function fetchStripe(path) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    headers: { 'Authorization': `Bearer ${process.env.STRIPE_SECRET_KEY}` }
  });
  const data = await res.json();
  return { ok: res.ok, data };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Pro-Token');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const headerToken = req.headers['x-pro-token'];
  const sessionId = req.query?.session_id;

  // 🔑 Dev master token — acesso PRO direto, sem consultar o Stripe.
  if (headerToken && process.env.DEV_MASTER_TOKEN && headerToken === process.env.DEV_MASTER_TOKEN) {
    return res.status(200).json({ pro: true, dev: true, token: headerToken });
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(500).json({ pro: false, error: 'STRIPE_SECRET_KEY não configurada na Vercel' });
  }

  // Caso 1: já existe um token salvo com o ID da assinatura — reconfirmamos
  // no Stripe se ela continua ativa antes de renovar a validade do token.
  if (headerToken && !sessionId) {
    const payload = verifySignedToken(headerToken);
    if (!payload || !payload.sub) {
      return res.status(401).json({ pro: false, error: 'Token inválido ou expirado' });
    }
    try {
      const { ok, data: subscription } = await fetchStripe(`subscriptions/${encodeURIComponent(payload.sub)}`);
      if (ok && (subscription.status === 'active' || subscription.status === 'trialing')) {
        const newToken = signToken({ sub: subscription.id, exp: Date.now() + SEVEN_DAYS_MS });
        return res.status(200).json({ pro: true, token: newToken });
      }
      return res.status(200).json({ pro: false, error: 'Assinatura não está mais ativa' });
    } catch (error) {
      return res.status(500).json({ pro: false, error: error.message });
    }
  }

  // Caso 2: acabou de voltar do checkout do Stripe com um session_id novo —
  // buscamos a sessão para achar a assinatura criada e confirmar que está ativa.
  if (sessionId) {
    try {
      const { ok, data: session } = await fetchStripe(`checkout/sessions/${encodeURIComponent(sessionId)}`);
      if (!ok) {
        return res.status(400).json({ pro: false, error: session.error?.message || 'Sessão inválida' });
      }

      if (session.mode !== 'subscription' || !session.subscription) {
        return res.status(400).json({ pro: false, error: 'Esta sessão não é uma assinatura' });
      }

      const { ok: subOk, data: subscription } = await fetchStripe(`subscriptions/${encodeURIComponent(session.subscription)}`);
      if (subOk && (subscription.status === 'active' || subscription.status === 'trialing')) {
        const token = signToken({ sub: subscription.id, exp: Date.now() + SEVEN_DAYS_MS });
        return res.status(200).json({ pro: true, token });
      }

      return res.status(200).json({ pro: false, error: 'Assinatura ainda não está ativa' });
    } catch (error) {
      return res.status(500).json({ pro: false, error: error.message });
    }
  }

  return res.status(400).json({ pro: false, error: 'Nenhum token ou session_id fornecido' });
}
