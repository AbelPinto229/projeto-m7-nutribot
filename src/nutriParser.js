import { generateJson } from './groqClient.js';

// recebe um texto em linguagem natural e devolve as macros estruturadas
async function parseNutritionFromText(text) {
  // prompt com o schema explícito para a ia respeitar
  const prompt = `Analisa esta refeição e devolve APENAS um objeto JSON válido com estes campos exatos:
{
  "alimento": "nome da refeição",
  "kcal": 000,
  "proteina": "00g",
  "carboidratos": "00g",
  "gordura": "00g"
}

Refeição: ${text}`;

  // chama a ia em modo json (response_format garante json válido)
  const response = await generateJson(prompt);
  const raw = response.text?.trim();
  if (!raw) throw new Error('Resposta inválida.');
  // por precaução, tira cercas markdown caso a ia as ponha
  const clean = raw.replace(/```json|```/g, '').trim();
  // converte para objeto js
  return JSON.parse(clean);
}

export { parseNutritionFromText };
