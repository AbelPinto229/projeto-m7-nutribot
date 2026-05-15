# Fluxo de uma mensagem no NutriBot
## Passo a passo

### 1. Utilizador escreve e envia
**Ficheiro:** `Public/js/chat.js`

O utilizador prime Enter ou clica Enviar — ambos chamam `sendMessage()`.

```js
// quando o utilizador prime Enter (sem Shift), envia a mensagem
userInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) sendMessage(); // Shift+Enter faz nova linha, Enter envia
});
sendBtn.addEventListener("click", sendMessage); // botão Enviar faz o mesmo
```

---

### 2. A mensagem parece comida?
**Ficheiros:** `Public/js/chat.js` → `Public/js/nutrition.js`

Antes de chamar o chat, verifica se o texto contém palavras como "comi", "almocei", "jantei", etc.

```js
if (looksLikeFood(text)) {          // verifica se o texto descreve comida
  const valid = await parseAndSaveFood(text); // extrai macros e guarda no diário
}
```

Se sim, faz um pedido separado:

**`POST /nutrition/parse`** → `src/api.js` → `src/nutriParser.js`
→ IA extrai macros em JSON → guarda na BD → devolve o item → `addDiaryItem()` atualiza o diário no ecrã.

---

### 3. Pedido ao chat (SSE)
**Ficheiro:** `Public/js/chat.js`

O browser abre uma ligação SSE para o servidor.

```js
// abre ligação SSE — a resposta chega aos bocados em vez de toda de uma vez
const res = await fetch(`/chat?message=${encodeURIComponent(text)}&user_id=${userId}`);
const reader = res.body.getReader(); // lê o stream chunk a chunk
```

---

### 4. Servidor recebe o pedido
**Ficheiro:** `src/api.js`

Define os headers SSE e delega ao `chatService.js`.

```js
app.get('/chat', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream'); // diz ao browser que é um stream
  res.setHeader('Cache-Control', 'no-cache');          // não guardar em cache
  res.flushHeaders();                                  // abre a ligação imediatamente
  await handleChatMessage(message, userId, emit);      // delega a lógica ao chatService
});
```

---

### 5. Monta a conversa e chama a IA
**Ficheiro:** `src/chatService.js`

Vai buscar o perfil do utilizador e o histórico à BD, monta o array de mensagens e chama `chat()`.

```js
const messages = [
  { role: 'system', content: createSystemPrompt(user) }, // regras + perfil do utilizador
  ...history,                                             // últimas 5 mensagens para contexto
  { role: 'user', content: message }                      // mensagem nova do utilizador
];

for await (const chunk of chat(messages)) { ... } // recebe a resposta da IA em streaming
```

---

### 6. Streaming da IA
**Ficheiro:** `src/groqClient.js`

Chama a API do Groq com `stream: true` e usa `for await` para ir recebendo os pedaços de resposta.

```js
async function* chat(messages) {
  const stream = await getClient().chat.completions.create({
    model: MODEL, messages, tools: TOOLS, stream: true // pede resposta em streaming
  });

  for await (const chunk of stream) {                              // lê cada pedaço que a IA gera
    if (delta?.content) yield { type: 'text', content: delta.content };        // pedaço de texto normal
    if (finish_reason === 'tool_calls') yield { type: 'tool_calls', ... };     // IA quer chamar uma função
  }
}
```

A IA pode responder de duas formas:

---

### 7a. Resposta em texto
**Ficheiro:** `src/chatService.js`

O `chatService` lê os chunks, deteta o MOOD na primeira linha e emite o texto chunk a chunk.

```
MOOD:happy      ← primeira linha indica o humor (happy / ok / stressed / angry)
(linha vazia)
Boa refeição! Tens 30g de proteína...   ← resto da resposta
```

- Emite evento `mood` → browser muda o tema visual
- Emite evento `message` com o texto → browser atualiza a bolha do chat

---

### 7b. Tool call (eliminar / substituir refeição)
**Ficheiros:** `src/chatService.js` → `src/foodTools.js`

Ciclo de 4 passos:

```
passo 1: IA pede → delete_food_entry("frango")   // IA decide chamar a função
passo 2: executeTool() apaga na BD               // nós executamos a função no servidor
passo 3: resultado enviado de volta à IA         // dizemos à IA o que aconteceu
passo 4: IA gera confirmação em streaming        // IA responde em texto ao utilizador
```

Emite evento `tool_action` → browser remove o item do diário no DOM.

---

### 8. Browser recebe os eventos SSE
**Ficheiro:** `Public/js/chat.js`

```js
if (pendingEventType === 'mood')         applyMood(...)      // muda o tema visual da app
if (pendingEventType === 'tool_action')  // remove ou atualiza item no diário
if (data === '[DONE]')                   // stream terminou, fecha a ligação
// caso normal: chunk de texto → vai sendo adicionado à bolha do chat
```
