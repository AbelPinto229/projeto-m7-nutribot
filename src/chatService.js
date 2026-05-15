import { getUser, getRecentChatHistory, saveChatMessage } from './db.js';
import { chat, chatStream } from './groqClient.js';
import { executeTool } from './foodTools.js';
import { createSystemPrompt } from './systemPrompt.js';

async function handleChatMessage(message, userId, emit) {
  const user = userId ? await getUser(userId) : null;
  const history = userId ? await getRecentChatHistory(userId, 5) : [];

  // monta a conversa: system prompt + histórico + mensagem nova
  const messages = [
    { role: 'system', content: createSystemPrompt(user) },
    ...history.flatMap(row => [
      { role: 'user', content: row.user_message },
      { role: 'assistant', content: row.ai_response },
    ]),
    { role: 'user', content: message },
  ];

  // passo 1: stream da ia — texto ou tool calls
  let toolCallsResult = null;
  let fullText = '';
  let buffer = '';
  let moodHandled = false;

  for await (const chunk of chat(messages)) {
    if (chunk.type === 'tool_calls') {
      toolCallsResult = chunk;
      break;
    }

    // pedaço de texto — buffer até ao primeiro \n para extrair o MOOD
    fullText += chunk.content;
    if (!moodHandled) {
      buffer += chunk.content;
      const nl = buffer.indexOf('\n');
      if (nl !== -1) {
        const firstLine = buffer.slice(0, nl).trim();
        const moodMatch = firstLine.match(/^MOOD:(happy|ok|stressed|angry)$/);
        if (moodMatch) {
          emit({ event: 'mood', data: moodMatch[1] });
          const rest = buffer.slice(nl + 1).trimStart();
          if (rest) emit({ event: 'message', data: rest });
        } else {
          if (buffer) emit({ event: 'message', data: buffer });
        }
        moodHandled = true;
        buffer = '';
      }
    } else {
      emit({ event: 'message', data: chunk.content });
    }
  }

  // flush do buffer se o stream terminou sem encontrar \n
  if (!moodHandled && buffer) {
    emit({ event: 'message', data: buffer });
  }

  // resposta em texto: grava e termina
  if (!toolCallsResult) {
    if (userId) await saveChatMessage(userId, message, fullText);
    return;
  }

  // passo 2: executa as tools que a ia pediu
  const toolMessages = [];
  for (const tc of toolCallsResult.tool_calls) {
    const toolResult = await executeTool(tc.name, tc.args, userId);
    emit({ event: 'tool_action', data: toolResult });

    // passo 3: empacota o resultado para enviar de volta à ia
    toolMessages.push({
      role: 'tool',
      tool_call_id: tc.id,
      content: JSON.stringify(toolResult),
    });
  }

  // passo 4: envia resultados à ia → ela gera a confirmação em streaming
  const followUp = [...messages, toolCallsResult.message, ...toolMessages];
  let confirmText = '';

  for await (const chunk of chatStream(followUp)) {
    confirmText += chunk;
    emit({ event: 'message', data: chunk });
  }

  if (userId) await saveChatMessage(userId, message, confirmText);
}

export { handleChatMessage };
