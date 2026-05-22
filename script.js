document.addEventListener('DOMContentLoaded', () => {
  const navToggle = document.getElementById('navToggle');
  const navLinks = document.querySelector('.nav-links');
  const ctaButton = document.getElementById('ctaButton');
  const ctaPrimary = document.getElementById('ctaPrimary');
  const toast = document.getElementById('toast');
  const ctaMessage = document.getElementById('ctaMessage');

  // Social Carousel infinite loop
  const socialTrack = document.querySelector('.social-carousel-track');
  if (socialTrack && socialTrack.children.length > 0) {
    const cards = Array.from(socialTrack.children);
    cards.forEach((card) => {
      const clone = card.cloneNode(true);
      socialTrack.appendChild(clone);
    });
  }

  if (navToggle && navLinks) {
    navToggle.addEventListener('click', () => {
      const isOpen = !navLinks.classList.contains('show');
      navLinks.classList.toggle('show');
      navToggle.classList.toggle('open');
      navToggle.setAttribute('aria-expanded', String(isOpen));
    });

    navLinks.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        if (navLinks.classList.contains('show')) {
          navLinks.classList.remove('show');
          navToggle.classList.remove('open');
        }
      });
    });
  }

  const faqToggles = document.querySelectorAll('.faq-toggle');
  faqToggles.forEach((toggle) => {
    toggle.setAttribute('aria-expanded', 'false');
    toggle.addEventListener('click', () => {
      const item = toggle.closest('.faq-item');
      if (!item) return;
      const isOpen = item.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(isOpen));
    });
  });

  function showToast(msg = 'Ação realizada', ms = 3800) {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), ms);
  }

  if (ctaButton) {
    ctaButton.addEventListener('click', (e) => {
      e.preventDefault();
      showToast('Obrigado! Redirecionando para cadastro...');
      if (ctaMessage) ctaMessage.textContent = 'Finalize sua inscrição e comece agora mesmo.';
      setTimeout(() => { window.location = 'login.html'; }, 900);
    });
  }

  if (ctaPrimary) {
    ctaPrimary.addEventListener('click', (e) => {
      e.preventDefault();
      showToast('Preparando o acesso ao curso...');
      if (ctaMessage) ctaMessage.textContent = 'Redirecionando para sua área de inscrição…';
      setTimeout(() => { window.location = 'login.html'; }, 900);
    });
  }

  // Carousel automático de resultados
  const track = document.querySelector('.carousel-track');
  const slides = track ? Array.from(track.children) : [];
  const prevBtn = document.querySelector('.carousel-prev');
  const nextBtn = document.querySelector('.carousel-next');
  let index = 0;
  let slideWidth = slides[0] ? slides[0].getBoundingClientRect().width + 12 : 240;
  let autoId = null;

  function moveTo(i) {
    if (!track) return;
    index = (i + slides.length) % slides.length;
    const x = -(slideWidth * index);
    track.style.transform = `translateX(${x}px)`;
  }

  function next() { moveTo(index + 1); }
  function prev() { moveTo(index - 1); }

  function startAuto() {
    stopAuto();
    autoId = setInterval(next, 3800);
  }

  function stopAuto() { if (autoId) clearInterval(autoId); }

  if (nextBtn) nextBtn.addEventListener('click', () => { next(); startAuto(); });
  if (prevBtn) prevBtn.addEventListener('click', () => { prev(); startAuto(); });

  // Recalcular largura ao redimensionar
  window.addEventListener('resize', () => {
    slideWidth = slides[0] ? slides[0].getBoundingClientRect().width + 12 : slideWidth;
    moveTo(index);
  });

  if (track && slides.length > 0) {
    // garantir que o track tenha largura suficiente para o scroll
    startAuto();
    track.parentElement.addEventListener('mouseenter', stopAuto);
    track.parentElement.addEventListener('mouseleave', startAuto);
  }

  // Small accessibility: close mobile menu when clicking outside
  document.addEventListener('click', (ev) => {
    if (!navLinks || !navToggle) return;
    if (navLinks.classList.contains('show')) {
      const withinNav = ev.target.closest('.nav-links') || ev.target.closest('#navToggle');
      if (!withinNav) navLinks.classList.remove('show');
    }
  });
});