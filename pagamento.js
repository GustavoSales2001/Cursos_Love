const radios = document.querySelectorAll('input[name="pagamento"]');
const paymentInfo = document.getElementById("paymentInfo");

radios.forEach(radio => {
  radio.addEventListener("change", atualizarPagamento);
});

function atualizarPagamento() {
  const metodo = document.querySelector('input[name="pagamento"]:checked').value;

  if (metodo === "pix") {
    paymentInfo.innerHTML = `
      <div class="info-box">
        <h4>Pagamento via PIX</h4>
        <p>Chave PIX:</p>
        <div class="pix-key">seuemail@exemplo.com</div>
        <p class="note">Depois você pode integrar um sistema real de cobrança.</p>
      </div>
    `;
  }

  if (metodo === "cartao") {
    paymentInfo.innerHTML = `
      <div class="info-box">
        <h4>Pagamento com cartão</h4>
        <p>Essa opção pode ser integrada futuramente com Stripe, Mercado Pago ou outro gateway.</p>
        <div class="pix-key">Exemplo visual de pagamento por cartão</div>
        <p class="note">No momento, esta é uma simulação de interface.</p>
      </div>
    `;
  }

  if (metodo === "boleto") {
    paymentInfo.innerHTML = `
      <div class="info-box">
        <h4>Pagamento por boleto</h4>
        <p>Essa opção também pode ser integrada depois com um sistema real.</p>
        <div class="pix-key">Exemplo visual de boleto gerado</div>
        <p class="note">No momento, esta é uma simulação de interface.</p>
      </div>
    `;
  }
}

function confirmarPagamento() {
  localStorage.setItem("pagamentoConfirmado", "true");
  alert("Pagamento confirmado com sucesso.");
  window.location.href = "area.html";
}

function voltar() {
  window.location.href = "login.html";
}