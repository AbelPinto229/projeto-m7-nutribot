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

// chama a ia e devolve texto ou tool calls (sem streaming)
// withTools = false no follow-up após tool calls (evita recursão)
async function chat(messages, withTools = true) {
  const options = {
    model: MODEL,
    messages,
    stream: false,
    max_tokens: 600,
    temperature: 0.1,
  };

  if (withTools) {
    options.tools = TOOLS;
    options.tool_choice = 'auto';
  }

  const response = await getClient().chat.completions.create(options, { timeout: AI_TIMEOUT_MS });
  const choice = response.choices[0];

  if (withTools && choice.finish_reason === 'tool_calls' && choice.message.tool_calls?.length > 0) {
    return {
      type: 'tool_calls',
      message: choice.message,
      tool_calls: choice.message.tool_calls.map(tc => ({
        id: tc.id,
        name: tc.function.name,
        args: JSON.parse(tc.function.arguments || '{}'),
      })),
    };
  }

  return { type: 'text', text: choice.message.content || '' };
}

// json mode: força output json válido (usado pelo nutriParser)
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

export { chat, generateJson };
