import { getStoredSession, signIn, signOut } from './authClient.js';

const root = document.getElementById('popup-root');

async function render() {
  const session = await getStoredSession();
  root.innerHTML = session ? renderSignedIn(session) : renderLoginForm();

  if (!session) {
    document.getElementById('popup-login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('popup-email').value;
      const password = document.getElementById('popup-password').value;
      const errorEl = document.getElementById('popup-error');
      errorEl.textContent = '';

      try {
        await signIn(email, password);
        render();
      } catch (err) {
        errorEl.textContent = err.message;
      }
    });
  } else {
    document.getElementById('popup-signout').addEventListener('click', async () => {
      await signOut();
      render();
    });
  }
}

function renderLoginForm() {
  return `
    <h3>Taskapture</h3>
    <form id="popup-login-form">
      <input id="popup-email" type="email" placeholder="Email" required />
      <input id="popup-password" type="password" placeholder="Password" required />
      <button type="submit">Sign in</button>
      <p id="popup-error" class="error"></p>
    </form>
  `;
}

function renderSignedIn(session) {
  return `
    <h3>Taskapture</h3>
    <p>Signed in as ${session.user?.email || 'you'}</p>
    <p class="hint">Select text on any page → right-click → "Create Task with Taskapture"</p>
    <button id="popup-signout">Sign out</button>
  `;
}

render();
