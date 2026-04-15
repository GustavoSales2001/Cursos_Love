document.addEventListener("DOMContentLoaded", async () => {
  const API_BASE_URL = "https://cursoslove-production.up.railway.app/api";

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

  if (!usuario || !usuario.email) {
    alert("Você precisa fazer login primeiro.");
    window.location.href = "login.html";
    return;
  }

  try {
    const response = await fetch(
      `${API_BASE_URL}/users/access/${encodeURIComponent(usuario.email)}`
    );

    const data = await response.json();

    if (!response.ok || !data.user) {
      alert("Usuário não encontrado. Faça login novamente.");
      localStorage.removeItem("usuario");
      window.location.href = "login.html";
      return;
    }

    const usuarioBanco = data.user;

    localStorage.setItem(
      "usuario",
      JSON.stringify({
        ...usuario,
        nome: usuario.nome || usuarioBanco.name || "",
        email: usuarioBanco.email
      })
    );

    if (usuarioBanco.access_released !== 1) {
      alert("Você precisa finalizar o pagamento antes de acessar o conteúdo.");
      window.location.href = "pagamento.html";
      return;
    }

    const usuarioAtualizado = JSON.parse(localStorage.getItem("usuario"));

    const welcomeText = document.getElementById("welcomeText");
    if (welcomeText) {
      welcomeText.textContent = `Olá, ${usuarioAtualizado.nome || "aluno(a)"}. Bom te ver por aqui.`;
    }

    const perfilNome = document.getElementById("perfilNome");
    const perfilEmail = document.getElementById("perfilEmail");
    const perfilCelular = document.getElementById("perfilCelular");
    const perfilNascimento = document.getElementById("perfilNascimento");
    const perfilArea = document.getElementById("perfilArea");

    if (perfilNome) perfilNome.textContent = usuarioAtualizado.nome || "-";
    if (perfilEmail) perfilEmail.textContent = usuarioAtualizado.email || "-";
    if (perfilCelular) perfilCelular.textContent = usuarioAtualizado.celular || "-";
    if (perfilNascimento) perfilNascimento.textContent = usuarioAtualizado.nascimento || "-";
    if (perfilArea) perfilArea.textContent = usuarioAtualizado.area || "-";
  } catch (error) {
    console.error("Erro ao validar acesso:", error);
    alert("Erro ao validar acesso. Tente novamente.");
    window.location.href = "login.html";
    return;
  }

  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      localStorage.removeItem("usuario");
      alert("Você saiu da área do aluno.");
      window.location.href = "login.html";
    });
  }
});