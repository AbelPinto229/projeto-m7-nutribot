import Groq from 'groq-sdk';
import 'dotenv/config';

// cliente da api groq (chave lida do .env)
const client = new Groq({ apiKey: process.env.GROQ_API_KEY });
// modelo usado para todas as chamadas (rápido e bom em pt)
const MODEL = 'llama-3.3-70b-versatile';

// definição das tools (funções) que a ia pode chamar
// só são executadas no backend — a ia apenas pede a chamada
const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'delete_food_entry',
      // descrição estrita para evitar que a ia chame por engano quando o user descreve comida
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
      // só dispara em pedidos explícitos sobre "a última"
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
      // limpar tudo só quando o user pede mesmo
      description: 'Elimina todas as refeições do diário de hoje. Usa APENAS quando o utilizador pede explicitamente para apagar tudo, como "elimina tudo", "apaga todas as refeições". NUNCA usar quando o utilizador descreve o que comeu.',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  }
];

// monta o system prompt com base no perfil do utilizador
function createSystemPrompt(user = null) {
  // regras base — aplicam-se sempre
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

  // se ainda não há perfil, pede os dados ao user
  if (!user) {
    return base + `\nAinda não tens dados do utilizador. Pede-lhe: nome, idade, sexo, peso (kg),
altura (cm), nível de atividade (sedentário/leve/moderado/intenso/atleta) e objetivo
(perder peso / manutenção / ganhar massa muscular) e número de refeições por dia.`;
  }

  const { nome, idade, sexo, peso, altura, atividade, objetivo, refeicoesPorDia = 5 } = user;

  // taxa metabólica basal (mifflin-st jeor) — calorias gastas em repouso
  const tmb = sexo === 'masculino'
    ? 10 * peso + 6.25 * altura - 5 * idade + 5
    : 10 * peso + 6.25 * altura - 5 * idade - 161;

  // multiplicadores por nível de atividade
  const fatores = {
    sedentario: 1.2,
    leve: 1.375,
    moderado: 1.55,
    intenso: 1.725,
    atleta: 1.9,
  };
  // tdee = gasto energético total diário
  const tdee = Math.round(tmb * (fatores[atividade] ?? 1.55));

  // ajusta calorias ao objetivo: défice (perder), superávite (ganhar) ou manter
  const metaCaloricaDiaria = objetivo === 'perder_peso'  ? tdee - 500
                           : objetivo === 'ganhar_massa' ? tdee + 300
                           : tdee;

  // proteína em g por kg de peso, mais alta se objetivo for muscular
  const grProt_kg = objetivo === 'perder_peso' ? 1.8 : objetivo === 'ganhar_massa' ? 2.0 : 1.6;
  const protDiaria = Math.round(peso * grProt_kg);
  // 25% das kcal vêm de gordura (9 kcal por g)
  const gordDiaria = Math.round((metaCaloricaDiaria * 0.25) / 9);
  const calProt = protDiaria * 4; // proteína = 4 kcal/g
  const calGord = gordDiaria * 9; // gordura = 9 kcal/g
  // o resto das calorias vai para os hidratos (4 kcal/g)
  const hidratosDiarios = Math.round((metaCaloricaDiaria - calProt - calGord) / 4);

  // divide as metas diárias pelo nº de refeições
  const n = refeicoesPorDia;
  const metaPorRefeicao = {
    kcal:     Math.round(metaCaloricaDiaria / n),
    prot:     Math.round(protDiaria / n),
    hidratos: Math.round(hidratosDiarios / n),
    gord:     Math.round(gordDiaria / n),
  };

  // injeta tudo no prompt para a ia saber as metas exatas
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

// chamada principal: ia decide entre responder em texto ou chamar uma tool
async function chatWithTools(userMessage, history = [], user = null) {
  // monta a lista de mensagens: system + histórico + mensagem nova
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
    tools: TOOLS,             // ferramentas disponíveis
    tool_choice: 'auto',      // deixa a ia decidir se chama tool
    stream: false,            // resposta completa de uma vez
    max_tokens: 600,
    temperature: 0.3          // pouco criativo, mais consistente
  });

  const choice = response.choices[0];

  // se a ia decidiu chamar uma ou mais tools, devolve essa informação
  if (choice.finish_reason === 'tool_calls' && choice.message.tool_calls?.length > 0) {
    return {
      type: 'tool_call',
      tool_calls: choice.message.tool_calls.map(tc => ({
        name: tc.function.name,
        // os argumentos vêm como string json — fazemos parse
        args: JSON.parse(tc.function.arguments || '{}')
      }))
    };
  }

  // caso contrário, é só texto normal
  return {
    type: 'text',
    text: choice.message.content || ''
  };
}

// gera resposta forçada em json (usado pelo extrator de nutrição)
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
    temperature: 0,                              // determinístico (mesma entrada → mesma saída)
    response_format: { type: 'json_object' }     // groq garante json válido
  });

  return { text: response.choices[0].message.content };
}

export { chatWithTools, generateJson };
