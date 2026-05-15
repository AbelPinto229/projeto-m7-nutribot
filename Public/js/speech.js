const micBtn = document.getElementById("micBtn");
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;

if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.lang = "pt-PT";
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.onresult = (e) => {
    document.getElementById("userInput").value = e.results[0][0].transcript;
    micBtn.classList.remove("active");
  };
  recognition.onend = () => micBtn.classList.remove("active");
} else {
  micBtn.style.display = "none";
}

micBtn.addEventListener("click", () => {
  if (!recognition) return;
  if (micBtn.classList.contains("active")) {
    recognition.stop();
    micBtn.classList.remove("active");
  } else {
    recognition.start();
    micBtn.classList.add("active");
  }
});
