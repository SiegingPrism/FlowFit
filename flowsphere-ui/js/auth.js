/**
 * Authentication logic for login.html & signup.html
 */

    // Hide error initially
    const errEl = document.getElementById("login-error");
    if (errEl) errEl.style.display = 'none';

    // Handle Login
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            const submitBtn = e.target.querySelector('button[type="submit"]');

            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = 'Signing In...';
            }
            if (errEl) errEl.style.display = 'none';

            const { data, error } = await window.supabaseClient.auth.signInWithPassword({
                email,
                password
            });

            if (error) {
                if (errEl) {
                    errEl.textContent = error.message;
                    errEl.style.display = 'block';
                }
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Sign In';
                }
            } else {
                // Success: Redirect to dashboard
                window.location.replace("index.html");
            }
        });
    }

    // Handle Signup (if on signup.html)
    const signupForm = document.getElementById('signup-form');
    if (signupForm) {
        signupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            const submitBtn = e.target.querySelector('button[type="submit"]');

            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = 'Signing Up...';
            }
            if (errEl) errEl.style.display = 'none';

            // Register User
            const { data, error } = await window.supabaseClient.auth.signUp({
                email,
                password
            });

            if (error) {
                if (errEl) {
                    errEl.textContent = error.message;
                    errEl.style.display = 'block';
                }
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Sign Up';
                }
            } else {
                // Success
                alert("Signup successful! You can now log in.");
                window.location.replace("login.html");
            }
        });
    }

    // Handle Google Login
    const googleBtn = document.getElementById('google-login');
    if (googleBtn) {
        googleBtn.addEventListener('click', async () => {
            const { error } = await window.supabaseClient.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: window.location.origin + '/index.html'
                }
            });
            if (error) {
                if (errEl) {
                    errEl.textContent = error.message;
                    errEl.style.display = 'block';
                }
            }
        });
    }

    document.addEventListener('click', async (e) => {
        const btn = e.target.closest('#logout-btn');
        if (btn) {
            e.preventDefault();
            btn.textContent = 'Logging out...';
            try {
                const { error } = await window.supabaseClient.auth.signOut();
                if (error) throw error;
                localStorage.clear();
                window.location.replace("login.html");
            } catch (err) {
                alert("Logout Error: " + err.message);
                btn.textContent = 'Log Out';
                localStorage.clear();
                window.location.replace("login.html");
            }
        }
    });
