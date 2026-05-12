import { getUser, getRecentChatHistory, saveChatMessage } from './db.js';
import { chatWithTools } from './groqClient.js';
import { executeTool } from './foodTools.js';

// ── limpar markdown da resposta ───────────────────────────────────────────────
// a ia às vezes mete **negrito** ou # títulos — tiramos antes de mostrar
function limparMarkdown(texto) {
  return texto
    .replace(/\*\*(.*?)\*\*/g, '$1')   // tira **bold**
    .replace(/\*(.*?)\*/g, '$1')       // tira *itálico*
    .replace(/#{1,6}\s/g, '')          // tira # títulos
    .trim();
}

// ── processar uma mensagem de chat ────────────────────────────────────────────
// orquestra: vai buscar contexto, chama a ia, trata tool calls e extrai o mood.
// não conhece o express — comunica via callbacks (emit) e devolve o texto final
// para quem chamou poder persistir.
//
// emit é chamado com objetos { event, data }:
//   { event: 'tool_action', data: <resultado da tool> } → frontend atualiza o dom
//   { event: 'message',     data: <texto>             } → bolha normal no chat
//   { event: 'mood',        data: 'happy'|'ok'|...     } → frontend muda o tema
async function handleChatMessage(message, userId, emit) {
  // perfil do user + histórico recente para dar contexto à ia
  const user = userId ? await getUser(userId) : null;
  const history = userId ? await getRecentChatHistory(userId, 5) : [];

  // chamada à ia (pode devolver texto OU pedido de tool call)
  const result = await chatWithTools(message, history, user);

  // ── tool call: eliminar refeição ─────────────────────────────────────
  if (result.type === 'tool_call') {
    let confirmText = '';

    for (const tc of result.tool_calls) {
      // executa a função pedida pela ia
      const toolResult = await executeTool(tc.name, tc.args, userId);

      // notifica o frontend para atualizar o dom (remover item do diário)
      emit({ event: 'tool_action', data: toolResult });

      // monta a mensagem de confirmação a mostrar no chat
      if (!toolResult.success) {
        confirmText = toolResult.error;
      } else if (toolResult.action === 'delete_all') {
        confirmText = 'Eliminei todas as refeições do teu diário de hoje.';
      } else if (toolResult.action === 'delete_one') {
        confirmText = `Eliminei "${toolResult.deleted.alimento}" do teu diário.`;
      }
    }

    emit({ event: 'message', data: confirmText });
    if (userId) await saveChatMessage(userId, message, confirmText);
    return;
  }

  // ── resposta normal: extrai mood e envia ─────────────────────────────
  const fullText = result.text;
  const lines = fullText.split('\n');
  const firstLine = lines[0].trim();
  // a primeira linha deve estar no formato "MOOD:happy" (ou ok/stressed/angry)
  const moodMatch = firstLine.match(/^MOOD:(happy|ok|stressed|angry)$/);

  if (moodMatch) {
    // envia o mood como evento separado (o frontend muda o tema visual)
    emit({ event: 'mood', data: moodMatch[1] });
    // envia o resto do texto (sem a linha do mood) já sem markdown
    const rest = limparMarkdown(lines.slice(1).join('\n').trimStart());
    if (rest) emit({ event: 'message', data: rest });
  } else {
    // se não tiver mood, manda o texto todo
    emit({ event: 'message', data: limparMarkdown(fullText) });
  }

  // persiste a conversa para reaparecer numa próxima sessão
  if (userId) await saveChatMessage(userId, message, fullText);
}

export { handleChatMessage, limparMarkdown };
