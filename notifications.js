// Sistema de Notificações Profissional
class NotificationSystem {
  constructor() {
    this.createContainer();
  }

  createContainer() {
    if (!document.getElementById('notification-container')) {
      const container = document.createElement('div');
      container.id = 'notification-container';
      container.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 9999;
        display: flex;
        flex-direction: column;
        gap: 12px;
        pointer-events: none;
      `;
      document.body.appendChild(container);
    }
  }

  show(message, type = 'info', duration = 4000) {
    const container = document.getElementById('notification-container');
    const notification = document.createElement('div');
    const id = `notification-${Date.now()}`;
    notification.id = id;

    // Estilos base
    const baseStyle = `
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 14px 18px;
      border-radius: 10px;
      font-size: 0.95rem;
      font-weight: 500;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
      animation: slideIn 0.3s ease;
      pointer-events: auto;
      cursor: pointer;
      max-width: 380px;
      word-break: break-word;
    `;

    // Cores por tipo
    const colors = {
      success: {
        bg: 'rgba(34, 197, 94, 0.1)',
        border: '1px solid rgba(34, 197, 94, 0.3)',
        text: '#22c55e',
        icon: '✓'
      },
      error: {
        bg: 'rgba(239, 68, 68, 0.1)',
        border: '1px solid rgba(239, 68, 68, 0.3)',
        text: '#ef4444',
        icon: '✕'
      },
      warning: {
        bg: 'rgba(245, 158, 11, 0.1)',
        border: '1px solid rgba(245, 158, 11, 0.3)',
        text: '#f59e0b',
        icon: '⚠'
      },
      info: {
        bg: 'rgba(56, 189, 248, 0.1)',
        border: '1px solid rgba(56, 189, 248, 0.3)',
        text: '#38bdf8',
        icon: 'ℹ'
      }
    };

    const config = colors[type] || colors.info;

    notification.style.cssText = `
      ${baseStyle}
      background: ${config.bg};
      border: ${config.border};
      color: #f8fafc;
    `;

    notification.innerHTML = `
      <span style="color: ${config.text}; font-size: 1.2rem; flex-shrink: 0;">${config.icon}</span>
      <span>${message}</span>
      <span style="margin-left: auto; cursor: pointer; color: ${config.text}; font-size: 1.2rem; flex-shrink: 0;" onclick="document.getElementById('${id}').remove()">×</span>
    `;

    container.appendChild(notification);

    if (duration) {
      setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
      }, duration);
    }
  }

  success(message, duration = 4000) {
    this.show(message, 'success', duration);
  }

  error(message, duration = 5000) {
    this.show(message, 'error', duration);
  }

  warning(message, duration = 4000) {
    this.show(message, 'warning', duration);
  }

  info(message, duration = 4000) {
    this.show(message, 'info', duration);
  }
}

// Inicializar notificações globalmente
const notify = new NotificationSystem();

// Adicionar animações ao documento
if (!document.getElementById('notification-styles')) {
  const style = document.createElement('style');
  style.id = 'notification-styles';
  style.textContent = `
    @keyframes slideIn {
      from {
        transform: translateX(400px);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }

    @keyframes slideOut {
      from {
        transform: translateX(0);
        opacity: 1;
      }
      to {
        transform: translateX(400px);
        opacity: 0;
      }
    }

    @media (max-width: 480px) {
      #notification-container {
        left: 10px !important;
        right: 10px !important;
      }

      #notification-container > div {
        max-width: 100% !important;
      }
    }
  `;
  document.head.appendChild(style);
}
