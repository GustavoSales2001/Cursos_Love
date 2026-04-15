document.addEventListener("DOMContentLoaded", () => {

  const tabButtons = document.querySelectorAll(".tab-btn");
  const tabContents = document.querySelectorAll(".tab-content");

  tabButtons.forEach(button => {
    button.addEventListener("click", () => {
      const target = button.getAttribute("data-tab");

      tabButtons.forEach(btn => btn.classList.remove("active"));
      tabContents.forEach(content => content.classList.remove("active"));

      button.classList.add("active");

      const targetElement = document.getElementById(target);
      if (targetElement) {
        targetElement.classList.add("active");
      }
    });
  });

  function abrirTab(tabId) {
    tabButtons.forEach(btn => btn.classList.remove("active"));
    tabContents.forEach(content => content.classList.remove("active"));

    const btn = document.querySelector(`[data-tab="${tabId}"]`);
    const content = document.getElementById(tabId);

    if (btn) btn.classList.add("active");
    if (content) content.classList.add("active");
  }

  const usuario = JSON.parse(localStorage.getItem("usuario"));

  // 🔥 NOVO: valida pagamento por email
  const pagamentoConfirmado = usuario?.email
    ? localStorage.getItem(`pagamentoConfirmado_${usuario.email}`)
    : null;

  if (!usuario) {
    alert("Você precisa fazer login primeiro.");
    window.location.href = "login.html";
  } else if (pagamentoConfirmado !== "true") {
    alert("Você precisa finalizar o pagamento antes de acessar o conteúdo.");
    window.location.href = "pagamento.html";
  } else {

    const welcomeText = document.getElementById("welcomeText");
    if (welcomeText) {
      welcomeText.textContent = `Olá, ${usuario.nome}. Bom te ver por aqui.`;
    }

    const perfilNome = document.getElementById("perfilNome");
    const perfilEmail = document.getElementById("perfilEmail");
    const perfilCelular = document.getElementById("perfilCelular");
    const perfilNascimento = document.getElementById("perfilNascimento");
    const perfilArea = document.getElementById("perfilArea");

    if (perfilNome) perfilNome.textContent = usuario.nome || "-";
    if (perfilEmail) perfilEmail.textContent = usuario.email || "-";
    if (perfilCelular) perfilCelular.textContent = usuario.celular || "-";
    if (perfilNascimento) perfilNascimento.textContent = usuario.nascimento || "-";
    if (perfilArea) perfilArea.textContent = usuario.area || "-";
  }

  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      localStorage.removeItem("usuario"); // 🔥 NÃO remove pagamento
      alert("Você saiu da área do aluno.");
      window.location.href = "login.html";
    });
  }

});