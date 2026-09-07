/**
 * VOLUME — студия архитектурной визуализации
 * Модули: шапка, мобильное меню, появление блоков, счётчики, фильтр работ, форма заявки.
 * Каждый модуль самостоятелен и безопасно пропускается, если нужных элементов нет на странице.
 */

(() => {
  'use strict';

  /**
   * Настройки отправки заявок в Telegram.
   * botToken — токен бота от @BotFather.
   * chatId   — числовой id чата, куда бот присылает заявки (см. README).
   */
  const TELEGRAM = {
    botToken: '8923023720:AAHtBgT8700m7xxvCbDE0uEIdA9DVVH2wu8',
    chatId: '1284888662',
  };

  /* Шапка: фон при прокрутке */
  function initHeader() {
    const header = document.getElementById('header');
    if (!header) return;

    const toggle = () => header.classList.toggle('is-scrolled', window.scrollY > 10);
    window.addEventListener('scroll', toggle, { passive: true });
    toggle();
  }

  /* Мобильное меню */
  function initMobileMenu() {
    const burger = document.getElementById('burger');
    const nav = document.getElementById('nav');
    const header = document.getElementById('header');
    if (!burger || !nav || !header) return;

    const setState = (open) => {
      burger.classList.toggle('is-open', open);
      nav.classList.toggle('is-open', open);
      header.classList.toggle('is-menu-open', open);
      burger.setAttribute('aria-expanded', String(open));
      burger.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
      document.body.style.overflow = open ? 'hidden' : '';
    };

    burger.addEventListener('click', () => setState(!nav.classList.contains('is-open')));

    nav.addEventListener('click', (event) => {
      if (event.target.closest('a')) setState(false);
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && nav.classList.contains('is-open')) setState(false);
    });

    window.matchMedia('(min-width: 769px)').addEventListener('change', (mq) => {
      if (mq.matches) setState(false);
    });
  }

  /* Появление блоков при прокрутке */
  function initReveal() {
    const items = document.querySelectorAll('.reveal');
    if (!items.length) return;

    if (!('IntersectionObserver' in window)) {
      items.forEach((el) => el.classList.add('is-visible'));
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.1 });

    items.forEach((el) => observer.observe(el));
  }

  /* Анимированные счётчики в блоке «О студии» */
  function initCounters() {
    const counters = document.querySelectorAll('[data-counter]');
    if (!counters.length) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const animate = (el) => {
      const target = Number(el.dataset.counter);
      if (reduceMotion || !Number.isFinite(target)) {
        el.textContent = el.dataset.counter;
        return;
      }

      const duration = 1400;
      const start = performance.now();

      const tick = (now) => {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        el.textContent = Math.round(target * eased);
        if (progress < 1) requestAnimationFrame(tick);
      };

      requestAnimationFrame(tick);
    };

    if (!('IntersectionObserver' in window)) {
      counters.forEach(animate);
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        animate(entry.target);
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.5 });

    counters.forEach((el) => observer.observe(el));
  }

  /* Фильтр портфолио */
  function initPortfolioFilter() {
    const buttons = document.querySelectorAll('.filters__btn');
    const works = document.querySelectorAll('#works .work');
    if (!buttons.length || !works.length) return;

    buttons.forEach((button) => {
      button.addEventListener('click', () => {
        const filter = button.dataset.filter;

        buttons.forEach((b) => b.classList.toggle('is-active', b === button));
        works.forEach((work) => {
          const match = filter === 'all' || work.dataset.category === filter;
          work.classList.toggle('is-hidden', !match);
        });
      });
    });
  }

  /**
   * Правила полей формы: фильтр ввода (что можно печатать) и проверка перед отправкой.
   * Имя — только буквы, пробел и дефис. Телефон — только цифры и «+» в начале, до 15 цифр.
   */
  const FIELD_RULES = {
    name: {
      sanitize: (value) => value.replace(/[^\p{L}\s-]/gu, '').replace(/\s{2,}/g, ' '),
      isValid: (value) => value.trim().length >= 2,
    },
    phone: {
      sanitize: (value) => {
        const digits = value.replace(/\D/g, '').slice(0, 15);
        return value.startsWith('+') ? `+${digits}` : digits;
      },
      isValid: (value) => value.replace(/\D/g, '').length >= 10,
    },
  };

  /* Форма заявки: фильтрация ввода, валидация и отправка */
  function initLeadForm() {
    const form = document.getElementById('lead-form');
    const status = document.getElementById('form-status');
    if (!form || !status) return;

    const setStatus = (text, type) => {
      status.textContent = text;
      status.classList.toggle('is-error', type === 'error');
      status.classList.toggle('is-success', type === 'success');
    };

    const markField = (input, valid) => {
      const wrapper = input.closest('.field, .check');
      if (wrapper) wrapper.classList.toggle('is-invalid', !valid);
    };

    const isFieldValid = (input) => {
      if (input.type === 'checkbox') return input.checked;
      const rule = FIELD_RULES[input.name];
      return rule ? rule.isValid(input.value) : input.value.trim() !== '';
    };

    const validate = () => {
      let valid = true;

      form.querySelectorAll('[required]').forEach((input) => {
        const ok = isFieldValid(input);
        markField(input, ok);
        if (!ok) valid = false;
      });

      return valid;
    };

    form.addEventListener('input', (event) => {
      const input = event.target;
      const rule = FIELD_RULES[input.name];

      if (rule) {
        const clean = rule.sanitize(input.value);
        if (clean !== input.value) input.value = clean;
      }

      if (input.hasAttribute('required')) markField(input, true);
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();

      if (!validate()) {
        setStatus('Заполните обязательные поля и подтвердите согласие.', 'error');
        return;
      }

      const submitButton = form.querySelector('[type="submit"]');
      submitButton.disabled = true;
      setStatus('Отправляем…');

      try {
        await sendLead(collectLead(form));
        form.reset();
        setStatus('Спасибо! Пришлём расчёт в течение одного рабочего дня.', 'success');
      } catch (error) {
        setStatus('Не удалось отправить. Позвоните нам: +7 (999) 123-45-67.', 'error');
      } finally {
        submitButton.disabled = false;
      }
    });
  }

  /* Собирает данные формы в объект; для select берём видимый текст варианта, а не value */
  function collectLead(form) {
    const typeField = form.elements.type;

    return {
      name: form.elements.name.value.trim(),
      phone: form.elements.phone.value.trim(),
      type: typeField.selectedIndex > 0 ? typeField.options[typeField.selectedIndex].text : '',
      message: form.elements.message.value.trim(),
    };
  }

  /* Экранирует текст пользователя для HTML-разметки Telegram */
  function escapeHtml(text) {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* Текст сообщения для Telegram (parse_mode: HTML) */
  function formatLeadMessage(lead) {
    const date = new Date().toLocaleString('ru-RU', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });

    const lines = [
      '<b>🏠 Новая заявка с сайта VOLUME</b>',
      '',
      `<b>👤 Имя:</b> ${escapeHtml(lead.name)}`,
      `<b>📞 Телефон:</b> <code>${escapeHtml(lead.phone)}</code>`,
      `<b>🏗 Тип объекта:</b> ${escapeHtml(lead.type)}`,
    ];

    if (lead.message) {
      lines.push('', '<b>💬 О проекте:</b>', `<i>${escapeHtml(lead.message)}</i>`);
    }

    lines.push('', `<b>🕒</b> ${date}`);

    return lines.join('\n');
  }

  /* Отправка заявки через Telegram Bot API */
  async function sendLead(lead) {
    if (!TELEGRAM.botToken || !TELEGRAM.chatId) {
      throw new Error('Telegram не настроен: заполните TELEGRAM.botToken и TELEGRAM.chatId');
    }

    /* URLSearchParams вместо JSON: такой запрос не требует CORS-предзапроса, который Telegram не поддерживает */
    const response = await fetch(`https://api.telegram.org/bot${TELEGRAM.botToken}/sendMessage`, {
      method: 'POST',
      body: new URLSearchParams({
        chat_id: TELEGRAM.chatId,
        text: formatLeadMessage(lead),
        parse_mode: 'HTML',
      }),
    });

    if (!response.ok) {
      throw new Error(`Telegram API ответил статусом ${response.status}`);
    }
  }

  /* Год в подвале */
  function initYear() {
    const year = document.getElementById('year');
    if (year) year.textContent = new Date().getFullYear();
  }

  document.addEventListener('DOMContentLoaded', () => {
    initHeader();
    initMobileMenu();
    initReveal();
    initCounters();
    initPortfolioFilter();
    initLeadForm();
    initYear();
  });
})();
