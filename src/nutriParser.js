import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { generateJson } from './geminiClient.js';

const nutriSchema = z.object({
  alimento: z.string().min(1),
  kcal: z.number().int().min(0),
  proteina: z.string().min(1),
  carboidratos: z.string().min(1),
  gordura: z.string().min(1)
});

const nutriJsonSchema = zodToJsonSchema(nutriSchema, { target: 'jsonSchema' });

async function parseNutritionFromText(text) {
  const prompt = `Analisa a seguinte descrição de refeição e devolve apenas JSON válido com os campos: alimento, kcal (número inteiro), proteina (ex: "12g"), carboidratos (ex: "30g"), gordura (ex: "5g"). Descrição: ${text}`;
  const response = await generateJson(prompt, nutriJsonSchema);
  const raw = response.text?.trim();
  if (!raw) {
    throw new Error('Resposta inválida do modelo ao extrair nutrição.');
  }
  const parsed = JSON.parse(raw);
  return nutriSchema.parse(parsed);
}

export { parseNutritionFromText, nutriSchema };