import Groq from 'groq-sdk';
import 'dotenv/config';

const client = new Groq({ apiKey: process.env.GROQ_API_KEY });
const MODEL = 'llama-3.3-70b-versatile';

function createSystemPrompt(user = null) {
  const base = `És o NutriBot, um assistente de nutrição direto e objetivo. Responde sempre em português de Portugal.`;

  const userContext = user
    ? `\nEstás a falar com ${user.nome}, ${user.idade} anos, ${user.peso}kg, ${user.altura}cm. Objetivo: ${user.objetivo}.`
    : '';

  const instrucoes = `

Quando o utilizador descreve uma refeição:
1. Lista os macronutrientes e calorias de cada alimento
2. Apresenta o total
3. Faz um comentário CURTO (1 frase) adaptado ao objetivo do utilizador

Exemplo:
**Ovos (2):** 140 kcal | P: 12g | C: 1g | G: 10g
**Total:** 140 kcal | P: 12g | C: 1g | G: 10g
✓ Boa fonte de proteína para o teu objetivo.`;

  return base + userContext + instrucoes;
}

function extractIncrementalText(chunk) {
  return chunk.choices?.[0]?.delta?.content || '';
}

async function chatStream(userMessage, history = [], user = null) {
  const messages = [
    { role: 'system', content: createSystemPrompt(user) },
    ...history.flatMap(row => [
      { role: 'user', content: row.user_message },
      { role: 'assistant', content: row.ai_response }
    ]),
    { role: 'user', content: userMessage }
  ];

  return client.chat.completions.create({
    model: MODEL,
    messages,
    stream: true,
    max_tokens: 600,
    temperature: 0.3
  });
}

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
    temperature: 0,
    response_format: { type: 'json_object' }
  });

  return { text: response.choices[0].message.content };
}

export { extractIncrementalText, chatStream, generateJson };