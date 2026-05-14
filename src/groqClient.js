import Groq from 'groq-sdk';
import 'dotenv/config';
import { createSystemPrompt } from './systemPrompt.js';

// cliente da api groq — criado de forma "preguiçosa" (lazy)
// motivo: se a chave não estiver definida, o new Groq() rebenta logo no import
// e o servidor inteiro não arranca. assim só falha quando alguém usa /chat
let client = null;

// devolve o cliente groq, criando-o na primeira chamada
// se a chave estiver em falta, lança um erro tipado (code: 'NO_API_KEY')
// para o api.js poder distinguir e dar mensagem amigável ao user
function getClient() {
  if (client) return client;                          // já foi criado antes, reutiliza
  if (!process.env.GROQ_API_KEY) {
    const err = new Error('GROQ_API_KEY em falta no .env');
    err.code = 'NO_API_KEY';                          // marcador para tratamento específico
    throw err;
  }
  client = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return client;
}

// modelo usado para todas as chamadas (rápido e bom em pt)
const MODEL = 'llama-3.3-70b-versatile';
// tempo máximo (ms) à espera da resposta da ia antes de desistir
const AI_TIMEOUT_MS = 20000;

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
  },
  {
    type: 'function',
    function: {
      name: 'replace_food_entry',
      // substitui uma refeição já registada por outra — só com palavras explícitas de troca
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

  // getClient() lança 'NO_API_KEY' se a chave faltar — apanhado em api.js
  const response = await getClient().chat.completions.create({
    model: MODEL,
    messages,
    tools: TOOLS,             // ferramentas disponíveis
    tool_choice: 'auto',      // deixa a ia decidir se chama tool
    stream: false,            // resposta completa de uma vez
    max_tokens: 600,
    temperature: 0.1          // para seguir as regras do prompt à risca
  }, { timeout: AI_TIMEOUT_MS });

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

  // também usa getClient() para falhar de forma controlada se faltar chave
  const response = await getClient().chat.completions.create({
    model: MODEL,
    messages,
    stream: false,
    max_tokens: 400,
    temperature: 0,                              // determinístico (mesma entrada → mesma saída)
    response_format: { type: 'json_object' }     // groq garante json válido
  }, { timeout: AI_TIMEOUT_MS });

  return { text: response.choices[0].message.content };
}

export { chatWithTools, generateJson };
