import { generateJson } from './groqClient.js';
// usa o modo json da ia para garantir output sempre válido (sem markdown, sem texto livre)

// recebe texto em linguagem natural e devolve as macros estruturadas
async function parseNutritionFromText(text) {
  // prompt com o schema explícito e as regras de validação
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
  // injeta o texto da refeição no fim do prompt

  const response = await generateJson(prompt); // chama a ia em modo json — resposta sempre em json válido
  const raw = response.text?.trim();           // o texto da resposta — trim remove espaços em branco
  if (!raw) throw new Error('Resposta inválida.'); // não devia acontecer com response_format: json_object

  const clean = raw.replace(/```json|```/g, '').trim(); // remove cercas de código markdown por precaução
  const parsed = JSON.parse(clean);                      // converte a string json num objeto javascript

  if (parsed.valido === false) {
    // a ia rejeitou o texto — não é comida nem bebida
    const err = new Error(parsed.motivo || 'Esse alimento não é válido.');
    err.code = 'INVALID_FOOD'; // código personalizado reconhecido pelo api.js (devolve 400)
    throw err;
  }

  delete parsed.valido; // remove o campo interno "valido" — o caller só precisa das macros
  return parsed;        // devolve { alimento, kcal, proteina, carboidratos, gordura }
}

export { parseNutritionFromText };
