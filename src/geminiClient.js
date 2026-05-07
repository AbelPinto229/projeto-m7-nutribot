import Groq from 'groq-sdk';
import 'dotenv/config';

const client = new Groq({ apiKey: process.env.GROQ_API_KEY });
const MODEL = 'llama-3.3-70b-versatile';

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'delete_food_entry',
      description: 'Elimina uma refeição do diário pelo nome. Usa APENAS quando o utilizador usa explicitamente palavras como "elimina", "apaga", "remove" ou "cancela" seguidas do nome de um alimento. NUNCA chamar quando o utilizador descreve o que comeu com palavras como "comi", "almocei", "jantei", "bebi", "comer".',
      parameters: {
        type: 'object',
        properties: {
          nome: {
            type: 'string',
            description: 'Nome exato ou parcial da refeição a eliminar, tal como aparece no diário'
          }
        },
        required: ['nome']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_last_food_entry',
      description: 'Elimina a última refeição registada no diário. Usa APENAS quando o utilizador diz explicitamente "elimina a última", "apaga a última", "remove a última refeição" ou similar. NUNCA usar quando o utilizador descreve comida com palavras como "comi", "almocei", "jantei".',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_all_food_entries',
      description: 'Elimina todas as refeições do diário de hoje. Usa APENAS quando o utilizador pede explicitamente para apagar tudo, como "elimina tudo", "apaga todas as refeições". NUNCA usar quando o utilizador descreve o que comeu.',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  }
];

function createSystemPrompt(user = null) {
  const base = `És o NutriBot, um assistente de nutrição direto, honesto e exigente. 
Responde sempre em português de Portugal. Nunca sejas condescendente — diz a verdade.

REGRA CRÍTICA SOBRE FUNÇÕES:
- As funções de eliminação SÓ devem ser chamadas quando o utilizador usa explicitamente palavras como "elimina", "apaga", "remove" ou "cancela".
- Se o utilizador descreve o que comeu (ex: "comi X", "almocei X", "jantei X"), NUNCA chames funções de eliminação — responde SEMPRE com análise nutricional.
- "comi", "almocei", "jantei", "bebi" = análise nutricional, NUNCA eliminação.

Tens acesso a funções para gerir o diário alimentar do utilizador:
- delete_food_entry(nome) → elimina uma refeição pelo nome
- delete_last_food_entry() → elimina a última refeição
- delete_all_food_entries() → elimina todas as refeições de hoje

Quando o utilizador pede para eliminar uma refeição, usa SEMPRE a função correta. Não respondas apenas em texto.`;

  if (!user) {
    return base + `\nAinda não tens dados do utilizador. Pede-lhe: nome, idade, sexo, peso (kg), 
altura (cm), nível de atividade (sedentário/leve/moderado/intenso/atleta) e objetivo 
(perder peso / manutenção / ganhar massa muscular) e número de refeições por dia.`;
  }

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

  const metaCaloricaDiaria = objetivo === 'perder_peso'  ? tdee - 500
                           : objetivo === 'ganhar_massa' ? tdee + 300
                           : tdee;

  const grProt_kg = objetivo === 'perder_peso' ? 1.8 : objetivo === 'ganhar_massa' ? 2.0 : 1.6;
  const protDiaria = Math.round(peso * grProt_kg);
  const gordDiaria = Math.round((metaCaloricaDiaria * 0.25) / 9);
  const calProt = protDiaria * 4;
  const calGord = gordDiaria * 9;
  const hidratosDiarios = Math.round((metaCaloricaDiaria - calProt - calGord) / 4);

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

Quando o utilizador descreve uma refeição, responde SEMPRE nesta ordem exata:

PASSO 1 — MOOD (primeira linha, obrigatória, sozinha):
MOOD:happy    → refeição dentro de ±20% das metas de calorias E proteína
MOOD:ok       → aceitável, mas com pelo menos uma macro com falha minor (60–80% da meta)
MOOD:stressed → proteína OU calorias abaixo de 60% da meta por refeição
MOOD:angry    → refeição que contradiz diretamente o objetivo

Escreve EXATAMENTE assim na primeira linha: MOOD:happy (ou ok, stressed, angry)
Depois deixa uma linha em branco. Depois continua a resposta.

PASSO 2 — Lista de alimentos com macros:
Alimento (quantidade): X kcal | P: Xg | C: Xg | G: Xg
Total: X kcal | P: Xg | C: Xg | G: Xg

PASSO 3 — Comparação com meta por refeição:
✅ se dentro de ±20% | ⚠️ se 60–80% | ❌ se abaixo de 60% ou contradiz objetivo

PASSO 4 — Julgamento DIRETO (2–4 frases):
- Sê honesto e específico. Usa os números reais das metas.
- Exemplo para 1 ovo + morango, objetivo ganhar massa:
  "Esta refeição tem apenas 6g de proteína, mas a tua meta é ${metaPorRefeicao.prot}g por refeição. Com ${n} refeições por dia, precisas de ${protDiaria}g total."

PASSO 5 — Sugestão concreta (sempre):
- Adiciona 2 ovos ou 150g de frango para atingir a meta de proteína.

REGRAS ADICIONAIS:
- Se objetivo PERDER PESO e refeição com muitos hidratos simples/açúcar → MOOD:angry
- Se objetivo GANHAR MASSA e proteína < 60% da meta → MOOD:stressed ou MOOD:angry
- NUNCA digas "boa refeição leve" quando é claramente insuficiente
- Sê direto como um nutricionista sério`;
}

async function chatWithTools(userMessage, history = [], user = null) {
  const messages = [
    { role: 'system', content: createSystemPrompt(user) },
    ...history.flatMap(row => [
      { role: 'user', content: row.user_message },
      { role: 'assistant', content: row.ai_response }
    ]),
    { role: 'user', content: userMessage }
  ];

  const response = await client.chat.completions.create({
    model: MODEL,
    messages,
    tools: TOOLS,
    tool_choice: 'auto',
    stream: false,
    max_tokens: 600,
    temperature: 0.3
  });

  const choice = response.choices[0];

  if (choice.finish_reason === 'tool_calls' && choice.message.tool_calls?.length > 0) {
    return {
      type: 'tool_call',
      tool_calls: choice.message.tool_calls.map(tc => ({
        name: tc.function.name,
        args: JSON.parse(tc.function.arguments || '{}')
      }))
    };
  }

  return {
    type: 'text',
    text: choice.message.content || ''
  };
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

export { chatWithTools, generateJson };