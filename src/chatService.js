import { getUser, getRecentChatHistory, saveChatMessage } from './db.js';
// funções da bd — buscar perfil, histórico e guardar mensagem

import { chat } from './groqClient.js';
// envia mensagens à ia e recebe texto ou tool calls

import { executeTool } from './foodTools.js';
// executa as tools que a ia pediu (apagar, substituir refeições)

import { createSystemPrompt } from './systemPrompt.js';
// gera o system prompt com as metas nutricionais do utilizador

// remove formatação markdown da resposta da ia antes de enviar ao browser
function limparMarkdown(texto) {
  return texto
    .replace(/\*\*(.*?)\*\*/g, '$1') // **negrito** → texto simples
    .replace(/\*(.*?)\*/g, '$1')      // *itálico* → texto simples
    .replace(/#{1,6}\s/g, '')         // # títulos → sem o cardinal
    .trim();                          // remove espaços e newlines no início e fim
}

// ponto de entrada — recebe a mensagem do utilizador e devolve a resposta da ia
async function handleChatMessage(message, userId) {
  const user = userId ? await getUser(userId) : null;
  // vai buscar o perfil do utilizador à bd (nome, peso, altura, objetivo, etc.)
  // se não houver userId, user fica null

  const history = userId ? await getRecentChatHistory(userId, 5) : [];
  // busca as últimas 5 mensagens para dar contexto à ia
  // se não houver userId, o histórico fica vazio

  const messages = [
    { role: 'system', content: createSystemPrompt(user) },
    // system prompt: regras + perfil + metas calculadas (tmb, tdee, macros)

    ...history.flatMap(row => [
      { role: 'user', content: row.user_message },       // mensagem anterior do utilizador
      { role: 'assistant', content: row.ai_response },   // resposta anterior da ia
    ]),
    // repõe o histórico como pares user/assistant — a ia "lembra-se" do contexto

    { role: 'user', content: message },
    // a mensagem atual do utilizador — vai sempre no fim
  ];

  const result = await chat(messages);
  // envia tudo à ia — pode responder com { type: 'text' } ou { type: 'tool_calls' }

  if (result.type === 'tool_calls') {
    // a ia quer apagar ou substituir uma refeição — executamos as tools
    const toolMessages = []; // resultados das tools (para mandar de volta à ia)
    const toolActions = [];  // ações executadas (para o frontend atualizar o dom)

    for (const tc of result.tool_calls) {
      // percorre cada tool call pedida (pode ser mais do que uma na mesma resposta)
      const toolResult = await executeTool(tc.name, tc.args, userId);
      // executa a tool na bd — devolve { success, action, ... }

      toolActions.push(toolResult);
      // guarda para devolver ao frontend (ex: { action: 'delete_one', id: 5 })

      toolMessages.push({
        role: 'tool',
        tool_call_id: tc.id,       // id que liga este resultado à tool call que a ia pediu
        content: JSON.stringify(toolResult), // resultado serializado em json — a ia vai ler isto
      });
    }

    const followUp = [...messages, result.message, ...toolMessages];
    // monta o histórico completo: mensagens anteriores + resposta com tool calls + resultados

    const confirmation = await chat(followUp, false);
    // segunda chamada à ia (false = sem tools disponíveis) para gerar a confirmação em texto
    // ex: "feito! eliminei os ovos do teu diário."

    const text = limparMarkdown(confirmation.text || ''); // limpa o markdown da confirmação

    if (userId) await saveChatMessage(userId, message, text); // guarda no histórico da bd
    return { text, tool_actions: toolActions };
    // devolve ao api.js: texto de confirmação + ações para o frontend atualizar o dom
  }

  // resposta em texto — extrai o mood da primeira linha
  const lines = result.text.split('\n');
  const moodMatch = lines[0].trim().match(/^MOOD:(happy|ok|stressed|angry)$/);
  // verifica se a primeira linha é exatamente "MOOD:happy" (ou ok, stressed, angry)

  const mood = moodMatch ? moodMatch[1] : null; // extrai só o valor — ex: "happy"

  const text = limparMarkdown(mood ? lines.slice(1).join('\n').trimStart() : result.text);
  // se havia mood, remove a primeira linha e junta o resto
  // se não havia mood (ex: resposta fora de âmbito), usa o texto todo

  if (userId) await saveChatMessage(userId, message, result.text);
  // guarda o texto original (com mood:) na bd — o frontend sabe remover o prefixo ao repor

  return { text, mood };
  // devolve ao api.js: texto limpo + mood para o frontend mudar o tema visual
}

export { handleChatMessage };
