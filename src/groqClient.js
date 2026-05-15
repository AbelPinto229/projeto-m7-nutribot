import Groq from 'groq-sdk';
import 'dotenv/config';
import { createSystemPrompt } from './systemPrompt.js';

let client = null;

function getClient() {
  if (client) return client;
  if (!process.env.GROQ_API_KEY) {
    const err = new Error('GROQ_API_KEY em falta no .env');
    err.code = 'NO_API_KEY';
    throw err;
  }
  client = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return client;
}

const MODEL = 'llama-3.3-70b-versatile';
const AI_TIMEOUT_MS = 20000;

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
  },
  {
    type: 'function',
    function: {
      name: 'replace_food_entry',
      description: 'Substitui uma refeição JÁ REGISTADA no diário por outra nova. Usa APENAS quando o utilizador usa palavras explícitas de troca como "troca", "substitui", "muda" seguidas de "X por Y" (ex: "troca os ovos por morangos e bife", "substitui 200g de frango por 70g de bolachas"). REGRA CRÍTICA: o argumento "nome" é SEMPRE a refeição ANTIGA (a que já está no diário, vem ANTES do "por"). O argumento "novo_texto" é SEMPRE a refeição NOVA (vem DEPOIS do "por"). NUNCA troques estes argumentos. NUNCA usar esta tool quando o utilizador descreve uma nova refeição com "comi", "almocei", "jantei".',
      parameters: {
        type: 'object',
        properties: {
          nome: {
            type: 'string',
            description: 'A refeição ANTIGA — aquela que já está no diário e o utilizador quer substituir. É o que vem ANTES da palavra "por" na frase do utilizador. Ex: na frase "troca 200g de frango por 70g de bolachas", o nome é "200g de frango".'
          },
          novo_texto: {
            type: 'string',
            description: 'A refeição NOVA que vai substituir a antiga. É o que vem DEPOIS da palavra "por". Ex: na frase "troca 200g de frango por 70g de bolachas", o novo_texto é "70g de bolachas".'
          }
        },
        required: ['nome', 'novo_texto']
      }
    }
  }
];

// gerador de streaming com suporte a tools — equivalente ao generateContentStream do professor
// yields { type: 'text', content } para cada pedaço de texto
// yields { type: 'tool_calls', message, tool_calls } quando a ia decide chamar funções
async function* chat(messages) {
  const stream = await getClient().chat.completions.create({
    model: MODEL,
    messages,
    tools: TOOLS,
    tool_choice: 'auto',
    stream: true,
    max_tokens: 600,
    temperature: 0.1,
  }, { timeout: AI_TIMEOUT_MS });

  const pending = {};

  for await (const chunk of stream) {
    const choice = chunk.choices[0];
    if (!choice) continue;

    const { delta, finish_reason } = choice;

    if (delta?.content) {
      yield { type: 'text', content: delta.content };
    }

    if (delta?.tool_calls) {
      for (const tc of delta.tool_calls) {
        const i = tc.index;
        if (!pending[i]) pending[i] = { id: '', name: '', arguments: '' };
        if (tc.id) pending[i].id += tc.id;
        if (tc.function?.name) pending[i].name += tc.function.name;
        if (tc.function?.arguments) pending[i].arguments += tc.function.arguments;
      }
    }

    if (finish_reason === 'tool_calls') {
      const rawCalls = Object.entries(pending).map(([i, tc]) => ({
        index: Number(i),
        id: tc.id,
        type: 'function',
        function: { name: tc.name, arguments: tc.arguments },
      }));
      yield {
        type: 'tool_calls',
        message: { role: 'assistant', content: null, tool_calls: rawCalls },
        tool_calls: rawCalls.map(tc => ({
          id: tc.id,
          name: tc.function.name,
          args: JSON.parse(tc.function.arguments || '{}'),
        })),
      };
    }
  }
}

// gerador de streaming simples (sem tools) — usado após execução de tool calls
// yields pedaços de texto diretamente, como o for await do professor
async function* chatStream(messages) {
  const stream = await getClient().chat.completions.create({
    model: MODEL,
    messages,
    stream: true,
    max_tokens: 400,
    temperature: 0.1,
  }, { timeout: AI_TIMEOUT_MS });

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content;
    if (content) yield content;
  }
}

// json mode: não streaming, força output json válido (usado pelo nutriParser)
async function generateJson(prompt) {
  const messages = [
    { role: 'system', content: createSystemPrompt() },
    { role: 'user', content: prompt },
  ];

  const response = await getClient().chat.completions.create({
    model: MODEL,
    messages,
    stream: false,
    max_tokens: 400,
    temperature: 0,
    response_format: { type: 'json_object' },
  }, { timeout: AI_TIMEOUT_MS });

  return { text: response.choices[0].message.content };
}

export { chat, chatStream, generateJson };
