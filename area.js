const tabButtons = document.querySelectorAll(".tab-btn");
const tabContents = document.querySelectorAll(".tab-content");

tabButtons.forEach(button => {
  button.addEventListener("click", () => {
    const target = button.getAttribute("data-tab");

    tabButtons.forEach(btn => btn.classList.remove("active"));
    tabContents.forEach(content => content.classList.remove("active"));

    button.classList.add("active");
    document.getElementById(target).classList.add("active");
  });
});

function abrirTab(tabId) {
  tabButtons.forEach(btn => btn.classList.remove("active"));
  tabContents.forEach(content => content.classList.remove("active"));

  document.querySelector(`[data-tab="${tabId}"]`).classList.add("active");
  document.getElementById(tabId).classList.add("active");
}

const usuario = JSON.parse(localStorage.getItem("usuario"));
const pagamentoConfirmado = localStorage.getItem("pagamentoConfirmado");

if (!usuario) {
  alert("Você precisa fazer login primeiro.");
  window.location.href = "login.html";
} else if (pagamentoConfirmado !== "true") {
  alert("Você precisa finalizar o pagamento antes de acessar o conteúdo.");
  window.location.href = "pagamento.html";
} else {
  document.getElementById("welcomeText").textContent =
    `Olá, ${usuario.nome}. Bom te ver por aqui.`;

  document.getElementById("perfilNome").textContent = usuario.nome || "-";
  document.getElementById("perfilEmail").textContent = usuario.email || "-";
  document.getElementById("perfilCelular").textContent = usuario.celular || "-";
  document.getElementById("perfilNascimento").textContent = usuario.nascimento || "-";
  document.getElementById("perfilArea").textContent = usuario.area || "-";
}

document.getElementById("logoutBtn").addEventListener("click", () => {
  localStorage.removeItem("usuario");
  localStorage.removeItem("pagamentoConfirmado");
  alert("Você saiu da área do aluno.");
  window.location.href = "login.html";
});