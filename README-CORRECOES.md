# Japan Lottery Pro — correções aplicadas

- Base inicial atualizada com o arquivo mais recente disponível dentro do ZIP enviado.
- Workflow GitHub Actions corrigido para `.github/workflows/update-lottery-data.yml`.
- Script de atualização movido para `scripts/update-draws.js` e ampliado para até 1000 sorteios por modalidade.
- Estatística sazonal deixou de usar listas mensais hardcoded e passou a ser calculada a partir do histórico carregado.
- Atraso não conta números bônus como números principais.
- Rótulo `HOT` da análise de atraso foi corrigido para `ATRASO`.
- Set Ball saiu do `index.html` e passou a depender de `data/setball-history.json`; sem dados verificáveis, o critério fica desativado em vez de inventar resultados.
- Pressão histórica deixou de usar uma lista fixa no frontend; `api/pressure-history.js` monta o histórico a partir dos sorteios e do arquivo histórico da Open-Meteo.
- Fallback da pressão não inventa uma pressão histórica quando a API está indisponível.
- PRO deixou de confiar em `localStorage` para ativação. Foi adicionado `api/verify-pro.js` para validar Checkout Session/assinatura no Stripe.
- `/api/ai` valida o token PRO assinado quando `PRO_TOKEN_SECRET` estiver configurado.

## Variáveis da Vercel necessárias

- `GROQ_API_KEY`
- `STRIPE_SECRET_KEY`
- `PRO_TOKEN_SECRET`
- configurar o Payment Link de produção no `index.html` no lugar de `__STRIPE_PAYMENT_LINK__` antes de publicar o checkout.

## Observação

O projeto não deve apresentar correlação entre pressão/set ball e resultado como fato causal. Esses critérios devem ser descritos como filtros estatísticos/experimentais.
