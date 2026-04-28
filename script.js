const ctaButton = document.getElementById("ctaButton");
const ctaMessage = document.getElementById("ctaMessage");

if (ctaButton && ctaMessage) {
  ctaButton.addEventListener("click", () => {
    ctaMessage.textContent = "Em breve você poderá acessar a área do curso com login e senha.";
  });
}