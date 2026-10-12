import { getCurrentUser, signIn, onAuthChange } from './auth.js';
import { initDashboard } from './dashboard.js';
import './style.css';

const app = document.getElementById('app');
let cleanupDashboard = null;

async function render() {
  const user = await getCurrentUser();

  if (cleanupDashboard) {
    cleanupDashboard();
    cleanupDashboard = null;
  }

  if (user) {
    cleanupDashboard = initDashboard(app, user);
  } else {
    renderLogin();
  }
}

function renderLogin() {
  app.innerHTML = `
    <div class="login-screen">
      <h1>Taskapture</h1>
      <form id="login-form">
        <input id="email" type="email" placeholder="Email" autocomplete="username" required />
        <input id="password" type="password" placeholder="Password" autocomplete="current-password" required />
        <button type="submit">Sign in</button>
        <p id="login-error" class="error"></p>
      </form>
    </div>
  `;

  app.querySelector('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = app.querySelector('#email').value;
    const password = app.querySelector('#password').value;
    const errorEl = app.querySelector('#login-error');
    errorEl.textContent = '';

    try {
      await signIn(email, password);
      // onAuthChange fires render() after a successful sign-in.
    } catch (err) {
      errorEl.textContent = err.message;
    }
  });
}

onAuthChange(render);
render();
