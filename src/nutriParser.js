import { generateJson } from './groqClient.js';

// recebe um texto em linguagem natural e devolve as macros estruturadas
// se o texto não descrever um alimento real e seguro para consumo humano,
// a ia devolve { "valido": false, "motivo": "..." } e nós atiramos um erro tipado
async function parseNutritionFromText(text) {
  // prompt com o schema explícito para a ia respeitar
  // inclui regra para rejeitar alimentos inválidos / não comestíveis
  const prompt = `Analisa esta refeição e devolve APENAS um objeto JSON válido.

Se o texto descrever um alimento REAL, comum e seguro para consumo humano, devolve:
{
  "valido": true,
  "alimento": "nome da refeição INCLUINDO quantidades — ex: '300g de bananas', '2 ovos mexidos', '150g de frango e 100g de arroz'. NUNCA omitas a quantidade se o utilizador a indicar.",
  "kcal": 000,
  "proteina": "00g",
  "carboidratos": "00g",
  "gordura": "00g"
}

Se o texto NÃO for um alimento real (ex: "tubarão", "pedra", "papel", "ar"), não for comestível, for tóxico, for uma marca abstrata, ou for uma piada/teste, devolve:
{
  "valido": false,
  "motivo": "explicação curta do porquê"
}

Refeição: ${text}`;

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
