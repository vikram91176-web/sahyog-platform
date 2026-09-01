const ASSETS = {
  logo: "/assets/sahyog-logo.jpg",
  services: {
    Electrical: "/assets/service-electrical.jpg",
    Plumbing: "/assets/service-plumbing.jpg",
    Carpentry: "/assets/service-carpentry.jpg",
    Cleaning: "/assets/service-cleaning.jpg"
  }
};

const roleHome = {
  WORKER: "/worker",
  CUSTOMER: "/customer",
  COOPERATIVE_EMPLOYEE: "/cooperative",
  COOPERATIVE_ADMIN: "/cooperative",
  FEDERATION_ADMIN: "/federation",
  SUPER_ADMIN: "/admin"
};

const state = {
  user: null,
  csrfToken: null,
  home: "/",
  selectedRole: "WORKER",
  selectedJobId: null,
  data: {},
  toast: null,
  assistantOpen: false,
  assistantThinking: false,
  chat: [],
  ratingDraft: 5,
  jobMessages: {},
  unreadNotificationsCount: 0
};

const app = typeof document !== "undefined" ? document.querySelector("#app") : null;
const icon = (name, filled = false) => `<span class="material-symbols-outlined${filled ? " icon-filled" : ""}">${name}</span>`;
const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const baseForRole = (role) => (roleHome[role] ? roleHome[role].slice(1) : "worker");
const isAdmin = () => ["COOPERATIVE_EMPLOYEE", "COOPERATIVE_ADMIN", "FEDERATION_ADMIN", "SUPER_ADMIN"].includes(state.user?.role);

const brand = (className = "", subtitle = "Cooperative Platform") => `
  <button class="brand-badge ${className}" data-go="${state.user ? state.home : "/"}" aria-label="SAHYOG Home">
    <img class="sahyog-logo-img" src="${ASSETS.logo}" alt="SAHYOG Logo" />
    <div class="brand-text">
      <span class="brand-name">SAHYOG</span>
      <span class="brand-sub">${esc(subtitle)}</span>
    </div>
  </button>
`;

const logo = (className = "") => brand(className);

async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (state.csrfToken && !["GET", undefined].includes(options.method)) headers["X-CSRF-Token"] = state.csrfToken;
  const response = await fetch(path, {
    credentials: "same-origin",
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const payload = await response.json().catch(() => ({ ok: false, error: "Invalid server response" }));
  if (!response.ok || !payload.ok) throw new Error(payload.error || "Request failed");
  return payload;
}

async function boot() {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  try {
    const me = await api("/api/auth/me");
    state.user = me.user;
    state.csrfToken = me.csrfToken;
    state.home = me.home || "/";

    if (state.user) {
      try {
        const [notifs, aiHistory] = await Promise.all([
          api("/api/notifications"),
          api("/api/ai/conversations").catch(() => ({ data: { messages: [] } }))
        ]);
        state.unreadNotificationsCount = notifs.data.filter((n) => !n.read).length;
        if (aiHistory?.data?.messages?.length) {
          state.chat = aiHistory.data.messages;
        }
      } catch {}
    }
  } catch {
    state.user = null;
    state.csrfToken = null;
    state.home = "/";
  }

  window.addEventListener("popstate", render);
  document.addEventListener("click", delegateClick);
  document.addEventListener("submit", delegateSubmit);
  render();
}

function go(path) {
  if (location.pathname === path) return render();
  history.pushState(null, "", path);
  render();
}

function setToast(message, type = "success") {
  state.toast = { message, type };
  window.setTimeout(() => {
    if (state.toast?.message === message) {
      state.toast = null;
      render();
    }
  }, 3200);
}

function toastHtml() {
  return state.toast ? `<div class="toast ${state.toast.type}" role="status">${icon(state.toast.type === "error" ? "error" : "check_circle")}<span>${esc(state.toast.message)}</span></div>` : "";
}

function publicRoute(path) {
  return ["/", "/about", "/how-it-works", "/services", "/benefits", "/contact", "/faq", "/login", "/register", "/register/worker", "/register/customer"].includes(path);
}

function render() {
  const path = location.pathname;
  if (path === "/register/worker") state.selectedRole = "WORKER";
  if (path === "/register/customer") state.selectedRole = "CUSTOMER";
  if (path === "/login") return renderPublic(loginPage());
  if (path.startsWith("/register")) return renderPublic(registerPage());
  if (publicRoute(path)) return renderPublic(publicPage(path));
  if (!state.user) return go("/login");
  const permittedBase = baseForRole(state.user.role);
  if (path !== "/settings" && path.split("/")[1] !== permittedBase) return go(roleHome[state.user.role]);
  renderApp(path);
}

function notificationBadgeHtml() {
  return state.unreadNotificationsCount > 0 ? `<span class="unread-badge">${state.unreadNotificationsCount}</span>` : "";
}

function publicHeader() {
  const path = location.pathname;
  return `<header class="public-header">
    ${brand("public-brand", "Worker-First Marketplace")}
    <nav class="public-nav" aria-label="Primary navigation">
      <button class="${path === "/" ? "active" : ""}" data-go="/">Home</button>
      <button class="${path === "/services" ? "active" : ""}" data-go="/services">Find Services</button>
      <button class="${path === "/how-it-works" ? "active" : ""}" data-go="/how-it-works">How It Works</button>
      <button class="${path === "/about" ? "active" : ""}" data-go="/about">About</button>
      <button class="${path === "/register/worker" ? "active" : ""}" data-go="/register/worker">Join as Worker</button>
    </nav>
    <div class="header-actions">
      <button class="header-icon" data-go="/login" aria-label="Notifications">${icon("notifications")}${notificationBadgeHtml()}</button>
      <button class="header-icon" data-go="/services" aria-label="Service location">${icon("location_on")}</button>
      ${state.user ? `<button class="user-avatar" data-go="${state.home}" aria-label="Open dashboard">${esc(state.user.name.slice(0, 1))}</button>` : `<button class="header-login" data-go="/login">Login</button>`}
    </div>
  </header>`;
}

function publicFooter() {
  return `<footer class="public-footer">
    <div class="footer-content">
      <div class="footer-brand">
        ${brand("footer-brand-logo", "Worker Cooperative Platform")}
        <p>A worker-first digital public infrastructure connecting households with verified, fairly compensated service professionals.</p>
      </div>
      <div class="footer-links-grid">
        <div>
          <h4>Services</h4>
          <button data-go="/services">Electrical</button>
          <button data-go="/services">Plumbing</button>
          <button data-go="/services">Carpentry</button>
          <button data-go="/services">Cleaning</button>
        </div>
        <div>
          <h4>Platform</h4>
          <button data-go="/how-it-works">How It Works</button>
          <button data-go="/about">Why Sahyog</button>
          <button data-go="/benefits">Worker Welfare</button>
          <button data-go="/faq">FAQs</button>
        </div>
        <div>
          <h4>Get Started</h4>
          <button data-go="/register/worker">Join as Worker</button>
          <button data-go="/register/customer">Request a Service</button>
          <button data-go="/login">Member Login</button>
          <button data-go="/contact">Support</button>
        </div>
      </div>
    </div>
    <div class="footer-bottom">
      <span>© 2026 SAHYOG Cooperative Platform. Built on Digital Public Infrastructure principles.</span>
      <span>Fair Work · Transparent Wages · Dignity</span>
    </div>
  </footer>`;
}

function renderPublic(content) {
  app.innerHTML = `${publicHeader()}${toastHtml()}${content}${publicFooter()}${assistantLayer()}`;
}

function publicPage(path) {
  if (path === "/") return landingPage();
  if (path === "/services") return publicServicesPage();
  const page = {
    "/about": ["Why SAHYOG", "A cooperative digital marketplace designed around fair work, transparent pay, and shared local worker ownership."],
    "/how-it-works": ["How Sahyog Works", "Customers request help, transparent wage intelligence calculates a fair range, qualified workers are matched, and the cooperative helps every service finish safely."],
    "/benefits": ["Worker Welfare & Benefits", "Healthcare access, skill development, fair wage guarantees, and cooperative support live directly alongside the job marketplace."],
    "/contact": ["Support & Help Desk", "Reach your cooperative support team through the role-aware Sahyog Assistant or your local cooperative chapter."],
    "/faq": ["Frequently Asked Questions", "Sahyog open-sources its wage estimation rules, guarantees no algorithmic wage slashing, and ensures worker ownership."]
  }[path] || ["SAHYOG", "Worker-first cooperative digital marketplace."];

  return `<main class="public-info-view">
    <section class="page-title">
      <div>
        <span class="fair-wage-pill">${icon("verified")} Digital Public Infrastructure</span>
        <h1 style="margin-top: 8px; font-size: 32px;">${page[0]}</h1>
        <p style="font-size: 16px;">${page[1]}</p>
      </div>
    </section>
    <section class="landing-section" style="max-width: 1200px; margin: 0 auto; padding-top: 16px;">
      <div class="benefits-grid">
        <article class="dashboard-panel">
          <div class="panel-heading"><h2>${icon("balance")} Transparent Pricing</h2></div>
          <p style="color: var(--on-surface-variant); font-size: 14px; line-height: 1.6;">Every fair wage estimate is calculated using visible cooperative rules considering skill level, duration, distance, and safety.</p>
        </article>
        <article class="dashboard-panel">
          <div class="panel-heading"><h2>${icon("verified")} Verified Professionals</h2></div>
          <p style="color: var(--on-surface-variant); font-size: 14px; line-height: 1.6;">All gig workers undergo cooperative vetting, identity checks, skill evaluations, and background validation.</p>
        </article>
        <article class="dashboard-panel">
          <div class="panel-heading"><h2>${icon("support_agent")} Human + AI Support</h2></div>
          <p style="color: var(--on-surface-variant); font-size: 14px; line-height: 1.6;">The Sahyog Assistant and internal safety desk ensure rapid dispute resolution and welfare accessibility.</p>
        </article>
      </div>
      <div style="text-align: center; margin-top: 40px;">
        <button class="primary-button" data-go="/register">Get Started on SAHYOG ${icon("arrow_forward")}</button>
      </div>
    </section>
  </main>`;
}

function landingPage() {
  const categories = [
    { name: "Electrical", img: ASSETS.services.Electrical, desc: "Wiring, fixtures, breaker panels, repairs" },
    { name: "Plumbing", img: ASSETS.services.Plumbing, desc: "Leaks, piping, bathroom fixtures, sanitation" },
    { name: "Carpentry", img: ASSETS.services.Carpentry, desc: "Furniture, custom woodwork, locks, framing" },
    { name: "Cleaning", img: ASSETS.services.Cleaning, desc: "Deep cleaning, kitchen wash, sanitization" }
  ];

  return `<main>
    <section class="landing-hero">
      <div class="landing-glow"></div>
      <div class="landing-copy">
        <span class="fair-wage-pill" style="margin-bottom: 16px;">${icon("auto_awesome")} Cooperative Digital Marketplace</span>
        <h1>Fair Work. Fair Wages.<br />Stronger Cooperatives.</h1>
        <p>A worker-first digital platform that connects skills, opportunities, transparent earnings and welfare. Built on the principles of modern Indian digital public infrastructure.</p>
        <div class="hero-actions">
          <button class="secondary-button" data-go="/services">Find Services ${icon("arrow_forward")}</button>
          <button class="outline-on-dark" data-go="/register/worker">Join as Worker</button>
        </div>
      </div>
    </section>

    <section class="landing-section services-band">
      <div class="section-heading">
        <h2>Verified Professional Services</h2>
        <p>Connecting you with skilled, fairly-compensated workers from local cooperatives.</p>
      </div>
      <div class="service-gallery">
        ${categories.map((cat) => `
          <button class="service-photo-card" data-go="/services">
            <img src="${cat.img}" alt="${cat.name} Services" />
            <strong>${cat.name}</strong>
            <small style="color: var(--on-surface-variant); font-size: 12px; margin-top: 2px;">${cat.desc}</small>
            <span>Request ${icon("arrow_forward")}</span>
          </button>
        `).join("")}
      </div>
    </section>

    <section class="landing-section workflow-band">
      <div class="section-heading">
        <h2>How Sahyog Works</h2>
        <p>A transparent ecosystem ensuring fair compensation, clear pricing, and cooperative dignity.</p>
      </div>
      <div class="workflow">
        ${[
          ["Request", "Customer posts task with transparent duration & requirements", "primary"],
          ["Match", "Intelligent job pool matches verified skills and proximity", "secondary"],
          ["Allocate", "Fair allocation with transparent wage calculation", "primary"],
          ["Complete", "Direct payment, review, and worker welfare credit", "secondary"]
        ].map(([title, caption, color], index) => `
          <article>
            <span class="step-dot ${color}">${index + 1}</span>
            <h3>${title}</h3>
            <p>${caption}</p>
          </article>
        `).join("")}
      </div>
    </section>

    <section class="landing-section why-band">
      <div class="why-band-layout">
        <div class="why-copy">
          <span class="fair-wage-pill">${icon("handshake")} Worker Dignity First</span>
          <h2 style="margin-top: 10px;">Why Choose Sahyog?</h2>
          <p>We prioritize dignity, transparency, and safety for the gig workforce while delivering dependable, vetted quality to customers.</p>
          <div class="why-features">
            <div class="feature-line">
              <span class="feature-icon green">${icon("balance")}</span>
              <div>
                <h3>Fair Wage Intelligence</h3>
                <p>Algorithmic pricing guarantees workers receive fair, livable compensation without predatory middleman platform commissions.</p>
              </div>
            </div>
            <div class="feature-line">
              <span class="feature-icon blue">${icon("verified")}</span>
              <div>
                <h3>Verified Skills & Trust Score</h3>
                <p>All service workers are identity-verified and cooperative-trained, providing complete peace of mind.</p>
              </div>
            </div>
            <div class="feature-line">
              <span class="feature-icon red">${icon("local_hospital")}</span>
              <div>
                <h3>Safety & Emergency SOS Support</h3>
                <p>Built-in one-touch emergency assistance, real-time location sharing, and continuous welfare coverage.</p>
              </div>
            </div>
          </div>
        </div>

        <div class="coop-network-card">
          <div>
            <span class="network-badge">${icon("hub")} Decentralized Cooperative Model</span>
            <h3>Empowering Workers with Shared Ownership</h3>
            <p>Unlike corporate gig aggregators that extract 25–35% commissions, SAHYOG operates as a digital public utility where 100% of fair base rates go to the worker.</p>
          </div>
          <div class="coop-network-nodes">
            <span>${icon("check_circle")} 0% Predatory Fees</span>
            <span>${icon("health_and_safety")} Built-in Welfare</span>
            <span>${icon("school")} Continuous Upskilling</span>
          </div>
        </div>
      </div>
    </section>

    <section class="impact-band">
      <div>
        <strong>10k+</strong>
        <span>Workers Onboarded</span>
      </div>
      <div>
        <strong>50k+</strong>
        <span>Jobs Completed</span>
      </div>
      <div>
        <strong>₹2Cr+</strong>
        <span>Fair Earnings Distributed</span>
      </div>
    </section>
  </main>`;
}

function publicServicesPage() {
  const categories = [
    { name: "Electrical", img: ASSETS.services.Electrical, desc: "Wiring, fixtures, breaker panels, appliance installations" },
    { name: "Plumbing", img: ASSETS.services.Plumbing, desc: "Leak fixes, pipe replacements, drain unclogging, bathroom fittings" },
    { name: "Carpentry", img: ASSETS.services.Carpentry, desc: "Furniture repairs, bespoke woodwork, door locks, framing" },
    { name: "Cleaning", img: ASSETS.services.Cleaning, desc: "Deep home cleaning, kitchen sanitation, sofa wash, disinfection" }
  ];

  return `<main style="max-width: 1200px; margin: 0 auto; padding: 32px 16px;">
    <section class="section-heading" style="margin-bottom: 32px;">
      <span class="fair-wage-pill">${icon("search")} Transparent Directory</span>
      <h1 style="font-size: 32px; font-weight: 800; color: var(--primary); margin: 8px 0;">Find Verified Service Professionals</h1>
      <p>Select a service category to request verified help with an instant Fair Wage Intelligence estimate.</p>
    </section>
    <section class="service-gallery">
      ${categories.map((cat) => `
        <button class="service-photo-card" data-go="${state.user?.role === "CUSTOMER" ? "/customer/services" : "/register/customer"}">
          <img src="${cat.img}" alt="${cat.name} services" />
          <strong>${cat.name} Services</strong>
          <small style="color: var(--on-surface-variant); font-size: 12px; margin-top: 4px;">${cat.desc}</small>
          <span style="margin-top: 10px;">Request service ${icon("arrow_forward")}</span>
        </button>
      `).join("")}
    </section>
  </main>`;
}

function authShell(title, subtitle, content) {
  return `<main class="auth-page">
    <section class="auth-card">
      <div class="auth-brand">${brand("auth-brand-logo", "Account Access")}</div>
      <div class="auth-heading">
        <h1>${title}</h1>
        <p>${subtitle}</p>
      </div>
      ${content}
    </section>
  </main>`;
}

function loginPage() {
  const roles = [
    ["WORKER", "work", "Worker"],
    ["CUSTOMER", "person", "Customer"],
    ["COOPERATIVE_EMPLOYEE", "badge", "Staff / Admin"]
  ];

  return authShell(
    "Welcome Back",
    "Select your role to access your account.",
    `<form class="auth-form" data-form="login">
      <label class="auth-label">I am a...</label>
      <div class="login-role-grid">
        ${roles.map(([role, symbol, label]) => `
          <button type="button" class="role-choice ${state.selectedRole === role || (role === "COOPERATIVE_EMPLOYEE" && ["COOPERATIVE_ADMIN", "FEDERATION_ADMIN", "SUPER_ADMIN"].includes(state.selectedRole)) ? "active" : ""}" data-role="${role}">
            ${icon(symbol, state.selectedRole === role)}
            <span>${label}</span>
          </button>
        `).join("")}
      </div>

      <div class="auth-tabs">
        <button type="button" class="active">Email &amp; Password</button>
        <button type="button" data-action="otp-info">Mobile / OTP</button>
      </div>

      <label class="field">
        <span>Email Address</span>
        <input name="email" type="email" value="${demoEmail(state.selectedRole)}" required autocomplete="email" />
      </label>

      <label class="field">
        <span>Password</span>
        <input name="password" type="password" value="Password123!" required autocomplete="current-password" />
      </label>

      <div class="auth-options">
        <label><input type="checkbox" checked /> Remember me</label>
        <button type="button" data-action="forgot">Forgot password?</button>
      </div>

      <button class="primary-button full" type="submit">Login to Account ${icon("login")}</button>
    </form>
    <p class="auth-foot">Don't have an account? <button data-go="/register">Register here</button></p>
    <div class="demo-note">
      Optional development seed account: <code>Password123!</code>
    </div>`
  );
}

function registerPage() {
  return authShell(
    "Create Account",
    "Join SAHYOG as a customer, worker, or cooperative staff.",
    `<form class="auth-form" data-form="register">
      <div class="login-role-grid">
        <button type="button" class="role-choice ${state.selectedRole === "CUSTOMER" ? "active" : ""}" data-role="CUSTOMER">
          ${icon("person", state.selectedRole === "CUSTOMER")}
          <span>Customer</span>
        </button>
        <button type="button" class="role-choice ${state.selectedRole === "WORKER" ? "active" : ""}" data-role="WORKER">
          ${icon("work", state.selectedRole === "WORKER")}
          <span>Worker</span>
        </button>
        <button type="button" class="role-choice ${state.selectedRole === "COOPERATIVE_EMPLOYEE" ? "active" : ""}" data-role="COOPERATIVE_EMPLOYEE">
          ${icon("badge", state.selectedRole === "COOPERATIVE_EMPLOYEE")}
          <span>Staff</span>
        </button>
      </div>

      <label class="field">
        <span>Full Name</span>
        <input name="name" placeholder="e.g. Ramesh Kumar" autocomplete="name" required />
      </label>

      <label class="field">
        <span>Email Address</span>
        <input name="email" type="email" placeholder="name@example.com" autocomplete="email" required />
      </label>

      <label class="field">
        <span>Mobile Number (+91)</span>
        <input name="mobile" type="tel" placeholder="9876543210" autocomplete="tel" required />
      </label>

      <label class="field">
        <span>City / Sector Location</span>
        <input name="location" placeholder="e.g. Noida Sector 62" required />
      </label>

      <label class="field">
        <span>Password (min. 8 characters)</span>
        <input name="password" type="password" minlength="8" placeholder="••••••••" autocomplete="new-password" required />
      </label>

      <button class="primary-button full" type="submit">Create Account ${icon("arrow_forward")}</button>
    </form>
    <p class="auth-foot">Already registered? <button data-go="/login">Login here</button></p>`
  );
}

function assistantLayer() {
  const open = state.assistantOpen;
  const route = state.user ? routeInfo(location.pathname) : null;
  const isDedicatedPage = route?.page === "assistant";
  const showFab = !isDedicatedPage;

  const quickSuggestions = state.user?.role === "WORKER" ? [
    "What jobs match my verified skills?",
    "Explain my latest fair wage breakdown",
    "How to apply for health welfare?"
  ] : state.user?.role === "CUSTOMER" ? [
    "How does fair wage calculation work?",
    "Find plumbing professionals",
    "Track my request status"
  ] : isAdmin() ? [
    "Show available vs busy workers",
    "Summarize active incidents",
    "Where are skill gaps?"
  ] : [
    "How does SAHYOG work?",
    "What are cooperative fees?",
    "How to join as worker?"
  ];

  const messages = state.chat.length ? state.chat.map(chatBubble).join("") : `
    <div class="assistant-welcome">
      <span class="assistant-orb">${icon("support_agent")}</span>
      <div>
        <strong>Sahyog Assistant</strong>
        <p>${state.user ? `Ready to assist with your authorized ${state.user.role.toLowerCase().replace(/_/g, " ")} platform data.` : "Sign in for role-aware help with jobs, wages, welfare, and safety support."}</p>
        <div class="chat-suggestions">
          ${quickSuggestions.map((q) => `<button type="button" class="chat-suggestion-chip" data-action="chip-ask" data-query="${esc(q)}">${esc(q)}</button>`).join("")}
        </div>
      </div>
    </div>
  `;

  return `
    ${showFab ? `
      <button class="assistant-fab" data-action="assistant-open" aria-label="Open Sahyog Assistant">
        ${icon("support_agent")}
      </button>
    ` : ""}

    ${open && !isDedicatedPage ? `
      <aside class="assistant-panel" aria-label="Sahyog Assistant">
        <header>
          <div>
            <span class="assistant-orb">${icon("support_agent")}</span>
            <div>
              <strong>Sahyog Assistant</strong>
              <small>${state.user ? `Role-aware · ${state.user.role.replace(/_/g, " ")}` : "Platform Guide"}</small>
            </div>
          </div>
          <button class="icon-only" data-action="assistant-close" aria-label="Close Assistant" style="color:#ffffff;">
            ${icon("close")}
          </button>
        </header>
        <div class="assistant-messages" id="floatingMessages">
          ${messages}
          ${state.assistantThinking ? `
            <div class="ai-thinking">
              <div class="ai-dots"><span></span><span></span><span></span></div>
              <span>Processing platform data...</span>
            </div>
          ` : ""}
        </div>
        ${state.user ? `
          <form class="assistant-composer" data-form="assistant">
            <input name="message" placeholder="Ask about jobs, wages, welfare..." autocomplete="off" required />
            <button class="send-button" aria-label="Send message" type="submit">${icon("send")}</button>
          </form>
        ` : `
          <div style="padding: 16px; background: var(--surface-container-lowest); border-top: 1px solid var(--outline-variant);">
            <button class="primary-button full" data-go="/login" data-action="assistant-close">Sign in for Full Assistance</button>
          </div>
        `}
      </aside>
    ` : ""}
  `;
}

function chatBubble(message) {
  const isUser = message.role === "user";
  const factChips = message.facts?.map((f) => `<span class="fact-tag">${esc(f)}</span>`).join("") || "";
  const isLive = message.sourceType === "OPENAI_LIVE";
  const providerNote = `<span class="fact-tag" style="background:${isLive ? "var(--primary-container)" : "var(--secondary-container)"}; color:${isLive ? "var(--on-primary-container)" : "var(--on-secondary-container)"};">${isLive ? "Live GPT-4o-mini" : "Authorized Platform Data"}</span>`;

  return `
    <div class="chat-bubble ${isUser ? "user" : "assistant"}">
      ${!isUser ? `
        <div class="bubble-head">
          ${icon("smart_toy")}
          <span>Sahyog Assistant</span>
        </div>
      ` : ""}
      <p style="white-space: pre-line;">${esc(message.body)}</p>
      ${(!isUser && (factChips || providerNote)) ? `<div class="fact-tags">${providerNote}${factChips}</div>` : ""}
    </div>
  `;
}

function routeInfo(path) {
  if (path === "/settings") return { base: baseForRole(state.user.role), page: "settings", id: null };
  const parts = path.split("/").filter(Boolean);
  return { base: parts[0] || baseForRole(state.user.role), page: parts[1] || "dashboard", id: parts[2] || null };
}

function renderApp(path) {
  const route = routeInfo(path);
  const shell = isAdmin() ? adminShell(route) : memberShell(route);
  app.innerHTML = `${shell}${assistantLayer()}`;
  loadPageData(route).catch((error) => setToast(error.message, "error"));
}

function appHeader(route) {
  const base = route ? route.base : baseForRole(state.user.role);
  const page = route ? route.page : "dashboard";
  const links = base === "worker" ? [
    ["dashboard", `/${base}`, "home", "Home"],
    ["jobs", `/${base}/jobs`, "work", "Jobs"],
    ["earnings", `/${base}/earnings`, "payments", "Earnings"],
    ["welfare", `/${base}/welfare`, "diversity_3", "Welfare"],
    ["assistant", `/${base}/assistant`, "support_agent", "Assistant"]
  ] : base === "customer" ? [
    ["dashboard", `/${base}`, "home", "Home"],
    ["services", `/${base}/services`, "search", "Find Services"],
    ["jobs", `/${base}/jobs`, "work", "My Requests"],
    ["payments", `/${base}/payments`, "payments", "Payments"],
    ["assistant", `/${base}/assistant`, "support_agent", "Assistant"]
  ] : [];

  return `
    <header class="app-header">
      ${brand("app-brand", state.user.role.replace(/_/g, " "))}
      <nav class="desktop-member-nav" aria-label="Member Navigation">
        ${links.map(([p, href, glyph, label]) => `
          <button class="${page === p ? "active" : ""}" data-go="${href}">
            ${icon(glyph, page === p)} <span>${label}</span>
          </button>
        `).join("")}
      </nav>
      <div class="app-header-actions">
        <button class="header-icon" data-go="/${base}/notifications" aria-label="Notifications">
          ${icon("notifications")}${notificationBadgeHtml()}
        </button>
        <button class="header-icon" data-action="location-info" aria-label="Location settings">${icon("location_on")}</button>
        <button class="user-avatar" data-go="/${base}/profile" aria-label="Open profile">${esc(state.user.name.slice(0, 1))}</button>
      </div>
    </header>
  `;
}

function memberShell(route) {
  return `<div class="member-shell">
    ${appHeader(route)}
    ${toastHtml()}
    <main class="member-main">${viewFor(route)}</main>
    ${memberBottomNav(route)}
  </div>`;
}

function memberBottomNav(route) {
  const base = route.base;
  const links = base === "worker" ? [
    ["dashboard", "/worker", "home", "Home"],
    ["jobs", "/worker/jobs", "work", "Jobs"],
    ["earnings", "/worker/earnings", "payments", "Earnings"],
    ["welfare", "/worker/welfare", "diversity_3", "Welfare"],
    ["profile", "/worker/profile", "person", "Profile"]
  ] : [
    ["dashboard", "/customer", "home", "Home"],
    ["services", "/customer/services", "search", "Services"],
    ["jobs", "/customer/jobs", "work", "Requests"],
    ["payments", "/customer/payments", "payments", "Payments"],
    ["profile", "/customer/profile", "person", "Profile"]
  ];

  return `<nav class="member-bottom-nav" aria-label="Mobile Navigation">
    ${links.map(([page, href, glyph, label]) => `
      <button class="${route.page === page ? "active" : ""}" data-go="${href}">
        <span>${icon(glyph, route.page === page)}</span>
        <span>${label}</span>
      </button>
    `).join("")}
  </nav>`;
}

function adminShell(route) {
  const links = [
    ["dashboard", "dashboard", "Dashboard", `/${route.base}`],
    ["workers", "groups", "Workers", `/${route.base}/workers`],
    ["jobs", "engineering", "Jobs", `/${route.base}/jobs`],
    ["analytics", "analytics", "Analytics", `/${route.base}/analytics`],
    ["notifications", "notifications", "Notifications", `/${route.base}/notifications`],
    ["disputes", "gavel", "Disputes", `/${route.base}/disputes`],
    ["assistant", "support_agent", "Assistant", `/${route.base}/assistant`],
    ["settings", "settings", "Settings", `/${route.base}/settings`]
  ];

  return `<div class="admin-shell">
    <aside class="admin-sidebar" aria-label="Admin command sidebar">
      <div class="admin-profile">
        ${brand("admin-brand-side", adminRoleLabel())}
      </div>
      <nav aria-label="Admin Navigation">
        ${links.map(([page, glyph, label, href]) => `
          <button class="admin-nav-link ${route.page === page ? "active" : ""}" data-go="${href}">
            ${icon(glyph, route.page === page)}
            <span>${label}</span>
          </button>
        `).join("")}
      </nav>
      <button class="sos-monitor" data-go="/${route.base}/sos">${icon("emergency", true)} SOS Monitor</button>
    </aside>

    <main class="admin-main">
      <header class="admin-header">
        <div class="admin-wordmark">
          ${brand("admin-brand-head", "Control Desk")}
        </div>
        <div class="app-header-actions">
          <button class="header-icon" data-go="/${route.base}/notifications" aria-label="Notifications">
            ${icon("notifications")}${notificationBadgeHtml()}
          </button>
          <button class="user-avatar" data-go="/${route.base}/profile" aria-label="Open profile">${esc(state.user.name.slice(0, 1))}</button>
        </div>
      </header>

      <nav class="admin-mobile-nav" aria-label="Admin mobile navigation">
        ${links.map(([page, glyph, label, href]) => `
          <button class="${route.page === page ? "active" : ""}" data-go="${href}">
            ${icon(glyph, route.page === page)}
            <span>${label}</span>
          </button>
        `).join("")}
        <button class="sos-btn ${route.page === "sos" ? "active" : ""}" data-go="/${route.base}/sos">
          ${icon("emergency", true)}
          <span>SOS</span>
        </button>
      </nav>

      ${toastHtml()}
      <div class="admin-content">${viewFor(route)}</div>
    </main>
  </div>`;
}

function adminRoleLabel() {
  return {
    COOPERATIVE_EMPLOYEE: "Cooperative Operations Desk",
    COOPERATIVE_ADMIN: "Cooperative Command",
    FEDERATION_ADMIN: "Federation Control",
    SUPER_ADMIN: "Platform Control"
  }[state.user?.role] || "Operations Desk";
}

function viewFor(route) {
  if (route.page === "dashboard") return isAdmin() ? adminDashboardView(route) : memberDashboardView(route);
  if (["jobs", "matching", "allocation"].includes(route.page)) return jobsView(route);
  if (["services", "request"].includes(route.page)) return servicesView(route);
  if (route.page === "wage") return wageView(route);
  if (["earnings", "payments", "welfare", "training"].includes(route.page)) return earningsView(route);
  if (route.page === "sos") return sosView(route);
  if (route.page === "settings") return settingsView(route);
  if (route.page === "analytics") return analyticsView(route);
  if (route.page === "assistant") return assistantView(route);
  if (route.page === "notifications") return notificationsView(route);
  if (route.page === "disputes") return disputesView(route);
  if (route.page === "workers") return workersView(route);
  if (route.page === "profile") return profileView(route);
  if (route.page === "messages") return messagesView(route);
  return memberDashboardView(route);
}

function pageTitle(title, subtitle, action = "") {
  return `<section class="page-title">
    <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:16px;">
      <div>
        <h1>${title}</h1>
        ${subtitle ? `<p>${subtitle}</p>` : ""}
      </div>
      ${action ? `<div>${action}</div>` : ""}
    </div>
  </section>`;
}

function memberDashboardView(route) {
  if (route.base === "customer") {
    return `
      ${pageTitle(`Hello, ${esc(state.user.name.split(" ")[0])}`, "Find verified help and keep every service transparent.", `<button class="primary-button" data-go="/customer/services">${icon("add")} Create Request</button>`)}
      <section class="customer-dashboard">
        <div class="customer-hero-card">
          <div>
            <p class="eyebrow">Request a service</p>
            <h2>Get reliable work done with guaranteed fair wage intelligence.</h2>
            <button class="secondary-button" data-go="/customer/services">Find Services ${icon("arrow_forward")}</button>
          </div>
          <span>${icon("handyman")}</span>
        </div>
        <div id="memberMetrics" class="metric-grid"></div>
        <section class="dashboard-panel">
          <div class="panel-heading">
            <h2>Your Recent Requests</h2>
            <button data-go="/customer/jobs">View all ${icon("arrow_forward")}</button>
          </div>
          <div id="recentJobs" class="job-stack"></div>
        </section>
      </section>
    `;
  }

  return `
    ${pageTitle(`Good morning, ${esc(state.user.name.split(" ")[0])}`, "Ready for your next task?")}
    <section class="worker-dashboard">
      <div class="availability-card">
        <div style="display:flex; align-items:center; gap:10px;">
          <span class="material-symbols-outlined" style="color:var(--secondary);">check_circle</span>
          <span>Available for Jobs</span>
        </div>
        <span class="availability-toggle" id="workerAvailToggle"><i></i></span>
      </div>
      <div id="memberMetrics" class="worker-metric-grid"></div>
      <section class="dashboard-panel">
        <div class="panel-heading">
          <h2>Recommended Jobs</h2>
          <button data-go="/worker/jobs">See All ${icon("arrow_forward")}</button>
        </div>
        <div id="recentJobs" class="job-stack"></div>
      </section>
    </section>
  `;
}

function adminDashboardView(route) {
  return `
    ${pageTitle("Operations Dashboard", "Overview of cooperative workforce, live job allocations, and incident alerts.")}
    <section class="worker-dashboard">
      <div id="adminMetrics" class="admin-metric-grid"></div>
      <div style="display:grid; grid-template-columns: 1fr; gap: 20px; margin-top: 4px;">
        <section class="dashboard-panel">
          <div class="panel-heading">
            <h2>Workforce Status (24h)</h2>
            <div style="display:flex; gap:14px; font-size:12px; font-weight:600;">
              <span style="display:inline-flex; align-items:center; gap:6px;"><i style="width:10px; height:10px; border-radius:50%; background:var(--primary);"></i> Busy</span>
              <span style="display:inline-flex; align-items:center; gap:6px;"><i style="width:10px; height:10px; border-radius:50%; background:var(--secondary-container); border:1px solid var(--secondary);"></i> Available</span>
            </div>
          </div>
          <div id="workforceBars" style="display:flex; align-items:flex-end; justify-content:space-around; height:160px; border-bottom:1px solid var(--outline-variant); padding-bottom:8px;"></div>
        </section>

        <section class="dashboard-panel">
          <div class="panel-heading">
            <h2 style="display:flex; align-items:center; gap:6px; color:var(--error);">${icon("warning", true)} Active Safety Incidents</h2>
            <button class="status-pill red" data-go="/${route.base}/sos">View SOS Desk</button>
          </div>
          <div id="adminIncidents" class="incident-list"></div>
        </section>
      </div>

      <section class="dashboard-panel" style="margin-top: 4px;">
        <div class="panel-heading">
          <h2>Skill Demand Heatmap</h2>
          <button class="filter-button" data-go="/${route.base}/workers">${icon("groups")} Workers Directory</button>
        </div>
        <div id="demandTable" style="overflow-x:auto;"></div>
      </section>
    </section>
  `;
}

function jobsView(route) {
  if (isAdmin()) {
    return `
      ${pageTitle("Intelligent Job Pool & Allocation", "Transparent matching optimizes skills, availability, proximity, and cooperative fairness.")}
      <section class="allocation-layout">
        <section class="job-pool-panel">
          <div class="panel-heading">
            <h2>Pending Jobs</h2>
            <span id="jobCount" class="status-pill orange">Loading</span>
          </div>
          <div id="jobs" class="allocation-list"></div>
        </section>

        <section class="matching-panel">
          <div id="jobDetails" class="empty-state">Select a job to view allocation recommendations.</div>
        </section>

        <section class="map-panel">
          <div class="panel-heading">
            <h2>Area Coverage</h2>
            <span class="fair-wage-pill">${icon("radar")} Active Grid</span>
          </div>
          <div class="map-grid">
            <span class="map-route r1"></span>
            <span class="map-route r2"></span>
            <span class="map-marker red">${icon("location_on")}</span>
            <span class="map-marker green m1">${icon("person")}</span>
            <span class="map-marker green m2">${icon("person")}</span>
            <span class="map-marker blue m3">${icon("work")}</span>
          </div>
          <div class="map-legend">
            <span><i class="red"></i> Job Location</span>
            <span><i class="green"></i> Top Match</span>
            <span><i class="blue"></i> Available</span>
          </div>
          <p style="font-size: 11px; color: var(--on-surface-variant); text-align: center;">Location display uses cooperative zone coordinates.</p>
        </section>
      </section>
    `;
  }

  const heading = route.base === "worker" ? "Recommended Jobs" : "Your Job Requests";
  const subtitle = route.base === "worker" ? "Fair wage opportunities verified and allocated by your cooperative." : "Track your requests, transparent wage calculations, and service completion.";
  const action = route.base === "customer" ? `<button class="primary-button" data-go="/customer/services">${icon("add")} Create Request</button>` : "";

  return `
    ${pageTitle(heading, subtitle, action)}
    <section class="allocation-layout" style="grid-template-columns: minmax(0, 1.2fr) minmax(360px, 0.8fr);">
      <section id="jobs" class="job-stack"></section>
      <aside class="dashboard-panel" id="jobDetails" style="position: sticky; top: 80px; align-self: start;">
        <div class="empty-state">
          <span>${icon("assignment")}</span>
          <p>Select a job from the list to view full specifications, wage intelligence, and actions.</p>
        </div>
      </aside>
    </section>
  `;
}

function servicesView(route) {
  return `
    ${pageTitle("Find Services", "Choose a verified trade and post a service request with a transparent wage guarantee.")}
    <section class="request-layout">
      <div>
        <h2 style="font-size: 16px; font-weight: 700; margin-bottom: 12px; color: var(--primary);">1. Select Service Category</h2>
        <div id="services" class="service-picker"></div>
      </div>
      <section class="request-card">
        <div class="panel-heading">
          <h2>2. Create Job Request</h2>
          <span class="fair-wage-pill">${icon("auto_awesome")} Fair Pricing</span>
        </div>
        ${jobForm()}
      </section>
    </section>
  `;
}

function jobForm() {
  return `
    <form class="job-form" data-form="job" style="display:flex; flex-direction:column; gap:16px;">
      <label class="field">
        <span>Selected Service</span>
        <select id="serviceSelect" name="serviceCategoryId" required></select>
      </label>

      <label class="field">
        <span>Job Title</span>
        <input name="title" value="Plumbing Repair & Inspection" required />
      </label>

      <label class="field">
        <span>Task Description</span>
        <textarea name="description" required>Kitchen sink pipe leak and drain inspection needed.</textarea>
      </label>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
        <label class="field">
          <span>Locality / Sector</span>
          <input name="location" value="Noida Sector 62" required />
        </label>
        <label class="field">
          <span>Duration (Hours)</span>
          <input name="estimatedDurationHours" type="number" min="1" max="12" value="2" required />
        </label>
      </div>

      <label class="field">
        <span>Preferred Date &amp; Time</span>
        <input name="scheduledAt" type="datetime-local" required />
      </label>

      <div id="wagePreview" class="wage-preview">
        ${icon("auto_awesome")}
        <div>
          <strong>Calculating Fair Wage Intelligence...</strong>
          <span>Select duration and service to view guaranteed fair rates.</span>
        </div>
      </div>

      <button class="primary-button full" type="submit">Post Service Request ${icon("arrow_forward")}</button>
    </form>
  `;
}

function wageView(route) {
  return `
    ${pageTitle("Fair Wage Breakdown", "Algorithmic pricing backed by cooperative minimums and skill benchmarks.", `<button class="back-button" data-go="/${route.base}/jobs">${icon("arrow_back")} Back to Jobs</button>`)}
    <section id="wageBreakdown" class="wage-layout">
      <div class="empty-state">Calculating fair wage estimate...</div>
    </section>
  `;
}

function earningsView(route) {
  const isWelfare = route.page === "welfare";
  const isTraining = route.page === "training";
  const isPayments = route.page === "payments";

  const title = isWelfare ? "Worker Welfare & Social Security" : isTraining ? "Cooperative Upskilling & Training" : isPayments ? "Payments & Receipts" : "Earnings Overview";
  const subtitle = isWelfare ? "Institutional welfare coverage guaranteed by your cooperative membership." : isTraining ? "Certified training modules to increase your skill trust score and hourly wage." : "Track all verified digital payments and escrow settlements.";

  return `
    ${pageTitle(title, subtitle)}
    <section class="earnings-layout">
      <section id="earningsSummary" class="earnings-overview"></section>
      <section class="earnings-stats">
        <article>
          <div>
            <strong id="completedJobsStat">0</strong>
            <small>Completed Jobs</small>
          </div>
          <span>${icon("task_alt")}</span>
        </article>
        <article>
          <div>
            <strong id="averageEarningStat">₹0</strong>
            <small>Avg / Completed Job</small>
          </div>
          <span>${icon("account_balance_wallet")}</span>
        </article>
        <article>
          <div>
            <strong id="workingHoursStat">0h</strong>
            <small>Total Working Hours</small>
          </div>
          <span>${icon("schedule")}</span>
        </article>
      </section>

      <div class="benefits-grid">
        <section class="dashboard-panel">
          <div class="panel-heading">
            <h2>Recent Payments</h2>
            <button data-go="/${route.base}/payments">View All ${icon("arrow_forward")}</button>
          </div>
          <div id="payments" class="payment-table"></div>
        </section>

        <section class="dashboard-panel">
          <div class="panel-heading">
            <h2>Welfare Schemes</h2>
            <button data-go="/${route.base}/welfare">View All ${icon("arrow_forward")}</button>
          </div>
          <div id="welfare" class="benefit-list"></div>
        </section>

        <section class="dashboard-panel">
          <div class="panel-heading">
            <h2>Training Programs</h2>
            <button data-go="/${route.base}/training">View All ${icon("arrow_forward")}</button>
          </div>
          <div id="training" class="benefit-list"></div>
        </section>
      </div>
    </section>
  `;
}

function sosView(route) {
  const isWorker = route.base === "worker";
  return `
    ${pageTitle("Emergency SOS & Safety Center", isWorker ? "Instant safety trigger for cooperative response and emergency escalation." : "Real-time safety incident monitoring desk for open alerts.")}
    <section class="sos-layout ${isWorker ? "worker-sos" : ""}">
      ${isWorker ? `
        <div class="location-active">
          ${icon("my_location")} Live Cooperative Location Sharing Active
        </div>

        <button class="help-button" data-action="sos-confirm" aria-label="Trigger SOS Help">
          <span>${icon("warning", true)}</span>
          <strong>HELP</strong>
        </button>

        <a class="emergency-call" href="tel:112">
          ${icon("phone")} Call National Emergency (112)
        </a>

        <button class="secondary-button full" data-action="sos-confirm">
          ${icon("support_agent")} Notify Cooperative Emergency Team
        </button>

        <div class="incident-note">
          <label for="sosNote">Quick Details (Optional)</label>
          <textarea id="sosNote" class="field" style="width:100%; min-height:70px; padding:10px; border:1px solid var(--outline-variant); border-radius:var(--radius-md);" placeholder="Describe safety issue or current location details..."></textarea>
          <button class="primary-button full" style="margin-top:8px;" data-action="sos-confirm">
            ${icon("send")} Send Details
          </button>
        </div>

        <button class="false-alarm" data-go="/worker">Cancel / False Alarm</button>
      ` : `
        <div class="dashboard-panel full">
          <div class="panel-heading">
            <h2 style="color:var(--error); display:flex; align-items:center; gap:6px;">${icon("warning", true)} Live Incident Stream</h2>
            <span class="status-pill red">Live Desk</span>
          </div>
          <div id="incidents" class="benefit-list"></div>
        </div>
      `}
    </section>
  `;
}

function assistantView(route) {
  const quickQuestions = state.user?.role === "WORKER" ? [
    "What jobs match my verified skills?",
    "Explain my latest fair wage breakdown",
    "How does the health welfare scheme work?",
    "What is my current trust score?"
  ] : state.user?.role === "CUSTOMER" ? [
    "How does SAHYOG estimate fair wages?",
    "Find verified electrical technicians",
    "What is the cooperative guarantee?",
    "Track my active service request"
  ] : [
    "Show active vs available workforce",
    "List pending jobs needing allocation",
    "Show any open safety incidents",
    "Summarize weekly service demand"
  ];

  return `
    ${pageTitle("Sahyog Assistant", "Role-aware conversational intelligence grounded exclusively in your authorized cooperative data.")}
    <section class="assistant-workspace">
      <aside class="dashboard-panel" style="align-self: start;">
        <div class="panel-heading">
          <h2>${icon("security")} Data Scope</h2>
          <span class="status-pill green">Authorized</span>
        </div>
        <p style="font-size: 13px; color: var(--on-surface-variant); line-height: 1.5; margin-bottom: 16px;">
          The assistant has access only to data you are permissioned to read as <strong>${esc(state.user.role.replace(/_/g, " "))}</strong>.
        </p>
        <h3 style="font-size: 13px; font-weight: 700; text-transform: uppercase; color: var(--primary); margin-bottom: 10px;">Suggested Prompts</h3>
        <div class="chat-suggestions" style="margin-top: 0;">
          ${quickQuestions.map((q) => `
            <button type="button" class="chat-suggestion-chip" data-action="chip-ask" data-query="${esc(q)}">
              ${esc(q)}
            </button>
          `).join("")}
        </div>
      </aside>

      <section class="assistant-chat-card">
        <header style="padding: 16px 20px; background: var(--primary); color: #ffffff; display: flex; align-items: center; justify-content: space-between;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span class="assistant-orb">${icon("support_agent")}</span>
            <div>
              <strong style="display: block; font-size: 15px;">Sahyog Role-Aware Assistant</strong>
              <small style="color: var(--primary-fixed); font-size: 11px;">Active Session · Verified Platform Data</small>
            </div>
          </div>
          <span class="fair-wage-pill" style="background: rgba(255,255,255,0.15); color: #fff; border:none;">
            ${icon("auto_awesome")} AI Engine
          </span>
        </header>

        <div class="assistant-messages" id="dedicatedMessages" style="flex: 1; min-height: 400px; max-height: 540px;">
          ${state.chat.length ? state.chat.map(chatBubble).join("") : `
            <div class="assistant-welcome">
              <span class="assistant-orb">${icon("support_agent")}</span>
              <div>
                <strong>How can I help you today?</strong>
                <p>Ask anything regarding service allocations, wage calculation rules, cooperative welfare coverage, or active tickets.</p>
              </div>
            </div>
          `}
          ${state.assistantThinking ? `
            <div class="ai-thinking">
              <div class="ai-dots"><span></span><span></span><span></span></div>
              <span>Processing platform data...</span>
            </div>
          ` : ""}
        </div>

        <form class="assistant-composer" data-form="assistant">
          <input name="message" placeholder="Ask about jobs, wage intelligence, welfare policies..." autocomplete="off" required />
          <button class="send-button" type="submit" aria-label="Send query">${icon("send")}</button>
        </form>
      </section>
    </section>
  `;
}

function settingsView(route) {
  return `
    ${pageTitle("Account & Preferences", "Manage your profile, service availability radius, and cooperative notification alerts.", `<button class="back-button" data-go="${state.home}">${icon("arrow_back")} Dashboard</button>`)}
    <section class="settings-layout">
      <section class="settings-profile">
        <div class="profile-large">${esc(state.user.name.slice(0, 1))}</div>
        <div style="flex:1;">
          <h2 style="font-size: 18px; font-weight: 700;">${esc(state.user.name)}</h2>
          <span class="status-pill green" style="margin-top: 4px;">${esc(state.user.role.replace(/_/g, " "))}</span>
          <p style="font-size: 13px; color: var(--on-surface-variant); margin-top: 4px;">${esc(state.user.email)}</p>
        </div>
        <button class="edit-profile" data-go="/${route.base}/profile">${icon("badge")} Profile</button>
      </section>
      <div id="settings" class="settings-groups"></div>
    </section>
  `;
}

function analyticsView() {
  return `
    ${pageTitle("Cooperative Analytics", "Database-backed metrics for the authorized cooperative operational jurisdiction.")}
    <section class="worker-dashboard">
      <div id="analyticsMetrics" class="admin-metric-grid"></div>
      <div style="display:grid; grid-template-columns: 1fr; gap: 20px; margin-top: 12px;">
        <section class="dashboard-panel">
          <div class="panel-heading"><h2>Service Demand by Category</h2></div>
          <div id="analyticsBars" style="display:flex; flex-direction:column; gap:12px;"></div>
        </section>
        <section class="dashboard-panel">
          <div class="panel-heading"><h2>Job Status Distribution</h2></div>
          <div id="statusBars" style="display:flex; flex-direction:column; gap:12px;"></div>
        </section>
      </div>
    </section>
  `;
}

function notificationsView(route) {
  return `
    ${pageTitle("Notifications", "Updates and alerts from your authorized SAHYOG cooperative workflows.", `<button class="back-button" data-action="mark-read">${icon("done_all")} Mark all read</button>`)}
    <section class="notifications-layout" id="notifications"></section>
  `;
}

function disputesView() {
  return `
    ${pageTitle("Dispute Resolution Desk", "Review reported concerns and quality tickets within your cooperative scope.")}
    <section class="disputes-layout" id="disputes"></section>
  `;
}

function workersView() {
  return `
    ${pageTitle("Workers Directory", "Verified cooperative service professionals in your operational jurisdiction.")}
    <section id="workers" class="worker-directory"></section>
  `;
}

function profileView(route) {
  return `
    ${pageTitle("Member Profile", "Account identity, verification credentials, and cooperative federation records.")}
    <section class="profile-view">
      <div class="profile-hero">
        <div class="profile-large">${esc(state.user.name.slice(0, 1))}</div>
        <div>
          <span class="status-pill green">${esc(state.user.role.replace(/_/g, " "))}</span>
          <h2 style="font-size: 22px; font-weight: 700; margin-top: 4px;">${esc(state.user.name)}</h2>
          <p style="font-size: 13px; color: var(--on-surface-variant);">${esc(state.user.email)} · ${esc(state.user.mobile || "Mobile unlisted")}</p>
        </div>
      </div>
      <div id="profileDetails" class="profile-detail-grid"></div>
      <div style="display:flex; gap:12px;">
        <button class="primary-button" data-go="/${route.base}/settings">${icon("settings")} Open Settings</button>
        <button class="outline-button" data-action="logout">${icon("logout")} Sign Out</button>
      </div>
    </section>
  `;
}

function messagesView() {
  return `
    ${pageTitle("Service Messages", "Communications for active and scheduled service tasks.")}
    <section id="messages" class="disputes-layout"></section>
  `;
}

/* ==========================================================================
   Data Loaders
   ========================================================================== */

async function loadPageData(route) {
  const page = route.page;
  if (page === "dashboard") return loadDashboard(route);
  if (["jobs", "matching", "allocation"].includes(page)) return loadJobs(route);
  if (["services", "request"].includes(page)) return loadServices();
  if (page === "wage") return loadWage();
  if (["earnings", "payments", "welfare", "training"].includes(page)) return loadEarnings();
  if (page === "sos") return loadIncidents();
  if (page === "settings") return loadSettings();
  if (page === "analytics") return loadAnalytics();
  if (page === "notifications") return loadNotifications();
  if (page === "disputes") return loadDisputes();
  if (page === "workers") return loadWorkers();
  if (page === "profile") return loadProfile();
  if (page === "messages") return loadMessages();
}

async function loadDashboard(route) {
  const requests = [api("/api/analytics/summary"), api("/api/jobs"), api("/api/notifications")];
  if (route.base === "worker") requests.push(api("/api/payments"));
  const [summary, jobs, notifications, payments] = await Promise.all(requests);
  state.data.jobs = jobs.data;

  if (!isAdmin()) {
    const metrics = document.querySelector("#memberMetrics");
    const recent = document.querySelector("#recentJobs");
    if (!metrics || !recent) return;

    if (route.base === "worker") {
      const earnings = payments?.data?.reduce((sum, item) => sum + Number(item.amount || 0), 0) || 0;
      metrics.innerHTML = `
        <article>
          <span>${icon("work")}</span>
          <small>AVAILABLE JOBS</small>
          <strong>${summary.data.totals.activeJobs}</strong>
        </article>
        <article>
          <span>${icon("payments")}</span>
          <small>TODAY'S EARNINGS</small>
          <strong>${money(earnings)}</strong>
        </article>
        <article>
          <span>${icon("account_balance_wallet")}</span>
          <small>MONTHLY TOTAL</small>
          <strong>${money(earnings)}</strong>
        </article>
        <article>
          <span>${icon("diversity_3")}</span>
          <small>WELFARE SCORE</small>
          <strong>88 <em>/ 100</em></strong>
          <i class="progress"><b style="width:88%"></b></i>
        </article>
      `;
    } else {
      metrics.innerHTML = metricCards(summary.data.totals);
    }

    recent.innerHTML = jobs.data.length ? jobs.data.slice(0, 4).map((job) => memberJobCard(job, route.base)).join("") : emptyState("No job records yet.", "assignment");
    return;
  }

  const [workers, incidents] = await Promise.all([api("/api/workers"), api("/api/sos")]);
  const metrics = document.querySelector("#adminMetrics");
  if (!metrics) return;

  const available = workers.data.filter((worker) => worker.availabilityStatus === "AVAILABLE").length;
  const busy = Math.max(0, workers.data.length - available);

  metrics.innerHTML = `
    <article>
      <span>TOTAL WORKERS ${icon("groups")}</span>
      <strong>${summary.data.totals.workers}</strong>
    </article>
    <article>
      <span>ACTIVE JOBS ${icon("pending_actions")}</span>
      <strong>${summary.data.totals.activeJobs}</strong>
    </article>
    <article>
      <span>COMPLETED JOBS ${icon("task_alt")}</span>
      <strong>${summary.data.totals.completedJobs}</strong>
    </article>
    <article>
      <span>TOTAL SETTLED ${icon("payments")}</span>
      <strong>${money(summary.data.totals.earnings)}</strong>
    </article>
    <article>
      <span>OPEN DISPUTES ${icon("gavel")}</span>
      <strong>${summary.data.totals.disputes}</strong>
    </article>
  `;

  const bars = document.querySelector("#workforceBars");
  if (bars) {
    bars.innerHTML = [28, 20, 14, 40, 56, 34].map((val, i) => `
      <div class="chart-bar-col">
        <div style="display:flex; flex-direction:column; justify-content:flex-end; width:32px; height:100%; gap:2px;">
          <div class="chart-bar" style="height:${val}%; background:var(--primary);"></div>
          <div class="chart-bar" style="height:${100 - val}%; background:var(--secondary-container);"></div>
        </div>
        <span>${["08:00", "12:00", "16:00", "20:00", "00:00", "04:00"][i]}</span>
      </div>
    `).join("");
  }

  const incidentTarget = document.querySelector("#adminIncidents");
  if (incidentTarget) {
    incidentTarget.innerHTML = incidents.data.length ? incidents.data.map(incidentCard).join("") : emptyState("No active safety incidents reported.", "verified_user");
  }

  const demand = document.querySelector("#demandTable");
  if (demand) demand.innerHTML = demandRows(summary.data.serviceDemand, workers.data);
}

function metricCards(totals) {
  return [
    ["work", "All Requests", totals.jobs],
    ["pending_actions", "In Progress", totals.activeJobs],
    ["payments", "Settled Payouts", money(totals.earnings)],
    ["notifications", "Unread Alerts", totals.unreadNotifications]
  ].map(([glyph, label, value]) => `
    <article>
      <span>${icon(glyph)}</span>
      <small>${label}</small>
      <strong>${value}</strong>
    </article>
  `).join("");
}

function memberJobCard(job, base) {
  const isAssignedToMe = job.status === "ASSIGNED" && base === "worker" && job.workerId === state.user.id;
  const action = isAssignedToMe ? `
    <button class="secondary-button" data-transition="ACCEPTED" data-job="${job.id}">${icon("check")} Accept Job</button>
  ` : `
    <button class="job-link" data-job="${job.id}">Inspect details ${icon("arrow_forward")}</button>
  `;

  return `
    <article class="member-job-card ${job.id === state.selectedJobId ? "selected" : ""}" data-job="${job.id}">
      <div class="job-card-top">
        <div>
          <h3>${esc(job.title)}</h3>
          <p>${icon("location_on")} ${esc(job.location)}</p>
        </div>
        <span class="job-amount">${money(job.budget)}</span>
      </div>
      <div class="job-meta">
        <span>${icon("schedule")} ${Number(job.estimatedDurationHours || 1)} hours</span>
        <span class="status-pill ${badgeColor(job.status)}">${esc(job.status.replace(/_/g, " "))}</span>
      </div>
      <div class="job-card-bottom">
        <span class="fair-wage-pill">${icon("auto_awesome")} FAIR WAGE</span>
        ${action}
      </div>
    </article>
  `;
}

async function loadJobs(route) {
  const result = await api("/api/jobs");
  state.data.jobs = result.data;
  if (!state.selectedJobId || !result.data.some((job) => job.id === state.selectedJobId)) {
    state.selectedJobId = result.data[0]?.id || null;
  }

  const jobs = document.querySelector("#jobs");
  if (!jobs) return;

  jobs.innerHTML = result.data.length ? (
    isAdmin() ? result.data.map(adminJobCard).join("") : result.data.map((job) => memberJobCard(job, route.base)).join("")
  ) : emptyState("No jobs available in this operational view.", "work_off");

  const count = document.querySelector("#jobCount");
  if (count) count.textContent = `${result.data.filter((job) => ["POSTED", "MATCHING"].includes(job.status)).length} New`;

  await selectJob(state.selectedJobId, route);
}

function adminJobCard(job) {
  return `
    <button class="admin-job-card ${job.id === state.selectedJobId ? "selected" : ""}" data-job="${job.id}">
      <div>
        <strong>${esc(job.title)}</strong>
        <span>${money(job.budget)}</span>
      </div>
      <p>${icon("location_on")} ${esc(job.location)}</p>
      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:2px;">
        <small style="font-size:11px; color:var(--on-surface-variant);">${Number(job.estimatedDurationHours || 1)}h duration</small>
        <span class="status-pill ${badgeColor(job.status)}">${esc(job.status.replace(/_/g, " "))}</span>
      </div>
    </button>
  `;
}

function renderStepper(currentStatus) {
  const stages = [
    ["POSTED", "Posted"],
    ["MATCHING", "Matching"],
    ["ASSIGNED", "Assigned"],
    ["ACCEPTED", "Accepted"],
    ["IN_PROGRESS", "In Progress"],
    ["COMPLETED", "Done"]
  ];

  const statusOrder = { POSTED: 0, MATCHING: 1, ASSIGNED: 2, ACCEPTED: 3, IN_PROGRESS: 4, COMPLETED: 5, DISPUTED: 3, RESOLVED: 5, CANCELLED: 0 };
  const currentIndex = statusOrder[currentStatus] ?? 0;

  return `
    <div class="lifecycle-stepper">
      ${stages.map(([st, label], idx) => {
        const isCompleted = idx < currentIndex;
        const isActive = idx === currentIndex;
        const cls = isCompleted ? "completed" : isActive ? "active" : "";
        return `
          <div class="step-node ${cls}">
            <span class="step-circle">${isCompleted ? icon("check") : idx + 1}</span>
            <span class="step-label">${label}</span>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

async function selectJob(jobId, route = routeInfo(location.pathname)) {
  const target = document.querySelector("#jobDetails");
  if (!target) return;

  if (!jobId) {
    target.innerHTML = emptyState("Select a job to inspect recommendations and wage intelligence.", "assignment");
    return;
  }

  state.selectedJobId = jobId;
  const job = state.data.jobs?.find((item) => item.id === jobId);
  if (!job) return;

  const matchResult = await api(`/api/matching/jobs/${jobId}`);
  const transitions = jobActionButtons(job, route);

  // Load message thread for job if assigned
  let messagesHtml = "";
  if (job.workerId) {
    const thread = await api(`/api/messages/jobs/${job.id}`).catch(() => ({ messages: [] }));
    state.jobMessages[job.id] = thread.messages || [];
    const canChat = state.user.role === "CUSTOMER" || (state.user.role === "WORKER" && job.workerId === state.user.id);
    if (canChat) {
      messagesHtml = `
        <section class="job-message-thread">
          <header>
            <span>${icon("forum")} Direct Job Chat</span>
            <small style="color:var(--on-surface-variant); font-size:11px;">With ${esc(job.workerName || "Service Professional")}</small>
          </header>
          <div class="job-messages-list" id="jobChatList">
            ${thread.messages.length ? thread.messages.map((m) => `
              <div class="job-msg-bubble ${m.senderId === state.user.id ? "me" : "them"}">
                ${esc(m.body)}
              </div>
            `).join("") : `<small style="color:var(--outline); font-size:12px;">No messages in thread yet. Type a note below.</small>`}
          </div>
          <form class="job-msg-form" data-form="job-message" data-job="${job.id}">
            <input name="body" placeholder="Send a message regarding this job..." autocomplete="off" required />
            <button class="primary-button" style="min-height:36px; padding:0 14px;" type="submit">${icon("send")}</button>
          </form>
        </section>
      `;
    }
  }

  // Review & Rating section for customer on completed jobs
  let reviewSection = "";
  if (route.base === "customer" && job.status === "COMPLETED") {
    if (job.review) {
      reviewSection = `
        <div style="margin-top:16px; padding:14px; background:var(--surface-low); border-radius:var(--radius-lg); border:1px solid var(--outline-variant);">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
            <strong style="font-size:13px;">Your Review &amp; Rating</strong>
            <span style="color:#eb851c; font-weight:700;">${"★".repeat(job.review.rating)}${"☆".repeat(5 - job.review.rating)}</span>
          </div>
          <p style="font-size:13px; color:var(--on-surface-variant); font-style:italic;">"${esc(job.review.body || "Service completed satisfactorily.")}"</p>
        </div>
      `;
    } else {
      reviewSection = `
        <div style="margin-top:16px; padding:16px; background:var(--surface-container-low); border-radius:var(--radius-lg); border:1px solid var(--outline-variant);">
          <h3 style="font-size:14px; font-weight:700; color:var(--primary); margin-bottom:4px;">Rate &amp; Review Service</h3>
          <p style="font-size:12px; color:var(--on-surface-variant); margin-bottom:8px;">Help verify cooperative quality standards for ${esc(job.workerName || "worker")}.</p>
          <div class="star-rating-picker" id="starPicker">
            ${[1, 2, 3, 4, 5].map((star) => `
              <button type="button" class="${star <= state.ratingDraft ? "selected" : ""}" data-action="rate-star" data-rating="${star}">★</button>
            `).join("")}
          </div>
          <textarea id="reviewText" style="width:100%; min-height:60px; padding:8px 10px; font-size:13px; border:1px solid var(--outline-variant); border-radius:var(--radius-md); margin-bottom:8px;" placeholder="Share your experience (punctuality, craft, clean-up)..."></textarea>
          <button class="secondary-button full" data-action="submit-review" data-job="${job.id}">Submit Review &amp; Trust Score ${icon("check")}</button>
        </div>
      `;
    }
  }

  // Payment section for customer on completed jobs
  let paymentSection = "";
  if (route.base === "customer" && job.status === "COMPLETED") {
    if (job.payment) {
      paymentSection = `
        <div style="margin-top:12px; padding:12px; background:var(--secondary-container); color:var(--on-secondary-container); border-radius:var(--radius-md); font-size:12px; display:flex; justify-content:space-between; align-items:center;">
          <span>${icon("verified")} Fair Wage Payment Settled (${money(job.payment.amount)})</span>
          <span class="status-pill green">PAID</span>
        </div>
      `;
    } else {
      paymentSection = `
        <button class="primary-button full" style="margin-top:12px;" data-action="pay-job" data-job="${job.id}" data-amount="${job.budget}">
          ${icon("payments")} Settle Payment ${money(job.budget)} (Sandbox Escrow)
        </button>
      `;
    }
  }

  if (isAdmin()) {
    target.innerHTML = `
      <div class="allocation-title">
        <div>
          <span class="status-pill ${badgeColor(job.status)}">${esc(job.status.replace(/_/g, " "))}</span>
          <h1 style="margin-top:6px;">${esc(job.title)}</h1>
          <p>${icon("location_on")} ${esc(job.location)} · Scheduled ${formatDate(job.scheduledAt)}</p>
        </div>
        <div>
          <strong>${money(job.budget)}</strong>
          <small>Allocated Payout</small>
        </div>
      </div>

      ${renderStepper(job.status)}

      <section class="allocation-recommendations">
        <header>
          <h2>${icon("smart_toy")} AI Allocation Intelligence</h2>
          <span class="status-pill green">Fairness Optimized</span>
        </header>
        ${matchResult.data.length ? matchResult.data.slice(0, 3).map((match) => matchCard(match, job.id)).join("") : emptyState("No eligible worker available in pool.", "groups")}
      </section>

      <div style="display:flex; gap:10px; margin-top:16px;">
        ${transitions || `<button class="outline-button full" data-action="dispute" data-job="${job.id}">Report Dispute</button>`}
      </div>
    `;
  } else {
    // Show matching candidates to customer when posted or matching
    let matchingCandidatesHtml = "";
    if (route.base === "customer" && ["POSTED", "MATCHING"].includes(job.status)) {
      matchingCandidatesHtml = `
        <section style="margin-top:16px; border-top:1px solid var(--outline-variant); padding-top:16px;">
          <header style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
            <strong style="font-size:14px; color:var(--primary); display:flex; align-items:center; gap:6px;">
              ${icon("auto_awesome")} Recommended Candidates
            </strong>
            <span class="status-pill green">${matchResult.data.length} Available</span>
          </header>
          ${matchResult.data.length ? matchResult.data.slice(0, 3).map((match) => customerCandidateCard(match, job.id)).join("") : `<p style="font-size:12px; color:var(--on-surface-variant);">Searching cooperative matching pool...</p>`}
        </section>
      `;
    }

    target.innerHTML = `
      <div class="job-card-top" style="margin-bottom:8px;">
        <div>
          <span class="status-pill ${badgeColor(job.status)}">${esc(job.status.replace(/_/g, " "))}</span>
          <h2 style="font-size: 20px; font-weight: 700; margin-top: 8px;">${esc(job.title)}</h2>
          <p>${icon("location_on")} ${esc(job.location)}</p>
        </div>
      </div>

      ${renderStepper(job.status)}

      <p style="font-size: 14px; color: var(--on-surface-variant); line-height: 1.5; margin-bottom: 16px;">${esc(job.description)}</p>

      <div class="wage-intelligence-box" style="margin-bottom: 16px;">
        <span class="sparkle-icon">${icon("auto_awesome")}</span>
        <div style="flex:1;">
          <small>Fair Wage Estimate</small>
          <b>${money(job.fairWageEstimate)}</b>
          <button class="job-link" data-go="/${route.base}/wage">Inspect calculation breakdown ${icon("arrow_forward")}</button>
        </div>
      </div>

      <dl style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom: 16px; font-size: 13px;">
        <div style="padding:10px; background:var(--surface-low); border-radius:var(--radius-md);">
          <dt style="color:var(--on-surface-variant); font-size:11px; text-transform:uppercase; font-weight:700;">Scheduled</dt>
          <dd style="font-weight:600; margin-top:2px;">${formatDate(job.scheduledAt)}</dd>
        </div>
        <div style="padding:10px; background:var(--surface-low); border-radius:var(--radius-md);">
          <dt style="color:var(--on-surface-variant); font-size:11px; text-transform:uppercase; font-weight:700;">Duration</dt>
          <dd style="font-weight:600; margin-top:2px;">${Number(job.estimatedDurationHours || 1)} Hours</dd>
        </div>
        <div style="grid-column:1 / -1; padding:10px; background:var(--surface-low); border-radius:var(--radius-md);">
          <dt style="color:var(--on-surface-variant); font-size:11px; text-transform:uppercase; font-weight:700;">Allocated Professional</dt>
          <dd style="font-weight:700; color:var(--primary); margin-top:2px;">${esc(job.workerName || "Pending Allocation")}</dd>
        </div>
      </dl>

      <div style="display:flex; flex-direction:column; gap:8px;">
        ${transitions}
        ${paymentSection}
        ${reviewSection}
        ${matchingCandidatesHtml}
        ${messagesHtml}
        <button class="outline-button full" style="margin-top:8px;" data-action="dispute" data-job="${job.id}">Report Concern / Dispute</button>
      </div>
    `;
  }
}

function customerCandidateCard(match, jobId) {
  return `
    <article style="padding:12px; background:var(--surface-container-lowest); border:1px solid var(--outline-variant); border-radius:var(--radius-md); margin-bottom:8px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
        <div>
          <strong style="font-size:14px;">${esc(match.workerName)}</strong>
          <span style="font-size:12px; color:var(--on-surface-variant); display:block;">${Number(match.rating || 0).toFixed(1)} ★ (${match.completedJobs || 0} jobs completed)</span>
        </div>
        <span class="status-pill green">${match.score}% Match</span>
      </div>
      <div style="font-size:11px; color:var(--on-surface-variant); margin-bottom:8px;">
        ${match.reasons.slice(0, 2).map((r) => `<span>• ${esc(r)}</span><br />`).join("")}
      </div>
      <button class="primary-button full" style="min-height:34px; font-size:13px;" data-action="assign-worker" data-job="${jobId}" data-worker="${match.workerId}">
        Select &amp; Allocate Worker ${icon("check")}
      </button>
    </article>
  `;
}

function matchCard(match, jobId) {
  return `
    <article class="match-card">
      <div class="match-head">
        <div class="match-avatar">${esc(match.workerName.slice(0, 1))}</div>
        <div>
          <strong>${esc(match.workerName)}</strong>
          <p>Verified Cooperative Member · ${Number(match.rating || 0).toFixed(1)} ★</p>
        </div>
        <div class="match-score">
          ${match.score}%
          <small>Match</small>
        </div>
      </div>
      <div class="match-reasons">
        ${match.reasons.slice(0, 3).map((reason) => `<span>${esc(reason)}</span>`).join("")}
      </div>
      <button class="primary-button full" data-action="assign-worker" data-job="${jobId}" data-worker="${match.workerId}">Assign Worker ${icon("person_add")}</button>
    </article>
  `;
}

function jobActionButtons(job, route) {
  const buttons = [];
  const role = state.user.role;

  if (["POSTED", "MATCHING"].includes(job.status) && ["COOPERATIVE_ADMIN", "FEDERATION_ADMIN", "SUPER_ADMIN"].includes(role)) {
    buttons.push(`<button class="primary-button full" data-transition="MATCHING" data-job="${job.id}">${icon("auto_awesome")} Trigger Matching Pool</button>`);
  }
  if (job.status === "ASSIGNED" && role === "WORKER" && job.workerId === state.user.id) {
    buttons.push(`<button class="secondary-button full" data-transition="ACCEPTED" data-job="${job.id}">${icon("check")} Accept Job Request</button>`);
  }
  if (job.status === "ACCEPTED" && role === "WORKER" && job.workerId === state.user.id) {
    buttons.push(`<button class="primary-button full" data-transition="IN_PROGRESS" data-job="${job.id}">${icon("play_arrow")} Start Job Service</button>`);
  }
  if (job.status === "IN_PROGRESS" && (job.workerId === state.user.id || ["COOPERATIVE_ADMIN", "SUPER_ADMIN"].includes(role))) {
    buttons.push(`<button class="secondary-button full" data-transition="COMPLETED" data-job="${job.id}">${icon("task_alt")} Mark Service Completed</button>`);
  }
  if (route.base === "customer" && ["POSTED", "MATCHING"].includes(job.status)) {
    buttons.push(`<button class="outline-button full" data-go="/customer/wage">${icon("auto_awesome")} Review Wage Intelligence</button>`);
  }

  return buttons.join("");
}

async function loadServices() {
  const services = await api("/api/services");
  const serviceGrid = document.querySelector("#services");
  const select = document.querySelector("#serviceSelect");
  if (!serviceGrid || !select) return;

  serviceGrid.innerHTML = services.data.map((service) => `
    <button class="service-select-card" data-service="${service.id}">
      <img src="${ASSETS.services[service.name] || ASSETS.services.Plumbing}" alt="${esc(service.name)}" />
      <strong>${esc(service.name)}</strong>
      <small>Base from ${money(service.baseHourlyRate)}/hr</small>
    </button>
  `).join("");

  select.innerHTML = services.data.map((service) => `<option value="${service.id}">${esc(service.name)} (Base ${money(service.baseHourlyRate)}/hr)</option>`).join("");
  select.addEventListener("change", updateWagePreview);
  document.querySelector("input[name=estimatedDurationHours]")?.addEventListener("input", updateWagePreview);
  await updateWagePreview();
}

async function updateWagePreview() {
  const serviceCategoryId = document.querySelector("#serviceSelect")?.value;
  const duration = Number(document.querySelector("input[name=estimatedDurationHours]")?.value || 1);
  const output = document.querySelector("#wagePreview");
  if (!serviceCategoryId || !output) return;

  const result = await api("/api/wages/estimate", { method: "POST", body: { serviceCategoryId, estimatedDurationHours: duration } });
  output.innerHTML = `
    ${icon("auto_awesome")}
    <div style="flex:1;">
      <strong>Guaranteed Fair Estimate: ${money(result.data.estimatedFairWage)}</strong>
      <span>Worker take-home ${money(result.data.workerExpectedEarning)} · Transparent cooperative fee ${money(result.data.cooperativeFee)}</span>
    </div>
  `;
}

async function loadWage() {
  const jobs = state.data.jobs?.length ? state.data.jobs : (await api("/api/jobs")).data;
  state.data.jobs = jobs;
  const job = jobs.find((item) => item.id === state.selectedJobId) || jobs[0];
  const target = document.querySelector("#wageBreakdown");
  if (!target) return;

  if (!job) {
    target.innerHTML = emptyState("Create or select a job to inspect transparent wage estimates.", "auto_awesome");
    return;
  }

  const result = await api("/api/wages/estimate", { method: "POST", body: { serviceCategoryId: job.serviceCategoryId, estimatedDurationHours: job.estimatedDurationHours } });
  const estimate = result.data;
  const baseRate = Math.round(estimate.estimatedFairWage / Math.max(1, Number(job.estimatedDurationHours || 1)));

  target.innerHTML = `
    <div class="wage-hero-card">
      <div class="offered-box">
        <p>Allocated Job Budget</p>
        <strong>${money(job.budget)}</strong>
      </div>
      <div class="wage-intelligence-box">
        <span class="sparkle-icon">${icon("auto_awesome")}</span>
        <div>
          <small>FAIR WAGE INTELLIGENCE</small>
          <b>${money(estimate.customerRange[0])} – ${money(estimate.customerRange[1])}</b>
          <p>Estimated Fair Range for ${job.estimatedDurationHours} hours</p>
        </div>
      </div>
    </div>

    <div class="wage-details-card">
      <header>
        <h3>Itemized Cost Breakdown</h3>
      </header>
      <div class="wage-breakdown-list">
        <div class="wage-breakdown-row">
          <div>
            <span class="icon-wrapper">${icon("construction")}</span>
            <span class="label">Base skill rate</span>
          </div>
          <strong>${money(baseRate)}</strong>
        </div>
        <div class="wage-breakdown-row">
          <div>
            <span class="icon-wrapper">${icon("psychology")}</span>
            <span class="label">Job complexity multiplier</span>
          </div>
          <strong class="add">+${money(Math.max(0, estimate.estimatedFairWage - baseRate))}</strong>
        </div>
        <div class="wage-breakdown-row">
          <div>
            <span class="icon-wrapper">${icon("route")}</span>
            <span class="label">Cooperative platform contribution</span>
          </div>
          <strong class="add">+${money(estimate.cooperativeFee)}</strong>
        </div>
        <div class="wage-breakdown-row">
          <div>
            <span class="icon-wrapper">${icon("schedule")}</span>
            <span class="label">Estimated duration</span>
          </div>
          <strong>${job.estimatedDurationHours} Hours</strong>
        </div>
        <div class="wage-breakdown-row">
          <div>
            <span class="icon-wrapper">${icon("bolt")}</span>
            <span class="label">Priority &amp; reliability standard</span>
          </div>
          <strong class="add">+₹50</strong>
        </div>
        <div class="wage-breakdown-row">
          <div>
            <span class="icon-wrapper">${icon("inventory_2")}</span>
            <span class="label">Tooling &amp; consumables reserve</span>
          </div>
          <strong class="add">+₹30</strong>
        </div>
      </div>
    </div>

    <div class="wage-actions">
      ${state.user.role === "WORKER" ? `
        <button class="outline-button" data-go="/worker/jobs">${icon("arrow_back")} Back</button>
        <button class="secondary-button" data-go="/worker/jobs">${icon("check")} Confirm &amp; Return to Jobs</button>
      ` : `
        <button class="primary-button" data-go="/${baseForRole(state.user.role)}/jobs">${icon("arrow_back")} Back to Job Overview</button>
      `}
    </div>
  `;
}

async function loadEarnings() {
  const [payments, welfare, training, jobs] = await Promise.all([
    api("/api/payments"),
    api("/api/welfare"),
    api("/api/training"),
    api("/api/jobs")
  ]);

  const total = payments.data.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const completed = jobs.data.filter((job) => job.status === "COMPLETED").length;

  const summary = document.querySelector("#earningsSummary");
  if (summary) {
    summary.innerHTML = `
      <div>
        <p>TOTAL DISBURSED EARNINGS</p>
        <strong>${money(total)}</strong>
        <span>${icon("trending_up")} Verified Database Records</span>
      </div>
      <div class="earnings-chart">
        <div class="chart-bar-col">
          <div class="chart-bar dim" style="height:35%;"></div>
          <span>W1</span>
        </div>
        <div class="chart-bar-col">
          <div class="chart-bar dim" style="height:55%;"></div>
          <span>W2</span>
        </div>
        <div class="chart-bar-col">
          <div class="chart-bar dim" style="height:75%;"></div>
          <span>W3</span>
        </div>
        <div class="chart-bar-col">
          <div class="chart-bar" style="height:92%;"></div>
          <span style="font-weight:700; color:var(--primary);">W4</span>
        </div>
      </div>
    `;
  }

  const completedTarget = document.querySelector("#completedJobsStat");
  const averageTarget = document.querySelector("#averageEarningStat");
  const hoursTarget = document.querySelector("#workingHoursStat");

  if (completedTarget) completedTarget.textContent = completed;
  if (averageTarget) averageTarget.textContent = money(payments.data.length ? Math.round(total / payments.data.length) : 0);
  if (hoursTarget) hoursTarget.textContent = `${jobs.data.reduce((sum, job) => sum + Number(job.estimatedDurationHours || 0), 0)}h`;

  const paymentTarget = document.querySelector("#payments");
  if (paymentTarget) {
    paymentTarget.innerHTML = payments.data.length ? `
      <div class="payment-head">
        <span>Date</span>
        <span>Service Task</span>
        <span>Amount</span>
        <span>Status</span>
      </div>
      ${payments.data.map((payment) => paymentRow(payment, jobs.data)).join("")}
    ` : emptyState("No payment transactions recorded.", "payments");
  }

  const welfareTarget = document.querySelector("#welfare");
  if (welfareTarget) {
    welfareTarget.innerHTML = welfare.data.schemes.length ? welfare.data.schemes.map((scheme) => benefitCard(scheme, welfare.data.applications, "welfare")).join("") : emptyState("No active welfare schemes.", "diversity_3");
  }

  const trainingTarget = document.querySelector("#training");
  if (trainingTarget) {
    trainingTarget.innerHTML = training.data.programs.length ? training.data.programs.map((program) => benefitCard(program, training.data.enrollments, "training")).join("") : emptyState("No active training programs.", "school");
  }
}

function paymentRow(payment, jobs) {
  const job = jobs.find((item) => item.id === payment.jobId);
  return `
    <div class="payment-row">
      <span>${formatDate(payment.createdAt)}</span>
      <span style="font-weight:600;">${esc(job?.title || "Service Job Settlement")}</span>
      <strong style="color:var(--secondary);">${money(payment.amount)}</strong>
      <span class="status-pill green">${esc(payment.status.replace(/_/g, " "))}</span>
    </div>
  `;
}

function benefitCard(item, enrollment, kind) {
  const enrolled = enrollment.some((entry) => (kind === "welfare" ? entry.schemeId : entry.programId) === item.id);
  const title = kind === "welfare" ? item.name : item.title;
  const details = kind === "welfare" ? item.description : `${item.durationHours} hours · ${item.provider}`;

  return `
    <article class="benefit-card">
      <span>${icon(kind === "welfare" ? "health_and_safety" : "school")}</span>
      <div>
        <strong>${esc(title)}</strong>
        <p>${esc(details)}</p>
      </div>
      ${enrolled ? `<span class="status-pill green">${kind === "welfare" ? "Active / Enrolled" : "Enrolled"}</span>` : `<button class="primary-button" style="min-height:36px; padding:0 14px;" data-${kind}="${item.id}">${kind === "welfare" ? "Apply" : "Enroll"}</button>`}
    </article>
  `;
}

async function loadIncidents() {
  const target = document.querySelector("#incidents");
  if (!target) return;
  const result = await api("/api/sos");
  target.innerHTML = result.data.length ? result.data.map(incidentCard).join("") : emptyState("No active safety incidents recorded.", "verified_user");
}

function incidentCard(incident) {
  const isOpen = incident.status === "OPEN";
  return `
    <article class="incident-card" style="padding:16px; background:var(--surface-container-lowest); border:1px solid var(--outline-variant); border-radius:var(--radius-lg); margin-bottom:10px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
        <span class="status-pill ${isOpen ? "red" : "green"}">${esc(incident.status)}</span>
        <small style="color:var(--outline);">${formatDate(incident.createdAt)}</small>
      </div>
      <p style="font-size:14px; font-weight:600; color:var(--on-surface); margin-bottom:6px;">${esc(incident.note)}</p>
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
        <span style="font-size:12px; color:var(--on-surface-variant); display:inline-flex; align-items:center; gap:4px;">
          ${icon("location_on")} ${esc(incident.location)}
        </span>
        ${isOpen && isAdmin() ? `
          <button class="outline-button" style="min-height:32px; padding:0 10px; font-size:12px;" data-action="resolve-sos" data-incident="${incident.id}">
            Mark Incident Resolved ${icon("check")}
          </button>
        ` : ""}
      </div>
    </article>
  `;
}

async function loadSettings() {
  const [settings, workers] = await Promise.all([api("/api/settings"), api("/api/workers")]);
  const target = document.querySelector("#settings");
  if (!target) return;

  const worker = workers.data.find((item) => item.userId === state.user.id);

  target.innerHTML = `
    ${settingsGroup("Service Preferences", worker ? `
      <div class="setting-row">
        <div>
          <strong>Accepting Gigs</strong>
          <p>Toggle availability in the active job matching pool</p>
        </div>
        <button class="switch ${worker.availabilityStatus === "AVAILABLE" ? "on" : ""}" data-toggle="worker.availabilityStatus" aria-label="Toggle availability"></button>
      </div>
      <div class="setting-row">
        <div>
          <strong>Auto-Accept Fair Wage Matches</strong>
          <p>Instant booking when job exceeds the fair wage threshold</p>
        </div>
        <button class="switch ${worker?.preferences?.autoAcceptFairWage ? "on" : ""}" data-toggle="worker.autoAcceptFairWage" aria-label="Toggle auto-accept"></button>
      </div>
      <div class="setting-row">
        <div>
          <strong>Service Radius (Kilometers)</strong>
          <p>Maximum travel range for local gig alerts</p>
        </div>
        <div style="display:flex; align-items:center; gap:6px;">
          <input id="radius" class="radius-input" type="number" min="1" max="50" value="${worker?.serviceRadiusKm || 15}" />
          <span style="font-size:13px; font-weight:600;">km</span>
        </div>
      </div>
    ` : `
      <div class="setting-row">
        <div>
          <strong>Share Precise Service Location</strong>
          <p>Exact address is shared only with the matched professional</p>
        </div>
        <button class="switch ${settings.data.privacy?.showExactLocation ? "on" : ""}" data-toggle="privacy.showExactLocation" aria-label="Toggle location privacy"></button>
      </div>
    `)}

    ${settingsGroup("Notification Preferences", `
      <div class="setting-row">
        <div><strong>New Job Opportunities</strong><p>Push alerts for matched tasks</p></div>
        <button class="switch ${settings.data.notifications?.jobs ? "on" : ""}" data-toggle="notifications.jobs" aria-label="Toggle job alerts"></button>
      </div>
      <div class="setting-row">
        <div><strong>Payment Receipts &amp; Payouts</strong><p>Disbursement settlement alerts</p></div>
        <button class="switch ${settings.data.notifications?.payments ? "on" : ""}" data-toggle="notifications.payments" aria-label="Toggle payment alerts"></button>
      </div>
      <div class="setting-row">
        <div><strong>Cooperative Safety Updates</strong><p>Broadcasts and weather/emergency notices</p></div>
        <button class="switch ${settings.data.notifications?.safety ? "on" : ""}" data-toggle="notifications.safety" aria-label="Toggle safety alerts"></button>
      </div>
    `)}

    ${settingsGroup("Account & Security", `
      <button class="setting-link" data-action="location-info">
        <div style="display:flex; align-items:center; gap:8px;">${icon("phone_iphone")} <span>Change Registered Mobile Number</span></div>
        ${icon("chevron_right")}
      </button>
      <button class="setting-link" data-go="/${baseForRole(state.user.role)}/assistant">
        <div style="display:flex; align-items:center; gap:8px;">${icon("support_agent")} <span>Sahyog AI Help Desk</span></div>
        ${icon("chevron_right")}
      </button>
      <button class="setting-link danger-link" data-action="logout">
        <div style="display:flex; align-items:center; gap:8px;">${icon("logout")} <span>Sign Out of Account</span></div>
        ${icon("chevron_right")}
      </button>
    `)}

    <button class="primary-button settings-save" data-action="save-settings" style="width:100%; margin-top:12px;">Save Preferences</button>
  `;
}

function settingsGroup(title, content) {
  return `<section class="settings-group"><h2>${title}</h2>${content}</section>`;
}

async function loadAnalytics() {
  const result = await api("/api/analytics/summary");
  const metrics = document.querySelector("#analyticsMetrics");
  if (metrics) metrics.innerHTML = metricCards(result.data.totals);
  const demand = document.querySelector("#analyticsBars");
  const status = document.querySelector("#statusBars");
  if (demand) demand.innerHTML = barRows(result.data.serviceDemand);
  if (status) status.innerHTML = barRows(result.data.jobsByStatus);
}

function barRows(data) {
  const max = Math.max(1, ...Object.values(data));
  const entries = Object.entries(data);
  return entries.length ? entries.map(([key, value]) => `
    <div style="display:flex; flex-direction:column; gap:4px;">
      <div style="display:flex; justify-content:space-between; font-size:13px; font-weight:600;">
        <span>${esc(key.replace(/_/g, " "))}</span>
        <strong>${value}</strong>
      </div>
      <div class="progress"><b style="width:${Math.max(8, (Number(value) / max) * 100)}%"></b></div>
    </div>
  `).join("") : emptyState("No records available.", "bar_chart");
}

function demandRows(demand, workers) {
  const max = Math.max(1, ...Object.values(demand));
  const rows = Object.entries(demand);
  return `
    <table style="width:100%; border-collapse:collapse; font-size:13px; text-align:left;">
      <thead>
        <tr style="border-bottom:1px solid var(--outline-variant); color:var(--on-surface-variant); font-weight:700;">
          <th style="padding:10px;">Service Category</th>
          <th style="padding:10px;">Weekly Demand</th>
          <th style="padding:10px;">Available Pool</th>
          <th style="padding:10px;">Trend</th>
          <th style="padding:10px;">Action</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(([name, val]) => `
          <tr style="border-bottom:1px solid var(--outline-subtle);">
            <td style="padding:12px 10px; font-weight:600;">${esc(name)}</td>
            <td style="padding:12px 10px;">
              <div class="progress" style="width:80px; display:inline-block; vertical-align:middle; margin-right:6px;"><b style="width:${(Number(val) / max) * 100}%"></b></div>
              ${val > 1 ? "High" : "Standard"}
            </td>
            <td style="padding:12px 10px;">${workers.filter((w) => w.availabilityStatus === "AVAILABLE").length} Active</td>
            <td style="padding:12px 10px; color:var(--secondary); font-weight:600;">${val > 1 ? "+14% ↑" : "-1% →"}</td>
            <td style="padding:12px 10px;"><button class="outline-button" style="min-height:32px; padding:0 10px; font-size:12px;" data-go="/${baseForRole(state.user.role)}/workers">Manage</button></td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

async function loadNotifications() {
  const result = await api("/api/notifications");
  state.unreadNotificationsCount = result.data.filter((n) => !n.read).length;
  const target = document.querySelector("#notifications");
  if (target) {
    target.innerHTML = result.data.length ? result.data.map((item) => `
      <article class="notification-card ${item.read ? "read" : ""}">
        <span>${icon(item.type === "SAFETY" ? "warning" : item.type === "JOB" ? "work" : item.type === "REVIEW" ? "star" : item.type === "PAYMENT" ? "payments" : "notifications")}</span>
        <div>
          <strong>${esc(item.title)}</strong>
          <p>${esc(item.body)}</p>
          <small>${formatDate(item.createdAt)}</small>
        </div>
      </article>
    `).join("") : emptyState("All caught up! No notifications.", "notifications_off");
  }
}

async function loadDisputes() {
  const [result, jobs] = await Promise.all([api("/api/disputes"), api("/api/jobs")]);
  const target = document.querySelector("#disputes");
  if (!target) return;

  target.innerHTML = result.data.length ? result.data.map((item) => {
    const job = jobs.data.find((entry) => entry.id === item.jobId);
    const isOpen = item.status === "OPEN";
    return `
      <article class="dispute-card" style="padding:16px; background:var(--surface-container-lowest); border:1px solid var(--outline-variant); border-radius:var(--radius-lg); margin-bottom:12px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <strong style="font-size:15px;">${esc(job?.title || "Job Case Review")}</strong>
          <span class="status-pill ${isOpen ? "red" : "green"}">${esc(item.status)}</span>
        </div>
        <p style="font-size:13px; color:var(--on-surface-variant); margin-bottom:8px;">${esc(item.reason)}</p>
        ${item.resolution ? `<p style="font-size:12px; color:var(--secondary); font-weight:600; margin-bottom:8px;">Resolution: ${esc(item.resolution)}</p>` : ""}
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <small style="color:var(--outline);">${formatDate(item.createdAt)}</small>
          ${isOpen && isAdmin() ? `
            <button class="secondary-button" style="min-height:32px; padding:0 12px; font-size:12px;" data-action="resolve-dispute" data-dispute="${item.id}">
              Resolve Dispute ${icon("check")}
            </button>
          ` : ""}
        </div>
      </article>
    `;
  }).join("") : emptyState("No disputes currently open in your jurisdiction.", "gavel");
}

async function loadWorkers() {
  const result = await api("/api/workers");
  const target = document.querySelector("#workers");
  if (!target) return;

  target.innerHTML = result.data.length ? result.data.map((worker) => {
    const isVerified = worker.verificationStatus === "VERIFIED";
    return `
      <article class="dashboard-panel" style="display:flex; align-items:center; gap:16px; margin-bottom:12px;">
        <div class="directory-avatar" style="width:48px; height:48px; font-size:18px;">${esc(worker.name?.slice(0, 1) || "W")}</div>
        <div style="flex:1;">
          <div style="display:flex; align-items:center; gap:8px;">
            <strong style="font-size:16px;">${esc(worker.name)}</strong>
            <span class="status-pill ${isVerified ? "green" : "orange"}">${esc(worker.verificationStatus)}</span>
          </div>
          <p style="font-size:13px; color:var(--on-surface-variant); margin:2px 0;">${icon("location_on")} ${esc(worker.location || "Cooperative Node")}</p>
          <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:6px;">
            ${worker.skills.map((s) => `<span class="status-pill" style="background:var(--surface-low); font-size:11px;">${esc(s)}</span>`).join("")}
          </div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:13px; font-weight:700; color:var(--on-surface); margin-bottom:6px;">${Number(worker.rating || 0).toFixed(1)} ★ (${worker.completedJobs || 0} jobs)</div>
          ${isAdmin() ? `
            <button class="outline-button" style="min-height:30px; padding:0 10px; font-size:12px;" data-action="verify-worker" data-worker="${worker.id}" data-status="${isVerified ? "PENDING" : "VERIFIED"}">
              ${isVerified ? "Set Pending" : "Verify Worker"}
            </button>
          ` : ""}
        </div>
      </article>
    `;
  }).join("") : emptyState("No workers recorded.", "groups");
}

function loadProfile() {
  const target = document.querySelector("#profileDetails");
  if (!target) return;

  const items = [
    ["badge", "System Role", state.user.role.replace(/_/g, " ")],
    ["domain", "Cooperative Federation", state.user.cooperativeId || "Delhi NCR Federation #4"],
    ["verified", "Account Status", state.user.accountStatus || "ACTIVE"],
    ["percent", "Profile Health", `${state.user.profileCompletion || 85}%`]
  ];

  target.innerHTML = items.map(([glyph, label, value]) => `
    <article>
      <small>${label}</small>
      <strong>${esc(value)}</strong>
    </article>
  `).join("");
}

async function loadMessages() {
  const result = await api("/api/messages/conversations");
  const target = document.querySelector("#messages");
  if (!target) return;

  target.innerHTML = result.data.length ? result.data.map((conversation) => `
    <article class="notification-card" style="margin-bottom:10px;">
      <span>${icon("forum")}</span>
      <div style="flex:1;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <strong>${esc(conversation.otherUserName)}</strong>
          <small style="color:var(--primary); font-weight:600;">${esc(conversation.jobTitle)}</small>
        </div>
        <p>${esc(conversation.messages.at(-1)?.body || "No messages in thread yet.")}</p>
        <small>${conversation.messages.length} messages in conversation</small>
      </div>
    </article>
  `).join("") : emptyState("No active service conversations.", "forum");
}

function emptyState(message, glyph) {
  return `<div class="empty-state"><span>${icon(glyph)}</span><p>${esc(message)}</p></div>`;
}

function badgeColor(status) {
  if (["COMPLETED", "VERIFIED", "ACCEPTED", "AVAILABLE", "SANDBOX_AUTHORIZED"].includes(status)) return "green";
  if (["DISPUTED", "CANCELLED", "OPEN"].includes(status)) return "red";
  if (["POSTED", "MATCHING", "PENDING"].includes(status)) return "orange";
  return "purple";
}

function formatDate(value) {
  if (!value) return "Flexible / Today";
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
}

/* ==========================================================================
   Event Delegation
   ========================================================================== */

async function delegateClick(event) {
  const target = event.target.closest("button, [data-job], a[data-go], .chat-suggestion-chip, #workerAvailToggle");
  if (!target) return;

  if (target.id === "workerAvailToggle") {
    target.classList.toggle("offline");
    const isOnline = !target.classList.contains("offline");
    await api("/api/settings", { method: "PUT", body: { workerPreferences: { availabilityStatus: isOnline ? "AVAILABLE" : "OFFLINE" } } }).catch(() => {});
    setToast(isOnline ? "You are now ONLINE for job matches" : "You are now OFFLINE");
    return;
  }

  if (target.dataset.go) {
    event.preventDefault();
    if (target.dataset.action === "assistant-close") state.assistantOpen = false;
    return go(target.dataset.go);
  }

  if (target.dataset.role) {
    state.selectedRole = target.dataset.role;
    return render();
  }

  if (target.dataset.service) {
    const select = document.querySelector("#serviceSelect");
    if (select) {
      select.value = target.dataset.service;
      await updateWagePreview();
    }
    return;
  }

  if (target.dataset.job && !target.dataset.transition && !target.dataset.action) {
    const route = routeInfo(location.pathname);
    await selectJob(target.dataset.job, route);
    document.querySelectorAll("[data-job]").forEach((el) => el.classList.toggle("selected", el.dataset.job === target.dataset.job));
    return;
  }

  if (target.dataset.transition) {
    const jobId = target.dataset.job || state.selectedJobId;
    const result = await api(`/api/jobs/${jobId}/transition`, { method: "POST", body: { status: target.dataset.transition } });
    state.selectedJobId = result.data.id;
    setToast(`Job status updated: ${result.data.status.replace(/_/g, " ")}`);
    return loadJobs(routeInfo(location.pathname));
  }

  if (target.dataset.welfare) {
    await api("/api/welfare/apply", { method: "POST", body: { schemeId: target.dataset.welfare } });
    setToast("Welfare scheme application submitted successfully");
    return loadEarnings();
  }

  if (target.dataset.training) {
    await api("/api/training/enroll", { method: "POST", body: { programId: target.dataset.training } });
    setToast("Enrolled in cooperative training program");
    return loadEarnings();
  }

  if (target.dataset.toggle) {
    target.classList.toggle("on");
    return;
  }

  if (target.dataset.action) return handleAction(target.dataset.action, target);
}

async function handleAction(action, target) {
  if (action === "assistant-open") {
    state.assistantOpen = true;
    return render();
  }
  if (action === "assistant-close") {
    state.assistantOpen = false;
    return render();
  }
  if (action === "chip-ask") {
    const query = target.dataset.query;
    state.chat.push({ role: "user", body: query });
    state.assistantOpen = true;
    state.assistantThinking = true;
    render();
    try {
      const result = await api("/api/ai/conversations", { method: "POST", body: { message: query } });
      state.chat = result.data.messages;
    } catch (err) {
      setToast(err.message, "error");
    } finally {
      state.assistantThinking = false;
      render();
    }
    return;
  }
  if (action === "rate-star") {
    state.ratingDraft = Number(target.dataset.rating || 5);
    document.querySelectorAll("#starPicker button").forEach((btn) => {
      btn.classList.toggle("selected", Number(btn.dataset.rating) <= state.ratingDraft);
    });
    return;
  }
  if (action === "submit-review") {
    const jobId = target.dataset.job;
    const body = document.querySelector("#reviewText")?.value || "";
    await api("/api/reviews", { method: "POST", body: { jobId, rating: state.ratingDraft, body } });
    setToast("Review and rating recorded successfully!");
    return loadJobs(routeInfo(location.pathname));
  }
  if (action === "pay-job") {
    const jobId = target.dataset.job;
    const amount = target.dataset.amount;
    await api("/api/payments", { method: "POST", body: { jobId, amount } });
    setToast("Payment settled via Sandbox Escrow!");
    return loadJobs(routeInfo(location.pathname));
  }
  if (action === "assign-worker") {
    const jobId = target.dataset.job || state.selectedJobId;
    const workerId = target.dataset.worker;
    await api(`/api/jobs/${jobId}/transition`, { method: "POST", body: { status: "ASSIGNED", workerId } });
    setToast("Worker selected and job assigned!");
    return loadJobs(routeInfo(location.pathname));
  }
  if (action === "verify-worker") {
    const workerId = target.dataset.worker;
    const newStatus = target.dataset.status || "VERIFIED";
    await api(`/api/workers/${workerId}/verify`, { method: "PATCH", body: { status: newStatus } });
    setToast(`Worker verification updated to ${newStatus}`);
    return loadWorkers();
  }
  if (action === "resolve-dispute") {
    const disputeId = target.dataset.dispute;
    const resolution = window.prompt("Enter dispute mediation resolution note:", "Parties mutually agreed to standard cooperative settlement.");
    if (!resolution) return;
    await api(`/api/disputes/${disputeId}/resolve`, { method: "POST", body: { resolution } });
    setToast("Dispute marked as RESOLVED");
    return loadDisputes();
  }
  if (action === "resolve-sos") {
    const incidentId = target.dataset.incident;
    await api(`/api/sos/${incidentId}/resolve`, { method: "POST", body: {} });
    setToast("Safety incident resolved");
    return loadIncidents();
  }
  if (action === "logout") {
    await api("/api/auth/logout", { method: "POST" });
    state.user = null;
    state.csrfToken = null;
    state.assistantOpen = false;
    state.chat = [];
    return go("/");
  }
  if (action === "forgot") {
    const email = document.querySelector("input[name=email]")?.value;
    await api("/api/auth/forgot-password", { method: "POST", body: { email } });
    return setToast("Password reset instructions dispatched to email.");
  }
  if (action === "otp-info") {
    return setToast("OTP authentication simulated: use the primary Email login with demo password.", "error");
  }
  if (action === "dispute") {
    const jobId = target.dataset.job || state.selectedJobId;
    const reason = window.prompt("Please enter the reason for reporting this job dispute:", "Material or scheduling discrepancy");
    if (!reason) return;
    await api("/api/disputes", { method: "POST", body: { jobId, reason } });
    setToast("Dispute ticket logged for cooperative mediation");
    return loadJobs(routeInfo(location.pathname));
  }
  if (action === "sos-confirm") {
    const note = document.querySelector("#sosNote")?.value || "Worker triggered cooperative safety assistance.";
    await api("/api/sos", { method: "POST", body: { location: "Noida Sector 62 (Simulated GPS)", note } });
    setToast("SOS emergency dispatched to cooperative safety desk");
    return loadIncidents();
  }
  if (action === "save-settings") {
    const notifications = {};
    const privacy = {};
    const workerPreferences = {};

    document.querySelectorAll("[data-toggle]").forEach((element) => {
      const [group, key] = element.dataset.toggle.split(".");
      if (group === "notifications") notifications[key] = element.classList.contains("on");
      if (group === "privacy") privacy[key] = element.classList.contains("on");
      if (group === "worker" && key === "autoAcceptFairWage") workerPreferences.autoAcceptFairWage = element.classList.contains("on");
      if (group === "worker" && key === "availabilityStatus") workerPreferences.availabilityStatus = element.classList.contains("on") ? "AVAILABLE" : "OFFLINE";
    });

    const radius = document.querySelector("#radius")?.value;
    if (radius) workerPreferences.serviceRadiusKm = radius;

    await api("/api/settings", { method: "PUT", body: { notifications, privacy, workerPreferences } });
    return setToast("Cooperative preferences saved successfully");
  }
  if (action === "mark-read") {
    await api("/api/notifications/read", { method: "POST" });
    state.unreadNotificationsCount = 0;
    setToast("All notifications marked as read");
    return loadNotifications();
  }
  if (action === "location-info") {
    return setToast("Location tracking uses verified cooperative sector coordinates.");
  }
}

async function delegateSubmit(event) {
  const form = event.target.closest("form[data-form]");
  if (!form) return;
  event.preventDefault();
  const values = Object.fromEntries(new FormData(form).entries());

  try {
    if (form.dataset.form === "login") {
      const result = await api("/api/auth/login", { method: "POST", body: values });
      state.user = result.user;
      state.csrfToken = result.csrfToken;
      state.home = result.home;
      setToast(`Signed in as ${result.user.name}`);
      return go(result.home);
    }
    if (form.dataset.form === "register") {
      await api("/api/auth/register", { method: "POST", body: { ...values, role: state.selectedRole } });
      state.selectedRole = state.selectedRole === "CUSTOMER" ? "CUSTOMER" : "WORKER";
      setToast("Registration successful. Sign in to access your account.");
      return go("/login");
    }
    if (form.dataset.form === "job") {
      const result = await api("/api/jobs", { method: "POST", body: values });
      state.selectedJobId = result.data.id;
      setToast("Job request created with Fair Wage estimate");
      return go("/customer/jobs");
    }
    if (form.dataset.form === "job-message") {
      const jobId = form.dataset.job;
      const conversationRes = await api(`/api/messages/jobs/${jobId}`);
      if (conversationRes?.conversation?.id) {
        await api("/api/messages", { method: "POST", body: { conversationId: conversationRes.conversation.id, body: values.body } });
        form.reset();
        await selectJob(jobId);
      }
      return;
    }
    if (form.dataset.form === "assistant") {
      state.chat.push({ role: "user", body: values.message });
      state.assistantOpen = true;
      state.assistantThinking = true;
      form.reset();
      render();
      try {
        const result = await api("/api/ai/conversations", { method: "POST", body: { message: values.message } });
        state.chat = result.data.messages;
      } finally {
        state.assistantThinking = false;
        render();
      }
      return;
    }
  } catch (error) {
    setToast(error.message, "error");
    render();
  }
}

function demoEmail(role) {
  return {
    WORKER: "worker@sahyog.local",
    CUSTOMER: "customer@sahyog.local",
    COOPERATIVE_ADMIN: "coop@sahyog.local",
    FEDERATION_ADMIN: "federation@sahyog.local",
    SUPER_ADMIN: "admin@sahyog.local"
  }[role] || "worker@sahyog.local";
}

boot().catch((error) => {
  app.innerHTML = `<main class="auth-page"><section class="auth-card">${brand("auth-brand-logo")}<p class="toast error">${esc(error.message)}</p></section></main>`;
});
