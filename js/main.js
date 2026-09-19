/**
 * VOLUME — студия архитектурной визуализации
 * Модули: шапка, мобильное меню, появление блоков, счётчики, фильтр работ, форма заявки.
 * Каждый модуль самостоятелен и безопасно пропускается, если нужных элементов нет на странице.
 */

(() => {
  'use strict';

  /**
   * Адрес серверного обработчика заявок.
   * Браузер отправляет данные сюда (на наш же сайт), а сервер уже пересылает
   * их в Telegram. Так заявка работает даже там, где api.telegram.org заблокирован.
   */
  const LEAD_ENDPOINT = '/api/send.php';

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

    let savedScrollY = 0;

    /* Блокировка прокрутки под открытым меню. iOS Safari игнорирует overflow: hidden
       на body, поэтому фиксируем body и запоминаем позицию, чтобы вернуть её при закрытии */
    const lockScroll = (lock) => {
      const { style } = document.body;

      if (lock) {
        savedScrollY = window.scrollY;
        style.position = 'fixed';
        style.top = `-${savedScrollY}px`;
        style.width = '100%';
        return;
      }

      style.position = '';
      style.top = '';
      style.width = '';
      window.scrollTo({ top: savedScrollY, behavior: 'instant' });
    };

    const setState = (open) => {
      if (open === nav.classList.contains('is-open')) return;

      burger.classList.toggle('is-open', open);
      nav.classList.toggle('is-open', open);
      header.classList.toggle('is-menu-open', open);
      burger.setAttribute('aria-expanded', String(open));
      burger.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
      lockScroll(open);
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
          /* Перезапуск анимации появления для оставшихся карточек */
          work.classList.remove('is-showing');
          if (match) {
            void work.offsetWidth;
            work.classList.add('is-showing');
          }
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

  /* Отправка заявки на серверный обработчик, который перешлёт её в Telegram */
  async function sendLead(lead) {
    const response = await fetch(LEAD_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(lead),
    });

    if (!response.ok) {
      throw new Error(`Сервер ответил статусом ${response.status}`);
    }
  }

  /* FAQ: плавное раскрытие и сворачивание через Web Animations API */
  function initFaq() {
    const items = document.querySelectorAll('.faq__item');
    if (!items.length) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timing = { duration: 380, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' };

    items.forEach((item) => {
      const summary = item.querySelector('.faq__question');
      const body = item.querySelector('.faq__body');
      if (!summary || !body) return;

      let animation = null;

      const open = () => {
        item.open = true;
        animation = body.animate([{ height: '0px', opacity: 0 }, { height: `${body.scrollHeight}px`, opacity: 1 }], timing);
        animation.onfinish = () => { animation = null; };
      };

      const close = () => {
        animation = body.animate([{ height: `${body.offsetHeight}px`, opacity: 1 }, { height: '0px', opacity: 0 }], timing);
        animation.onfinish = () => {
          item.open = false;
          animation = null;
        };
      };

      summary.addEventListener('click', (event) => {
        event.preventDefault();
        if (reduceMotion) {
          item.open = !item.open;
          return;
        }
        if (animation) animation.cancel();
        if (item.open) close(); else open();
      });
    });
  }

  /* Бегущая строка клиентов: дублируем список для бесшовного цикла */
  function initMarquee() {
    const list = document.getElementById('clients-list');
    if (!list || list.children.length === 0) return;

    const clones = [...list.children].map((item) => {
      const clone = item.cloneNode(true);
      clone.setAttribute('aria-hidden', 'true');
      return clone;
    });

    list.append(...clones);
  }

  /* Подсветка активного пункта меню по текущей секции */
  function initScrollSpy() {
    const links = [...document.querySelectorAll('.nav__link[href^="#"]')];
    if (!links.length || !('IntersectionObserver' in window)) return;

    const sections = links
      .map((link) => document.getElementById(link.hash.slice(1)))
      .filter(Boolean);

    const setActive = (id) => {
      links.forEach((link) => link.classList.toggle('is-active', link.hash === `#${id}`));
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) setActive(entry.target.id);
      });
    }, { rootMargin: '-40% 0px -55% 0px' });

    sections.forEach((section) => observer.observe(section));
  }

  /* «Прожектор» на карточках услуг: координаты курсора → CSS-переменные */
  function initSpotlight() {
    const list = document.querySelector('.services__list');
    if (!list || !window.matchMedia('(hover: hover)').matches) return;

    list.addEventListener('pointermove', (event) => {
      const card = event.target.closest('.service');
      if (!card) return;

      const rect = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${event.clientX - rect.left}px`);
      card.style.setProperty('--my', `${event.clientY - rect.top}px`);
    });
  }

  /* Параллакс картинки в первом экране */
  function initParallax() {
    const media = document.querySelector('.hero__media');
    const image = media && media.querySelector('img');
    if (!image || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let ticking = false;

    const update = () => {
      ticking = false;
      const rect = media.getBoundingClientRect();
      if (rect.bottom < 0) return;
      image.style.setProperty('--parallax', `${Math.round(-rect.top * 0.08)}px`);
    };

    window.addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    }, { passive: true });

    update();
  }

  /* Подтверждение звонка: все ссылки tel: открывают окно, звонок идёт по кнопке в нём */
  function initCallDialog() {
    const dialog = document.getElementById('call-dialog');
    if (!dialog || typeof dialog.showModal !== 'function') return;

    const numberEl = document.getElementById('call-dialog-number');
    const callLink = document.getElementById('call-dialog-link');

    document.addEventListener('click', (event) => {
      const link = event.target.closest('a[href^="tel:"]');
      if (!link || dialog.contains(link)) return;

      event.preventDefault();
      numberEl.textContent = link.textContent.trim().replace(/^Позвонить\s*/i, '');
      callLink.href = link.href;
      dialog.showModal();
    });

    dialog.addEventListener('click', (event) => {
      /* Клик по подложке или по кнопке отмены закрывает окно; клик внутри карточки — нет */
      if (event.target === dialog || event.target.closest('[data-dialog-close]')) dialog.close();
    });

    callLink.addEventListener('click', () => dialog.close());
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
    initFaq();
    initMarquee();
    initScrollSpy();
    initSpotlight();
    initParallax();
    initCallDialog();
    initYear();
  });
})();
