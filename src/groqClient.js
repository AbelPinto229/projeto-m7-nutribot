import Groq from 'groq-sdk';
// sdk oficial do groq para node.js — abstrai os pedidos http à api

import 'dotenv/config';
// carrega as variáveis do .env (groq_api_key)

import { createSystemPrompt } from './systemPrompt.js';
// usado no generateJson para definir o contexto da ia

let client = null; // instância única do cliente groq — criada apenas uma vez (padrão singleton)

// devolve o cliente groq, criando-o na primeira vez que é chamado
function getClient() {
  if (client) return client; // reutiliza a instância existente

  if (!process.env.GROQ_API_KEY) {
    // a variável de ambiente não está definida no .env
    const err = new Error('GROQ_API_KEY em falta no .env');
    err.code = 'NO_API_KEY'; // código personalizado reconhecido pelo errors.js
    throw err;
  }

  client = new Groq({ apiKey: process.env.GROQ_API_KEY }); // cria o cliente com a chave
  return client;
}

const MODEL = 'llama-3.3-70b-versatile';
// modelo llama 3.3 70b — bom equilíbrio entre qualidade e velocidade

const AI_TIMEOUT_MS = 20000;
// 20 segundos — se a ia não responder a tempo, o pedido falha com timeout

// lista de tools disponíveis — a ia lê as descrições e decide quando e como chamar cada uma
const TOOLS = [
  {
    type: 'function', // formato openai-compatível — suportado pelo groq
    function: {
      name: 'delete_food_entry',
      // nome da tool — deve corresponder ao case em foodTools.js
      description: 'Elimina uma refeição do diário pelo nome. Usa APENAS quando o utilizador usa explicitamente palavras como "elimina", "apaga", "remove" ou "cancela" seguidas do nome de um alimento. NUNCA chamar quando o utilizador descreve o que comeu com palavras como "comi", "almocei", "jantei", "bebi", "comer".',
      parameters: {
        type: 'object',
        properties: {
          nome: {
            type: 'string',
            description: 'Nome exato ou parcial da refeição a eliminar, tal como aparece no diário'
          }
        },
        required: ['nome'] // a ia é obrigada a fornecer este campo
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_all_food_entries',
      description: 'Elimina TODAS as refeições do diário. Usa APENAS quando o utilizador menciona explicitamente o "diário" e pede para o apagar/limpar todo — ex: "elimina o diário todo", "limpa o meu diário", "apaga todas as refeições do diário". NUNCA usar para pedidos vagos como "elimina tudo", "limpa a base de dados" ou qualquer frase que não mencione explicitamente o diário de refeições.',
      parameters: {
        type: 'object',
        properties: {},
        required: [] // sem parâmetros — o userId vem pelo contexto da função executeTool
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
        required: ['nome', 'novo_texto'] // ambos obrigatórios — nome do que sai e texto do que entra
      }
    }
  }
];

// envia mensagens à ia e devolve texto ou tool calls (sem streaming)
async function chat(messages, withTools = true) {
  // messages = array de { role, content } — histórico completo da conversa
  // withTools = false no follow-up após tool calls (evita recursão infinita)

  const options = {
    model: MODEL,       // llama-3.3-70b-versatile
    messages,           // histórico completo
    stream: false,      // http normal — aguarda a resposta completa antes de devolver
    max_tokens: 600,    // limite de tokens na resposta (evita respostas demasiado longas)
    temperature: 0.1,   // próximo de 0 = mais determinístico, menos criativo
  };

  if (withTools) {
    options.tools = TOOLS;          // passa a lista de tools disponíveis
    options.tool_choice = 'auto';   // a ia decide sozinha se usa tools ou responde em texto
  }

  const response = await getClient().chat.completions.create(options, { timeout: AI_TIMEOUT_MS });
  // faz o pedido à api do groq — lança erro se timeout ou se a chave for inválida

  const choice = response.choices[0];
  // choices = array de respostas possíveis — normalmente só há uma (choices[0])

  if (withTools && choice.finish_reason === 'tool_calls' && choice.message.tool_calls?.length > 0) {
    // finish_reason === 'tool_calls' significa que a ia quer chamar uma ou mais tools
    return {
      type: 'tool_calls',
      message: choice.message, // a mensagem completa da ia (necessária para o follow-up — protocolo openai)
      tool_calls: choice.message.tool_calls.map(tc => ({
        id: tc.id,                                         // id único desta tool call
        name: tc.function.name,                            // nome da função a chamar
        args: JSON.parse(tc.function.arguments || '{}'),   // argumentos em objeto javascript
      })),
    };
  }

  return { type: 'text', text: choice.message.content || '' };
  // resposta em texto — o chatService extrai o mood e devolve ao browser
}

// modo json: força a ia a devolver sempre json válido (usado pelo nutriParser)
async function generateJson(prompt) {
  const messages = [
    { role: 'system', content: createSystemPrompt() }, // system prompt sem perfil (user=null)
    { role: 'user', content: prompt },                  // o prompt com o schema e o texto da refeição
  ];

  const response = await getClient().chat.completions.create({
    model: MODEL,
    messages,
    stream: false,
    max_tokens: 400,   // respostas json são curtas — 400 tokens chega
    temperature: 0,    // 0 = totalmente determinístico (sem criatividade no json)
    response_format: { type: 'json_object' },
    // modo json do groq — garante que o output é sempre json válido, sem texto livre
  }, { timeout: AI_TIMEOUT_MS });

  return { text: response.choices[0].message.content };
  // devolve o json como string — o nutriParser faz json.parse()
}

export { chat, generateJson };
