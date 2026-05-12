// ── traduzir erros da ia em mensagens amigáveis para o user ──────────────────
// recebe o erro apanhado num try/catch e devolve uma string em pt-pt
// usa o code (definido por nós, ex: NO_API_KEY) ou o status http (do groq-sdk) para decidir
function mensagemErroIA(err) {
  if (err.code === 'NO_API_KEY') {
    return '⚠️ O serviço de IA não está configurado. Avisa o admin';
  }
  if (err.status === 401) {
    return '⚠️ A chave de IA é inválida ou expirou. Avisa o admin.';
  }
  if (err.status === 429) {
    return '⚠️ Demasiados pedidos à IA. Espera um minuto e tenta novamente.';
  }
  if (err.status >= 500 && err.status < 600) {
    return '⚠️ A IA está temporariamente indisponível. Tenta daqui a pouco.';
  }
  // qualquer outro caso (rede, timeout, erro inesperado)
  return '⚠️ Não consegui contactar a IA. Tenta novamente.';
}

export { mensagemErroIA };
