import { generateJson } from './groqClient.js';

async function parseNutritionFromText(text) {
  const prompt = `Analisa esta refeição e devolve APENAS um objeto JSON válido com estes campos exatos:
{
  "alimento": "nome da refeição",
  "kcal": 000,
  "proteina": "00g",
  "carboidratos": "00g",
  "gordura": "00g"
}

Refeição: ${text}`;

  const response = await generateJson(prompt);
  const raw = response.text?.trim();
  if (!raw) throw new Error('Resposta inválida.');
  const clean = raw.replace(/```json|```/g, '').trim();
  return JSON.parse(clean);
}

export { parseNutritionFromText };