import { generateJson } from './groqClient.js';

// recebe um texto em linguagem natural e devolve as macros estruturadas
// se o texto não descrever um alimento real e seguro para consumo humano,
// a ia devolve { "valido": false, "motivo": "..." } e nós atiramos um erro tipado
async function parseNutritionFromText(text) {
  // prompt com o schema explícito para a ia respeitar
  // inclui regra para rejeitar alimentos inválidos / não comestíveis
  const prompt = `Analisa esta refeição/bebida e devolve APENAS um objeto JSON válido.

REGRAS:
- Alimentos e bebidas (incluindo álcool — cerveja, vinho, shots, etc.) são SEMPRE válidos, independentemente da quantidade indicada. NUNCA rejeites por a quantidade ser grande, absurda ou por ser álcool. "um barril de cerveja", "20 litros de vinho" → válido, calcula as kcal.
- Calcula as calorias com base na quantidade real indicada, mesmo que seja muito (ex: "20 litros de cerveja" → calcula as kcal de 20 litros).
- Só rejeitas se o texto não for comida nem bebida (ex: "pedra", "papel", "ar", elementos químicos tóxicos).

Se for válido, devolve:
{
  "valido": true,
  "alimento": "nome INCLUINDO quantidades — ex: '300g de bananas', '2 ovos mexidos', '20 litros de cerveja'. NUNCA omitas a quantidade.",
  "kcal": 000,
  "proteina": "00g",
  "carboidratos": "00g",
  "gordura": "00g"
}

Se NÃO for comida nem bebida, devolve:
{
  "valido": false,
  "motivo": "explicação curta"
}

Refeição/bebida: ${text}`;

  // chama a ia em modo json (response_format garante json válido)
  const response = await generateJson(prompt);
  const raw = response.text?.trim();
  if (!raw) throw new Error('Resposta inválida.');
  // por precaução, tira cercas markdown caso a ia as ponha
  const clean = raw.replace(/```json|```/g, '').trim();
  const parsed = JSON.parse(clean);

  // se a ia rejeitou o alimento, atira erro tipado para o api.js tratar
  if (parsed.valido === false) {
    const err = new Error(parsed.motivo || 'Esse alimento não é válido.');
    err.code = 'INVALID_FOOD';
    throw err;
  }

  // remove o campo "valido" (interno) antes de devolver
  delete parsed.valido;
  return parsed;
}

export { parseNutritionFromText };
