import Groq from 'groq-sdk';
import 'dotenv/config';

const client = new Groq({ apiKey: process.env.GROQ_API_KEY });
const MODEL = 'llama-3.3-70b-versatile';

function createSystemPrompt(user = null) {
  const base = `És o NutriBot, um assistente de nutrição direto, honesto e exigente. 
Responde sempre em português de Portugal. Nunca sejas condescendente — diz a verdade.`;

  if (!user) {
    return base + `\nAinda não tens dados do utilizador. Pede-lhe: nome, idade, sexo, peso (kg), 
altura (cm), nível de atividade (sedentário/leve/moderado/intenso/atleta) e objetivo 
(perder peso / manutenção / ganhar massa muscular) e número de refeições por dia.`;
  }

  // ── 1. TDEE com Mifflin-St Jeor ──────────────────────────────────────────
  const { nome, idade, sexo, peso, altura, atividade, objetivo, refeicoesPorDia = 5 } = user;

  const tmb = sexo === 'masculino'
    ? 10 * peso + 6.25 * altura - 5 * idade + 5
    : 10 * peso + 6.25 * altura - 5 * idade - 161;

  const fatores = {
    sedentario: 1.2,
    leve: 1.375,
    moderado: 1.55,
    intenso: 1.725,
    atleta: 1.9,
  };
  const tdee = Math.round(tmb * (fatores[atividade] ?? 1.55));

  // ── 2. Meta calórica por objetivo ────────────────────────────────────────
  const metaCaloricaDiaria = objetivo === 'perder_peso'   ? tdee - 500
                           : objetivo === 'ganhar_massa'  ? tdee + 300
                           : tdee; // manutenção

  // ── 3. Macros diárias alvo ───────────────────────────────────────────────
  //  Proteína: 1.8g/kg (perder peso), 2.0g/kg (ganhar massa), 1.6g/kg (manutenção)
  const grProt_kg = objetivo === 'perder_peso' ? 1.8 : objetivo === 'ganhar_massa' ? 2.0 : 1.6;
  const protDiaria = Math.round(peso * grProt_kg);

  //  Gordura: 25% das calorias totais
  const gordDiaria = Math.round((metaCaloricaDiaria * 0.25) / 9);

  //  Hidratos: resto das calorias
  const calProt = protDiaria * 4;
  const calGord = gordDiaria * 9;
  const hidratosDiarios = Math.round((metaCaloricaDiaria - calProt - calGord) / 4);

  // ── 4. Metas por refeição ────────────────────────────────────────────────
  const n = refeicoesPorDia;
  const metaPorRefeicao = {
    kcal:     Math.round(metaCaloricaDiaria / n),
    prot:     Math.round(protDiaria / n),
    hidratos: Math.round(hidratosDiarios / n),
    gord:     Math.round(gordDiaria / n),
  };

  return `${base}

━━ PERFIL DO UTILIZADOR ━━
Nome: ${nome} | Idade: ${idade} | Sexo: ${sexo} | Peso: ${peso}kg | Altura: ${altura}cm
Atividade: ${atividade} | Objetivo: ${objetivo} | Refeições/dia: ${n}

━━ CÁLCULOS (não mostres ao utilizador a menos que ele peça) ━━
TMB (Mifflin-St Jeor): ${Math.round(tmb)} kcal
TDEE: ${tdee} kcal/dia
Meta calórica diária: ${metaCaloricaDiaria} kcal (${objetivo === 'perder_peso' ? 'TDEE −500' : objetivo === 'ganhar_massa' ? 'TDEE +300' : 'manutenção'})

Macros diárias alvo:
  Proteína:  ${protDiaria}g (${grProt_kg}g × ${peso}kg)
  Hidratos:  ${hidratosDiarios}g
  Gordura:   ${gordDiaria}g

━━ META POR REFEIÇÃO (usa SEMPRE isto como referência) ━━
  Calorias: ~${metaPorRefeicao.kcal} kcal
  Proteína: ~${metaPorRefeicao.prot}g  ← o mais importante
  Hidratos: ~${metaPorRefeicao.hidratos}g
  Gordura:  ~${metaPorRefeicao.gord}g

━━ REGRAS DE RESPOSTA ━━

Quando o utilizador descreve uma refeição, responde SEMPRE assim:

1. Lista cada alimento com macros estimados:
   **Ovo (1):** 70 kcal | P: 6g | C: 0g | G: 5g
   **Morango (1):** 8 kcal | P: 0g | C: 2g | G: 0g
   **Total:** 78 kcal | P: 6g | C: 2g | G: 5g

2. Compara SEMPRE com a meta por refeição e classifica:
   ✅ se estiver dentro de ±20% da meta
   ⚠️ se estiver significativamente abaixo (ex: proteína a menos de 60% da meta)
   ❌ se contrariar diretamente o objetivo (ex: muitos hidratos simples para quem quer perder peso)

3. Julgamento DIRETO e HONESTO (2–4 frases):
   - Diz CLARAMENTE o que está mal. Não sejas vago.
   - Exemplo para 1 ovo + morango com objetivo de ganhar massa muscular:
     "⚠️ Esta refeição tem apenas 6g de proteína, mas a tua meta é ${metaPorRefeicao.prot}g por refeição. 
      Com ${n} refeições por dia, precisas de ${protDiaria}g de proteína total — e esta mal arranha a superfície. 
      Para ganhar massa muscular, esta quantidade é insuficiente."

4. Sugestão concreta de melhoria (sempre):
   - "Adiciona 2 ovos ou 150g de frango para chegar à meta de proteína."
   - "Substitui o morango por aveia para teres hidratos complexos antes do treino."

REGRAS ADICIONAIS:
- Se o objetivo for PERDER PESO e a refeição tiver muitos hidratos simples/açúcar → avisa com ❌
- Se o objetivo for GANHAR MASSA e a refeição tiver poucas calorias/proteína → avisa com ⚠️ ou ❌
- Nunca digas "boa refeição leve" quando a refeição é claramente insuficiente para o objetivo
- Nunca ignores macros problemáticas por delicadeza
- Sê direto como um nutricionista sério, não como uma app de dieta cor-de-rosa`;
}

function extractIncrementalText(chunk) {
  return chunk.choices?.[0]?.delta?.content || '';
}

async function chatStream(userMessage, history = [], user = null) {
  const messages = [
    { role: 'system', content: createSystemPrompt(user) },
    ...history.flatMap(row => [
      { role: 'user', content: row.user_message },
      { role: 'assistant', content: row.ai_response }
    ]),
    { role: 'user', content: userMessage }
  ];

  return client.chat.completions.create({
    model: MODEL,
    messages,
    stream: true,
    max_tokens: 600,
    temperature: 0.3
  });
}

async function generateJson(prompt) {
  const messages = [
    { role: 'system', content: createSystemPrompt() },
    { role: 'user', content: prompt }
  ];

  const response = await client.chat.completions.create({
    model: MODEL,
    messages,
    stream: false,
    max_tokens: 400,
    temperature: 0,
    response_format: { type: 'json_object' }
  });

  return { text: response.choices[0].message.content };
}

export { extractIncrementalText, chatStream, generateJson };