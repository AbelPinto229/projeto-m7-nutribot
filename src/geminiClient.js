import Groq from 'groq-sdk';
import 'dotenv/config';

const client = new Groq({ apiKey: process.env.GROQ_API_KEY });
const MODEL = 'llama-3.3-70b-versatile';

function createSystemPrompt() {
  return `És o NutriBot, um assistente especializado em nutrição. Quando o utilizador descreve uma refeição, extrais os macronutrientes e calorias de forma precisa e útil.`;
}

function extractIncrementalText(chunk) {
  return chunk.choices?.[0]?.delta?.content || '';
}

async function chatStream(userMessage, history = []) {
  const messages = [
    { role: 'system', content: createSystemPrompt() },
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
    max_tokens: 800,
    temperature: 0.3
  });
}

async function generateJson(prompt, schema) {
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