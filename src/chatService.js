import { getUser, getRecentChatHistory, saveChatMessage } from './db.js';
import { chat } from './groqClient.js';
import { executeTool } from './foodTools.js';
import { createSystemPrompt } from './systemPrompt.js';

function limparMarkdown(texto) {
  return texto
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/#{1,6}\s/g, '')
    .trim();
}

async function handleChatMessage(message, userId) {
  const user = userId ? await getUser(userId) : null;
  const history = userId ? await getRecentChatHistory(userId, 5) : [];

  const messages = [
    { role: 'system', content: createSystemPrompt(user) },
    ...history.flatMap(row => [
      { role: 'user', content: row.user_message },
      { role: 'assistant', content: row.ai_response },
    ]),
    { role: 'user', content: message },
  ];

  // chama a ia — pode responder com texto ou pedir tool calls
  const result = await chat(messages);

  if (result.type === 'tool_calls') {
    // executa as tools pedidas pela ia
    const toolMessages = [];
    const toolActions = [];

    for (const tc of result.tool_calls) {
      const toolResult = await executeTool(tc.name, tc.args, userId);
      toolActions.push(toolResult);
      toolMessages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: JSON.stringify(toolResult),
      });
    }

    // envia os resultados de volta à ia para gerar a confirmação
    const followUp = [...messages, result.message, ...toolMessages];
    const confirmation = await chat(followUp, false);
    const text = limparMarkdown(confirmation.text || '');

    if (userId) await saveChatMessage(userId, message, text);
    return { text, tool_actions: toolActions };
  }

  // resposta em texto — extrai o mood da primeira linha
  const lines = result.text.split('\n');
  const moodMatch = lines[0].trim().match(/^MOOD:(happy|ok|stressed|angry)$/);
  const mood = moodMatch ? moodMatch[1] : null;
  const text = limparMarkdown(mood ? lines.slice(1).join('\n').trimStart() : result.text);

  if (userId) await saveChatMessage(userId, message, result.text);
  return { text, mood };
}

export { handleChatMessage };
