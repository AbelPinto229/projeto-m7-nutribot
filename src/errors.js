// converte erros técnicos da api do groq em mensagens amigáveis em pt-pt
// recebe o objeto de erro do try/catch e devolve uma string para o utilizador
function mensagemErroIA(err) {
  if (err.code === 'NO_API_KEY') {
    // código definido por nós no groqClient.js — a variável groq_api_key não está no .env
    return '⚠️ O serviço de IA não está configurado. Avisa o admin';
  }
  if (err.status === 401) {
    // 401 unauthorized — a chave existe mas é inválida ou foi revogada no painel do groq
    return '⚠️ A chave de IA é inválida ou expirou. Avisa o admin.';
  }
  if (err.status === 429) {
    // 429 too many requests — limite de tokens ou pedidos da conta groq atingido
    // no plano gratuito: 100 000 tokens/dia ou 30 pedidos/minuto
    return '⚠️ Demasiados pedidos à IA. Espera um minuto e tenta novamente.';
  }
  if (err.status >= 500 && err.status < 600) {
    // 5xx server error — problema nos servidores do groq (não é culpa do nosso código)
    return '⚠️ A IA está temporariamente indisponível. Tenta daqui a pouco.';
  }
  // fallback para qualquer outro erro: timeout, erro de rede, exceção inesperada
  return '⚠️ Não consegui contactar a IA. Tenta novamente.';
}

export { mensagemErroIA };
