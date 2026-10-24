// First-run guided tour: spotlight + popover, no dependencies.
const STORAGE_KEY = 'dashboard-tour-done';

const STEPS = [
  {
    title: 'Welcome to Network Diagnostics 👋',
    body: 'A quick 30-second tour of what you can do here. You can skip it any time and replay it later from the sidebar.'
  },
  {
    target: '.sidebar nav',
    title: 'Navigate with the sidebar',
    body: 'Switch between your page overview, the two visual diagrams, the diagnostics tools and the About page.',
    placement: 'right'
  },
  {
    target: '#network-controls',
    title: 'Collect metrics',
    body: 'Open the extension from the page you want to analyze, then press “Collect Network Metrics”. Everything in the dashboard is built from that run.',
    placement: 'bottom'
  },
  {
    tab: 'info',
    target: '#info .metrics-container',
    title: 'Core Web Vitals & bandwidth',
    body: 'See LCP, INP, CLS and FID rated good / needs improvement / poor, along with your connection quality. Below them you will find the performance score, AI insights, resource tables, waterfall and exports.',
    placement: 'top'
  },
  {
    tab: 'traffic',
    target: '#traffic .flow-card',
    title: 'Traffic Flow',
    body: 'Follow requests from the browser through resource types to the domains that served them. Thicker lines mean more bytes. Click any node to trace its path, or show third-party traffic only.',
    placement: 'top'
  },
  {
    tab: 'connection',
    target: '#connection .flow-card',
    title: 'Connection Diagram',
    body: 'The journey of your page load: DNS, TCP, TLS, request and response, plus the server IP, protocol and a timeline of where the time went.',
    placement: 'top'
  },
  {
    tab: 'tools',
    target: '#tools .diag-controls',
    title: 'Diagnostics Tools',
    body: 'Enter any URL to test its reachability and response time and get tips to fix problems.',
    placement: 'bottom'
  },
  {
    tab: 'info',
    title: 'You are all set 🎉',
    body: 'Go to a website, open the extension and press “Collect Network Metrics”. Tip: use “Take the tour” in the sidebar to replay this walkthrough.'
  }
];

class Walkthrough {
  constructor() {
    this.index = 0;
    this.active = false;
    this.onResize = () => this.position();
    this.onKey = e => {
      if (!this.active) return;
      if (e.key === 'Escape') this.finish();
      else if (e.key === 'ArrowRight' || e.key === 'Enter') this.next();
      else if (e.key === 'ArrowLeft') this.prev();
    };
  }

  shouldAutoStart() {
    try { return !localStorage.getItem(STORAGE_KEY); } catch { return false; }
  }

  start() {
    if (this.active) return;
    this.active = true;
    this.index = 0;
    this.spot = document.createElement('div');
    this.spot.className = 'tour-spot';
    this.pop = document.createElement('div');
    this.pop.className = 'tour-pop';
    this.pop.setAttribute('role', 'dialog');
    this.pop.setAttribute('aria-modal', 'true');
    document.body.append(this.spot, this.pop);
    window.addEventListener('resize', this.onResize);
    window.addEventListener('scroll', this.onResize, true);
    document.addEventListener('keydown', this.onKey);
    this.show();
  }

  next() {
    if (this.index >= STEPS.length - 1) return this.finish();
    this.index++;
    this.show();
  }

  prev() {
    if (this.index === 0) return;
    this.index--;
    this.show();
  }

  finish() {
    if (!this.active) return;
    this.active = false;
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch { /* storage unavailable */ }
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('scroll', this.onResize, true);
    document.removeEventListener('keydown', this.onKey);
    this.spot.remove();
    this.pop.remove();
  }

  show() {
    const step = STEPS[this.index];
    if (step.tab) document.querySelector(`.tab-btn[data-tab="${step.tab}"]`)?.click();

    const last = this.index === STEPS.length - 1;
    const dots = STEPS.map((_, i) => `<i class="${i === this.index ? 'on' : ''}"></i>`).join('');
    this.pop.innerHTML = `
      <div class="tour-step">Step ${this.index + 1} of ${STEPS.length}</div>
      <h4>${step.title}</h4>
      <p>${step.body}</p>
      <div class="tour-dots">${dots}</div>
      <div class="tour-actions">
        <button class="tour-skip" data-act="skip">${last ? 'Close' : 'Skip tour'}</button>
        <span class="tour-spacer"></span>
        ${this.index > 0 ? '<button class="tour-back" data-act="back">Back</button>' : ''}
        <button class="tour-next" data-act="next">${last ? 'Finish' : (this.index === 0 ? 'Start tour' : 'Next')}</button>
      </div>`;
    this.pop.querySelector('[data-act="next"]').onclick = () => this.next();
    this.pop.querySelector('[data-act="skip"]').onclick = () => this.finish();
    const back = this.pop.querySelector('[data-act="back"]');
    if (back) back.onclick = () => this.prev();
    this.pop.querySelector('[data-act="next"]').focus();

    const target = step.target && document.querySelector(step.target);
    if (target) target.scrollIntoView({ block: 'center', behavior: 'instant' });
    requestAnimationFrame(() => this.position());
  }

  position() {
    if (!this.active) return;
    const step = STEPS[this.index];
    const target = step.target && document.querySelector(step.target);
    const pad = 8;
    const pw = this.pop.offsetWidth, ph = this.pop.offsetHeight;
    const vw = window.innerWidth, vh = window.innerHeight;

    if (!target) {
      this.spot.style.cssText = 'top:50%;left:50%;width:0;height:0;';
      this.pop.style.top = `${(vh - ph) / 2}px`;
      this.pop.style.left = `${(vw - pw) / 2}px`;
      return;
    }

    const r = target.getBoundingClientRect();
    this.spot.style.top = `${r.top - pad}px`;
    this.spot.style.left = `${r.left - pad}px`;
    this.spot.style.width = `${r.width + pad * 2}px`;
    this.spot.style.height = `${r.height + pad * 2}px`;

    const gap = 16;
    const fits = {
      right: r.right + gap + pw < vw,
      bottom: r.bottom + gap + ph < vh,
      top: r.top - gap - ph > 0
    };
    let place = step.placement || 'bottom';
    if (!fits[place]) place = fits.bottom ? 'bottom' : fits.top ? 'top' : fits.right ? 'right' : 'inside';

    let top, left;
    if (place === 'right') { top = r.top; left = r.right + gap; }
    else if (place === 'top') { top = r.top - gap - ph; left = r.left; }
    else if (place === 'bottom') { top = r.bottom + gap; left = r.left; }
    else { top = vh - ph - 24; left = Math.max(16, r.left + 24); }

    this.pop.style.top = `${Math.min(Math.max(12, top), vh - ph - 12)}px`;
    this.pop.style.left = `${Math.min(Math.max(12, left), vw - pw - 12)}px`;
  }
}

export const walkthrough = new Walkthrough();
