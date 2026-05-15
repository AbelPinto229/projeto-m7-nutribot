const micBtn = document.getElementById("micBtn"); // botão do microfone no html

// a api de reconhecimento de voz tem nomes diferentes consoante o browser
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
// chrome/edge usam "webkitSpeechRecognition", outros usam "SpeechRecognition"
// o || garante compatibilidade com ambos

let recognition = null; // vai guardar o objeto de reconhecimento de voz

if (SpeechRecognition) {
  // só configura se o browser suportar a api (chrome e edge suportam, firefox não)

  recognition = new SpeechRecognition(); // cria o objeto de reconhecimento

  recognition.lang = "pt-PT";           // idioma: português de portugal
  recognition.continuous = false;        // false = para após detetar uma pausa (não fica a ouvir sempre)
  recognition.interimResults = false;    // false = só devolve o resultado final, sem texto intermédio

  recognition.onresult = (e) => {
    document.getElementById("userInput").value = e.results[0][0].transcript;
    // coloca o texto reconhecido no campo de input
    // e.results[0][0].transcript = o texto em string do que foi dito
    micBtn.classList.remove("active"); // para a animação visual do microfone
  };

  recognition.onend = () => micBtn.classList.remove("active");
  // quando o reconhecimento termina (mesmo sem resultado), desativa o botão

} else {
  micBtn.style.display = "none"; // esconde o botão se o browser não suportar a api
}

// alterna o reconhecimento de voz ao clicar no botão
micBtn.addEventListener("click", () => {
  if (!recognition) return; // se o browser não suporta, não faz nada

  if (micBtn.classList.contains("active")) {
    // microfone já está ativo — o utilizador clicou para parar
    recognition.stop();                // para o reconhecimento
    micBtn.classList.remove("active"); // desativa visualmente o botão
  } else {
    // microfone está inativo — o utilizador quer começar a falar
    recognition.start();            // começa a ouvir
    micBtn.classList.add("active"); // ativa visualmente o botão
  }
});
