/**
 * Food Rescue & Donation Management System
 * Frontend API Integration, Auth Management & UI Handling
 */

// Candidate backend URLs for seamless fallback
const BACKEND_CANDIDATES = [
    "http://localhost:3000",
    "http://127.0.0.1:3000"
];

let activeBackendUrl = BACKEND_CANDIDATES[0];

/* =========================================================================
   AUTHENTICATION STATE HELPERS (localStorage)
   ========================================================================= */

const AUTH_STORAGE_KEY = "foodRescue_currentUser";

function getCurrentUser() {
    try {
        const stored = localStorage.getItem(AUTH_STORAGE_KEY);
        return stored ? JSON.parse(stored) : null;
    } catch (e) {
        console.error("Error reading current user from storage:", e);
        return null;
    }
}

function setCurrentUser(user) {
    try {
        if (user) {
            localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
        } else {
            localStorage.removeItem(AUTH_STORAGE_KEY);
        }
    } catch (e) {
        console.error("Error saving current user to storage:", e);
    }
}

function logout() {
    setCurrentUser(null);
    showNotification("You have been signed out successfully.", "info");
    setTimeout(() => {
        // Redirect to login page properly from any subdirectory
        const path = window.location.pathname.toLowerCase();
        const isSubdir = path.includes("/donor/") || path.includes("/ngo/") || path.includes("/volunteer/") || path.includes("/admin/");
        window.location.href = isSubdir ? "../login.html" : "login.html";
    }, 600);
}

// Make auth helpers available globally
window.getCurrentUser = getCurrentUser;
window.setCurrentUser = setCurrentUser;
window.logout = logout;

/* =========================================================================
   BACKEND HEALTH CHECK & DYNAMIC URL RESOLUTION
   ========================================================================= */

let resolvedWorkingUrl = null;

async function getWorkingBackendUrl() {
    if (resolvedWorkingUrl) return resolvedWorkingUrl;

    for (const url of BACKEND_CANDIDATES) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2000);
            const response = await fetch(`${url}/api/health`, {
                method: "GET",
                headers: { "Accept": "application/json" },
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            if (response.ok) {
                resolvedWorkingUrl = url;
                activeBackendUrl = url;
                return url;
            }
        } catch (e) {
            // Try next candidate
        }
    }
    return activeBackendUrl || "http://localhost:3000";
}

async function checkBackendConnection(showToast = false) {
    const statusBadges = document.querySelectorAll(".backend-status-badge, #backendStatusBadge");

    const updateBadges = (status, text, title) => {
        statusBadges.forEach(badge => {
            badge.className = `backend-status-badge ${status}`;
            badge.innerHTML = `<span class="status-dot"></span> ${text}`;
            if (title) badge.title = title;
        });
    };

    updateBadges("checking", "Checking connection...", "Checking backend status");

    let connectedUrl = null;
    let dbStatus = false;
    let errMsg = null;

    for (const url of BACKEND_CANDIDATES) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2500);
            const response = await fetch(`${url}/api/health`, {
                method: "GET",
                headers: { "Accept": "application/json" },
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (response.ok) {
                const data = await response.json();
                connectedUrl = url;
                resolvedWorkingUrl = url;
                activeBackendUrl = url;
                dbStatus = (data.database === "connected");
                break;
            }
        } catch (e) {
            errMsg = e.message;
        }
    }

    if (connectedUrl) {
        if (dbStatus) {
            updateBadges("online", "Backend Connected", `Server: ${connectedUrl} | DB: connected`);
            if (showToast) showNotification("Backend server and MySQL database are connected and active!", "success");
        } else {
            updateBadges("warning", "DB Disconnected", `Server: ${connectedUrl} | DB: disconnected`);
            if (showToast) showNotification("Backend is running, but MySQL connection is degraded.", "warning");
        }
        return true;
    } else {
        updateBadges("offline", "Backend Offline", `Unable to connect to ${BACKEND_CANDIDATES.join(" or ")}`);
        if (showToast) {
            showNotification(
                "Could not connect to the backend server.\n\nPlease ensure node server.js is running in the backend directory.",
                "error"
            );
        }
        return false;
    }
}

/* =========================================================================
   NOTIFICATION TOAST SYSTEM
   ========================================================================= */

function showNotification(message, type = "info") {
    let container = document.getElementById("toast-container");
    if (!container) {
        container = document.createElement("div");
        container.id = "toast-container";
        container.className = "toast-container";
        document.body.appendChild(container);
    }

    const toast = document.createElement("div");
    toast.className = `toast-message toast-${type}`;
    
    const icon = type === "success" ? "✓" : type === "error" ? "✕" : type === "warning" ? "⚠️" : "ℹ";
    toast.innerHTML = `
        <div class="toast-content">
            <span class="toast-icon">${icon}</span>
            <div class="toast-text">${message.replace(/\n/g, '<br>')}</div>
        </div>
        <button class="toast-close" onclick="this.parentElement.remove()">×</button>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        if (toast.parentElement) {
            toast.classList.add("toast-fade-out");
            setTimeout(() => toast.remove(), 400);
        }
    }, 6000);
}

window.checkBackendConnection = checkBackendConnection;
window.showNotification = showNotification;

/* =========================================================================
   UI HELPERS: TOGGLE PASSWORD, DEMO AUTOFILL, ROLE SELECTOR
   ========================================================================= */

function togglePasswordVisibility(inputId, btnEl) {
    const input = document.getElementById(inputId);
    if (!input) return;
    if (input.type === "password") {
        input.type = "text";
        btnEl.textContent = "🙈";
        btnEl.title = "Hide password";
    } else {
        input.type = "password";
        btnEl.textContent = "👁️";
        btnEl.title = "Show password";
    }
}

function fillDemoLogin(email, password) {
    const emailInput = document.getElementById("loginEmail");
    const passwordInput = document.getElementById("loginPassword");
    if (emailInput && passwordInput) {
        emailInput.value = email;
        passwordInput.value = password;
        showNotification(`Filled demo credentials for ${email}`, "info");
    }
}

function selectRole(cardEl, roleValue) {
    document.querySelectorAll(".role-card").forEach(c => c.classList.remove("active"));
    cardEl.classList.add("active");
    const radio = cardEl.querySelector("input[type='radio']");
    if (radio) radio.checked = true;

    // Adjust labels based on role
    const orgLabel = document.getElementById("labelOrgName");
    const orgInput = document.getElementById("regOrgName");
    if (orgLabel && orgInput) {
        if (roleValue === "DONOR") {
            orgLabel.textContent = "Restaurant / Business Name";
            orgInput.placeholder = "e.g. ABC Restaurant";
        } else if (roleValue === "NGO") {
            orgLabel.textContent = "NGO / Trust Name *";
            orgInput.placeholder = "e.g. Hope Foundation";
        } else {
            orgLabel.textContent = "Organization / Affiliation (Optional)";
            orgInput.placeholder = "e.g. Community Helpers";
        }
    }
}

function updatePasswordStrength(password) {
    const meter = document.getElementById("strengthIndicator");
    const label = document.getElementById("strengthText");
    if (!meter || !label) return;

    if (!password) {
        meter.style.width = "0%";
        meter.className = "strength-meter";
        label.textContent = "Enter a password";
        label.style.color = "#78909c";
        return;
    }

    let score = 0;
    if (password.length >= 6) score++;
    if (password.length >= 10) score++;
    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;

    if (score <= 2) {
        meter.style.width = "30%";
        meter.className = "strength-meter weak";
        label.textContent = "Weak password (add numbers or special characters)";
        label.style.color = "#e53935";
    } else if (score <= 4) {
        meter.style.width = "70%";
        meter.className = "strength-meter medium";
        label.textContent = "Medium password";
        label.style.color = "#f57c00";
    } else {
        meter.style.width = "100%";
        meter.className = "strength-meter strong";
        label.textContent = "Strong password ✓";
        label.style.color = "#2e7d32";
    }
}

function checkPasswordMatch() {
    const password = document.getElementById("regPassword")?.value || "";
    const confirm = document.getElementById("regConfirmPassword")?.value || "";
    const msg = document.getElementById("passwordMatchMessage");
    if (!msg) return;

    if (!confirm) {
        msg.textContent = "";
        return;
    }

    if (password === confirm) {
        msg.textContent = "✓ Passwords match";
        msg.className = "field-feedback match-success";
    } else {
        msg.textContent = "✕ Passwords do not match";
        msg.className = "field-feedback match-error";
    }
}

window.togglePasswordVisibility = togglePasswordVisibility;
window.fillDemoLogin = fillDemoLogin;
window.selectRole = selectRole;
window.updatePasswordStrength = updatePasswordStrength;
window.checkPasswordMatch = checkPasswordMatch;

/* =========================================================================
   DYNAMIC NAVBAR USER STATE SYNC
   ========================================================================= */

function syncNavbarAuth() {
    const user = getCurrentUser();
    const nav = document.querySelector(".navbar nav");
    if (!nav) return;

    const path = window.location.pathname.toLowerCase();
    const isDonorSubdir = path.includes("/donor/");
    const isNgoSubdir = path.includes("/ngo/");
    const isAdminSubdir = path.includes("/admin/");
    const isVolunteerSubdir = path.includes("/volunteer/");
    const isSubdir = isDonorSubdir || isNgoSubdir || isAdminSubdir || isVolunteerSubdir;
    const basePath = isSubdir ? "../" : "";
    const donorPath = isDonorSubdir ? "" : (isSubdir ? "../donor/" : "donor/");
    const ngoPath = isNgoSubdir ? "" : (isSubdir ? "../ngo/" : "ngo/");
    const adminPath = isAdminSubdir ? "" : (isSubdir ? "../admin/" : "admin/");
    const volPath = isVolunteerSubdir ? "" : (isSubdir ? "../volunteer/" : "volunteer/");

    if (user) {
        let roleLinks = '';
        const role = (user.role || "").toUpperCase();
        if (role === 'DONOR') {
            roleLinks = `
                <a href="${donorPath}dashboard.html">Dashboard</a>
                <a href="${donorPath}my-donations.html">My Donations</a>
                <a href="${donorPath}add-donation.html">+ Add Donation</a>
            `;
        } else if (role === 'NGO') {
            roleLinks = `
                <a href="${ngoPath}dashboard.html">Dashboard</a>
                <a href="${ngoPath}my-requests.html">My Requests</a>
                <a href="${ngoPath}create-request.html">+ Request Food</a>
                <a href="${ngoPath}available-food.html">Available Food</a>
            `;
        } else if (role === 'ADMIN') {
            roleLinks = `
                <a href="${adminPath}dashboard.html">Dashboard</a>
                <a href="${adminPath}allocations.html">Allocations</a>
                <a href="${adminPath}deliveries.html">Deliveries</a>
                <a href="${adminPath}history.html">History</a>
                <a href="${adminPath}users.html">Users</a>
            `;
        } else if (role === 'VOLUNTEER') {
            roleLinks = `
                <a href="${volPath}dashboard.html">Dashboard</a>
                <a href="${volPath}my-deliveries.html">My Deliveries</a>
            `;
        }

        nav.innerHTML = `
            <a href="${basePath}index.html">Home</a>
            ${roleLinks}
            <a href="${basePath}profile.html">⚙️ Profile</a>
            <div class="user-profile-badge">
                <span class="user-avatar-icon">👤</span>
                <span class="user-name-text">${escapeHtml(user.name)}</span>
                <span class="user-role-tag role-${(user.role || '').toLowerCase()}">${escapeHtml(user.role)}</span>
            </div>
            <a href="javascript:void(0)" onclick="logout()" class="nav-logout-btn">Logout</a>
        `;
    } else {
        nav.innerHTML = `
            <a href="${basePath}index.html">Home</a>
            <a href="${basePath}index.html#about">About</a>
            <a href="${basePath}index.html#how-it-works">How It Works</a>
            <a href="${basePath}login.html" class="nav-link-login">Login</a>
            <a href="${basePath}register.html" class="nav-btn-highlight">Register</a>
        `;
    }
}

/* =========================================================================
   MAIN DOM INITIALIZATION
   ========================================================================= */

document.addEventListener("DOMContentLoaded", () => {
    // Initial backend check and navbar sync
    checkBackendConnection(false);
    syncNavbarAuth();

    // Wire up any "Check Backend" buttons
    const checkBtns = document.querySelectorAll(".btn-check-backend, #btnCheckBackend");
    checkBtns.forEach(btn => {
        btn.addEventListener("click", (e) => {
            e.preventDefault();
            checkBackendConnection(true);
        });
    });

    /* =========================================================================
       LOGIN FORM HANDLER
       ========================================================================= */
    const loginForm = document.getElementById("loginForm");
    if (loginForm) {
        loginForm.addEventListener("submit", async function (event) {
            event.preventDefault();

            const email = document.getElementById("loginEmail").value.trim();
            const password = document.getElementById("loginPassword").value;
            const submitBtn = loginForm.querySelector("button[type='submit']");
            const originalBtnText = submitBtn ? submitBtn.textContent : "Sign In";

            if (!email || !password) {
                showNotification("Please enter both email and password.", "warning");
                return;
            }

            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = "Signing In...";
            }

            try {
                const baseUrl = await getWorkingBackendUrl();
                const response = await fetch(`${baseUrl}/api/auth/login`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Accept": "application/json"
                    },
                    body: JSON.stringify({ email, password })
                });

                const result = await response.json();

                if (response.ok && result.success) {
                    setCurrentUser(result.user);
                    showNotification(`Welcome back, ${result.user.name}! Signing in...`, "success");

                    setTimeout(() => {
                        const role = (result.user.role || "").toUpperCase();
                        if (role === "ADMIN") {
                            window.location.href = "admin/dashboard.html";
                        } else if (role === "VOLUNTEER") {
                            window.location.href = "volunteer/dashboard.html";
                        } else if (role === "NGO") {
                            window.location.href = "ngo/dashboard.html";
                        } else {
                            window.location.href = "donor/dashboard.html";
                        }
                    }, 800);
                } else {
                    showNotification(result.message || "Invalid credentials. Please try again.", "error");
                }
            } catch (error) {
                console.error("Login error:", error);
                showNotification(
                    "Could not connect to authentication server.\n" +
                    "Please ensure the backend is running (cd backend && node server.js).",
                    "error"
                );
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = originalBtnText;
                }
            }
        });
    }

    /* =========================================================================
       REGISTRATION FORM HANDLER
       ========================================================================= */
    const registerForm = document.getElementById("registerForm");
    if (registerForm) {
        registerForm.addEventListener("submit", async function (event) {
            event.preventDefault();

            const roleInput = registerForm.querySelector("input[name='regRole']:checked");
            const role = roleInput ? roleInput.value : "DONOR";
            const name = document.getElementById("regName").value.trim();
            const email = document.getElementById("regEmail").value.trim();
            const password = document.getElementById("regPassword").value;
            const confirmPassword = document.getElementById("regConfirmPassword").value;
            const phone = document.getElementById("regPhone") ? document.getElementById("regPhone").value.trim() : "";
            const city = document.getElementById("regCity") ? document.getElementById("regCity").value.trim() : "";
            const address = document.getElementById("regAddress") ? document.getElementById("regAddress").value.trim() : "";
            const orgName = document.getElementById("regOrgName") ? document.getElementById("regOrgName").value.trim() : "";

            if (!name || !email || !password || !role) {
                showNotification("Please fill in all required fields marked with *.", "warning");
                return;
            }

            if (password.length < 6) {
                showNotification("Password must be at least 6 characters long.", "warning");
                return;
            }

            if (password !== confirmPassword) {
                showNotification("Passwords do not match. Please verify.", "error");
                return;
            }

            const termsCheck = document.getElementById("termsCheck");
            if (termsCheck && !termsCheck.checked) {
                showNotification("Please agree to the guidelines to continue.", "warning");
                return;
            }

            const submitBtn = registerForm.querySelector("button[type='submit']");
            const originalBtnText = submitBtn ? submitBtn.textContent : "Create Account";

            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = "Creating Account...";
            }

            try {
                const baseUrl = await getWorkingBackendUrl();
                const response = await fetch(`${baseUrl}/api/auth/register`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Accept": "application/json"
                    },
                    body: JSON.stringify({
                        name,
                        email,
                        password,
                        role,
                        phone,
                        city,
                        address,
                        organizationName: orgName
                    })
                });

                const result = await response.json();

                if (response.ok && result.success) {
                    showNotification("Account created successfully! Logging you in...", "success");
                    setCurrentUser(result.user);

                    setTimeout(() => {
                        const normalizedRole = (role || "").toUpperCase();
                        if (normalizedRole === "ADMIN") {
                            window.location.href = "admin/dashboard.html";
                        } else if (normalizedRole === "VOLUNTEER") {
                            window.location.href = "volunteer/dashboard.html";
                        } else if (normalizedRole === "NGO") {
                            window.location.href = "ngo/dashboard.html";
                        } else {
                            window.location.href = "donor/dashboard.html";
                        }
                    }, 1000);
                } else {
                    showNotification(result.message || "Registration failed. Please check your inputs.", "error");
                }
            } catch (error) {
                console.error("Registration error:", error);
                showNotification(
                    "Could not connect to server.\n" +
                    "Please ensure the backend is running (cd backend && node server.js).",
                    "error"
                );
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = originalBtnText;
                }
            }
        });
    }

    /* =========================================================================
       ADD DONATION FORM HANDLER (DONOR)
       ========================================================================= */
    const donationForm = document.getElementById("donationForm");
    if (donationForm) {
        const user = getCurrentUser();
        const activeDonorId = (user && user.id) ? user.id : 2;

        const now = new Date();
        const nowIso = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
        const preparedAtInput = document.getElementById("preparedAt");
        const expiryAtInput = document.getElementById("expiryAt");

        if (preparedAtInput && !preparedAtInput.value) {
            preparedAtInput.value = nowIso;
        }
        if (expiryAtInput && !expiryAtInput.value) {
            const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000 - now.getTimezoneOffset() * 60000);
            expiryAtInput.value = tomorrow.toISOString().slice(0, 16);
            expiryAtInput.min = nowIso;
        }

        donationForm.addEventListener("submit", async function (event) {
            event.preventDefault();

            const submitBtn = donationForm.querySelector("button[type='submit']");
            const originalBtnText = submitBtn ? submitBtn.textContent : "Add Donation";

            const foodName = document.getElementById("foodName").value.trim();
            const foodType = document.getElementById("foodType").value;
            const quantity = Number(document.getElementById("quantity").value);
            const unit = document.getElementById("unit").value;
            const preparedAt = document.getElementById("preparedAt").value;
            const expiryAt = document.getElementById("expiryAt").value;
            const pickupLocation = document.getElementById("pickupLocation").value.trim();

            if (!foodName || !foodType || !quantity || !unit || !expiryAt || !pickupLocation) {
                showNotification("Please fill in all required fields.", "warning");
                return;
            }

            if (quantity <= 0) {
                showNotification("Quantity must be greater than 0.", "warning");
                return;
            }

            const donationData = {
                donorId: activeDonorId,
                foodName: foodName,
                foodType: foodType,
                quantity: quantity,
                unit: unit,
                preparedAt: preparedAt,
                expiryAt: expiryAt,
                pickupLocation: pickupLocation
            };

            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = "Submitting...";
            }

            try {
                const baseUrl = await getWorkingBackendUrl();
                const response = await fetch(`${baseUrl}/api/donations`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Accept": "application/json"
                    },
                    body: JSON.stringify(donationData)
                });

                const result = await response.json();

                if (response.ok && result.success) {
                    showNotification(
                        `Food donation added successfully!\nDonation ID: #${result.donationId}`,
                        "success"
                    );

                    donationForm.reset();
                    if (preparedAtInput) preparedAtInput.value = nowIso;
                    if (expiryAtInput) {
                        const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000 - now.getTimezoneOffset() * 60000);
                        expiryAtInput.value = tomorrow.toISOString().slice(0, 16);
                    }

                    checkBackendConnection(false);

                    setTimeout(() => {
                        if (confirm("Donation registered successfully! Would you like to view your dashboard?")) {
                            window.location.href = "dashboard.html";
                        }
                    }, 800);

                } else {
                    showNotification("Failed to add donation: " + (result.message || "Unknown error"), "error");
                }

            } catch (error) {
                console.error("Connection error:", error);
                showNotification(
                    "Could not connect to backend server.\n" +
                    `Error details: ${error.message}`,
                    "error"
                );
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = originalBtnText;
                }
            }
        });
    }

    /* =========================================================================
       FOOD REQUEST FORM HANDLER (NGO)
       ========================================================================= */
    const foodRequestForm = document.getElementById("foodRequestForm");
    if (foodRequestForm) {
        const user = getCurrentUser();
        const activeNgoId = (user && user.id) ? user.id : 4; // Default to Hope Foundation

        // Pre-fill from URL params if available
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get("foodName") && document.getElementById("reqFoodName")) {
            document.getElementById("reqFoodName").value = urlParams.get("foodName");
        }
        if (urlParams.get("foodType") && document.getElementById("reqFoodType")) {
            document.getElementById("reqFoodType").value = urlParams.get("foodType");
        }
        if (urlParams.get("quantity") && document.getElementById("reqQuantity")) {
            document.getElementById("reqQuantity").value = urlParams.get("quantity");
        }
        if (urlParams.get("unit") && document.getElementById("reqUnit")) {
            document.getElementById("reqUnit").value = urlParams.get("unit");
        }

        // Set default requiredBy datetime (tomorrow)
        const reqByInput = document.getElementById("reqRequiredBy");
        if (reqByInput && !reqByInput.value) {
            const now = new Date();
            const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000 - now.getTimezoneOffset() * 60000);
            reqByInput.value = tomorrow.toISOString().slice(0, 16);
            reqByInput.min = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
        }

        // Auto-fill delivery location from user profile if available
        const locInput = document.getElementById("reqDeliveryLocation");
        if (locInput && !locInput.value && user && (user.address || user.city)) {
            locInput.value = [user.address, user.city].filter(Boolean).join(", ");
        }

        foodRequestForm.addEventListener("submit", async function (event) {
            event.preventDefault();

            const submitBtn = foodRequestForm.querySelector("button[type='submit']");
            const originalBtnText = submitBtn ? submitBtn.textContent : "Submit Request";

            const foodName = document.getElementById("reqFoodName").value.trim();
            const foodType = document.getElementById("reqFoodType").value;
            const quantity = Number(document.getElementById("reqQuantity").value);
            const unit = document.getElementById("reqUnit").value;
            const requiredBy = document.getElementById("reqRequiredBy").value;
            const priority = document.getElementById("reqPriority").value;
            const deliveryLocation = document.getElementById("reqDeliveryLocation").value.trim();

            if (!foodName || !quantity || !unit || !requiredBy || !deliveryLocation) {
                showNotification("Please fill in all required fields marked with *.", "warning");
                return;
            }

            if (quantity <= 0) {
                showNotification("Quantity required must be greater than 0.", "warning");
                return;
            }

            const requestData = {
                ngoId: activeNgoId,
                foodName,
                foodType,
                quantityRequired: quantity,
                unit,
                requiredBy,
                priority,
                deliveryLocation
            };

            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = "Submitting Request...";
            }

            try {
                const baseUrl = await getWorkingBackendUrl();
                const response = await fetch(`${baseUrl}/api/requests`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Accept": "application/json"
                    },
                    body: JSON.stringify(requestData)
                });

                const result = await response.json();

                if (response.ok && result.success) {
                    showNotification(`Food request created successfully! Request ID: #${result.requestId}`, "success");
                    foodRequestForm.reset();

                    setTimeout(() => {
                        window.location.href = "my-requests.html";
                    }, 900);
                } else {
                    showNotification("Failed to create request: " + (result.message || "Unknown error"), "error");
                }
            } catch (error) {
                console.error("Food request error:", error);
                showNotification("Could not connect to backend server. Please verify backend is running.", "error");
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = originalBtnText;
                }
            }
        });
    }

    /* =========================================================================
       PAGE INITIALIZERS (ROLE-SPECIFIC DASHBOARDS & SHARED PAGES)
       ========================================================================= */
    const path = window.location.pathname.toLowerCase().replace(/\\/g, "/");
    const user = getCurrentUser();

    // 1. Volunteer Pages
    if (path.includes("/volunteer/") || document.getElementById("statTotalAssigned") || document.getElementById("deliveryCardsContainer")) {
        if (document.getElementById("statTotalAssigned")) {
            initVolunteerDashboard();
        }
        if (document.getElementById("deliveryCardsContainer")) {
            initVolunteerDeliveries();
        }
    }

    // 2. Admin Pages
    if (path.includes("/admin/") || document.getElementById("manualAllocationForm") || document.getElementById("kpiUsers") || document.getElementById("usersTableBody") || document.getElementById("adminDeliveryCards") || document.getElementById("historyTableBody")) {
        if (document.getElementById("manualAllocationForm")) {
            initAllocationStudio();
        }
        if (document.getElementById("kpiUsers")) {
            initAdminDashboard();
        }
        if (document.getElementById("usersTableBody")) {
            initAdminUsersPage();
        }
        if (document.getElementById("adminDeliveryCards")) {
            initAdminDeliveriesPage();
        }
        if (document.getElementById("historyTableBody")) {
            initHistoryPage();
        }
    }

    // 3. NGO Pages
    if (path.includes("/ngo/") || document.getElementById("ngoRecentTableBody") || document.getElementById("ngoRequestsTableBody") || document.getElementById("availableFoodGrid")) {
        const ngoId = (user && user.role === "NGO" && user.id) ? user.id : (user && user.id ? user.id : 4);
        const welcomeP = document.querySelector(".dashboard-header p");
        if (welcomeP && user && user.name) {
            welcomeP.textContent = `Welcome back, ${user.name}! (${user.role}) Manage food requests and allocations for your community.`;
        }

        if (document.getElementById("ngoRecentTableBody")) {
            loadNgoDashboardData(ngoId);
        }
        if (document.getElementById("ngoRequestsTableBody")) {
            loadNgoMyRequestsPage(ngoId);
        }
        if (document.getElementById("availableFoodGrid")) {
            loadAvailableFoodForNgo();
        }
    }

    // 4. Donor Pages
    if (path.includes("/donor/") || document.getElementById("myDonationsTable") || (document.getElementById("donorRecentTableBody") && !document.getElementById("ngoRecentTableBody"))) {
        const donorId = (user && user.role === "DONOR" && user.id) ? user.id : (user && user.id ? user.id : 2);
        const welcomeP = document.querySelector(".dashboard-header p");
        if (welcomeP && user && user.name) {
            welcomeP.textContent = `Welcome back, ${user.name}! (${user.role}) Manage your food donations here.`;
        }

        if (document.getElementById("myDonationsTable")) {
            loadMyDonationsPage(donorId);
        } else if (document.getElementById("donorRecentTableBody")) {
            loadDonorDashboardData(donorId);
        }
    }

    // 5. Shared Profile Page
    if (document.getElementById("profileForm")) {
        initProfilePage();
    }
});

/* =========================================================================
   MY DONATIONS PAGE LOGIC (DONOR)
   ========================================================================= */

let cachedDonorDonations = [];
let currentDonationFilter = "ALL";
let currentDonationSearch = "";

async function loadMyDonationsPage(donorId = 2) {
    const tableBody = document.getElementById("myDonationsTableBody");

    try {
        const baseUrl = await getWorkingBackendUrl();
        const response = await fetch(`${baseUrl}/api/donations/donor/${donorId}`);
        if (!response.ok) throw new Error("Failed to load donations");

        const data = await response.json();
        cachedDonorDonations = (data.success && Array.isArray(data.donations)) ? data.donations : [];

        const countAll = cachedDonorDonations.length;
        const countAvailable = cachedDonorDonations.filter(d => d.Status === "AVAILABLE").length;
        const countAllocated = cachedDonorDonations.filter(d => d.Status === "ALLOCATED").length;
        const countCompleted = cachedDonorDonations.filter(d => d.Status === "COMPLETED").length;
        const countWasted = cachedDonorDonations.filter(d => d.Status === "EXPIRED").length;
        const countCancelled = cachedDonorDonations.filter(d => d.Status === "CANCELLED").length;

        if (document.getElementById("countAll")) document.getElementById("countAll").textContent = countAll;
        if (document.getElementById("countAvailable")) document.getElementById("countAvailable").textContent = countAvailable;
        if (document.getElementById("countAllocated")) document.getElementById("countAllocated").textContent = countAllocated;
        if (document.getElementById("countCompleted")) document.getElementById("countCompleted").textContent = countCompleted;
        if (document.getElementById("countWasted")) document.getElementById("countWasted").textContent = countWasted;
        if (document.getElementById("countCancelled")) document.getElementById("countCancelled").textContent = countCancelled;

        renderMyDonationsTable();

    } catch (e) {
        console.error("Error loading donations:", e);
        if (tableBody) {
            tableBody.innerHTML = `<tr><td colspan="7" class="table-error">⚠️ Unable to load donations. Please ensure backend is running.</td></tr>`;
        }
    }
}

function renderMyDonationsTable() {
    const tableBody = document.getElementById("myDonationsTableBody");
    const emptyState = document.getElementById("emptyDonationsState");
    const tableElement = document.getElementById("myDonationsTable");
    if (!tableBody) return;

    let filtered = cachedDonorDonations;

    if (currentDonationFilter !== "ALL") {
        filtered = filtered.filter(d => (d.Status || "").toUpperCase() === currentDonationFilter);
    }

    if (currentDonationSearch.trim()) {
        const q = currentDonationSearch.toLowerCase().trim();
        filtered = filtered.filter(d => 
            (d.FoodName && d.FoodName.toLowerCase().includes(q)) ||
            (d.FoodType && d.FoodType.toLowerCase().includes(q)) ||
            (d.PickupLocation && d.PickupLocation.toLowerCase().includes(q)) ||
            String(d.DonationID).includes(q)
        );
    }

    if (filtered.length === 0) {
        tableBody.innerHTML = "";
        if (tableElement) tableElement.style.display = "none";
        if (emptyState) emptyState.style.display = "block";
        return;
    }

    if (tableElement) tableElement.style.display = "table";
    if (emptyState) emptyState.style.display = "none";
    tableBody.innerHTML = "";

    filtered.forEach(d => {
        const row = document.createElement("tr");
        const isExpired = (d.Status === "EXPIRED");
        const statusClass = isExpired ? "expired" : (d.Status || "available").toLowerCase();
        const displayStatus = isExpired ? "Wasted (Expired)" : d.Status;
        
        const prepDate = d.PreparedAt ? new Date(d.PreparedAt).toLocaleString([], {
            month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
        }) : "N/A";
        
        const expDate = d.ExpiryAt ? new Date(d.ExpiryAt).toLocaleString([], {
            month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
        }) : "N/A";

        const isAvailable = (d.Status === "AVAILABLE");

        row.innerHTML = `
            <td><strong>#${d.DonationID}</strong></td>
            <td>
                <strong>${escapeHtml(d.FoodName)}</strong>
                <div style="font-size:12px; color:#78909c;">${escapeHtml(d.FoodType || '')}</div>
            </td>
            <td><strong>${escapeHtml(d.Quantity)}</strong> <span style="font-size:12px; color:#64748b;">${escapeHtml(d.Unit)}</span></td>
            <td>
                <div style="font-size:12px;"><strong>Prep:</strong> ${prepDate}</div>
                <div style="font-size:12px; ${isExpired ? 'color:#be123c; font-weight:700;' : 'color:#d32f2f;'}">
                    <strong>Exp:</strong> ${expDate}
                </div>
            </td>
            <td><span style="font-size:13px;">${escapeHtml(d.PickupLocation)}</span></td>
            <td>
                <span class="status ${statusClass}">
                    ${escapeHtml(displayStatus)}
                </span>
                ${isExpired ? `<div style="font-size:11px; color:#be123c; margin-top:3px;">⚠️ Expired before delivery</div>` : ''}
            </td>
            <td>
                ${isAvailable ? `
                    <button type="button" class="btn-cancel-action" onclick="cancelDonation(${d.DonationID})" title="Cancel this donation">
                        Cancel
                    </button>
                ` : `<span style="font-size:12px; color:#94a3b8;">${isExpired ? 'Wasted' : 'No actions'}</span>`}
            </td>
        `;
        tableBody.appendChild(row);
    });
}

function filterDonations(status, btnEl) {
    currentDonationFilter = status;
    document.querySelectorAll(".filter-tab").forEach(tab => tab.classList.remove("active"));
    if (btnEl) btnEl.classList.add("active");
    renderMyDonationsTable();
}

function searchDonations(query) {
    currentDonationSearch = query;
    renderMyDonationsTable();
}

async function cancelDonation(donationId) {
    if (!confirm(`Are you sure you want to cancel Food Donation #${donationId}?`)) {
        return;
    }

    try {
        const baseUrl = await getWorkingBackendUrl();
        const response = await fetch(`${baseUrl}/api/donations/${donationId}/cancel`, {
            method: "PUT",
            headers: {
                "Accept": "application/json",
                "Content-Type": "application/json"
            }
        });

        const result = await response.json();

        if (response.ok && result.success) {
            showNotification(`Donation #${donationId} has been cancelled.`, "success");
            const user = getCurrentUser();
            const donorId = (user && user.id) ? user.id : 2;
            loadMyDonationsPage(donorId);
        } else {
            showNotification(result.message || "Failed to cancel donation.", "error");
        }
    } catch (e) {
        console.error("Cancel donation error:", e);
        showNotification("Failed to connect to backend to cancel donation.", "error");
    }
}

window.filterDonations = filterDonations;
window.searchDonations = searchDonations;
window.cancelDonation = cancelDonation;
window.loadMyDonationsPage = loadMyDonationsPage;

/* =========================================================================
   NGO DASHBOARD & REQUESTS LOGIC
   ========================================================================= */

let cachedNgoRequests = [];
let currentNgoRequestFilter = "ALL";
let currentNgoRequestSearch = "";

async function loadNgoDashboardData(ngoId = 4) {
    const tableBody = document.getElementById("ngoRecentTableBody");

    try {
        const baseUrl = await getWorkingBackendUrl();
        
        // 1. Load Stats
        const statsRes = await fetch(`${baseUrl}/api/ngo/dashboard/${ngoId}`);
        if (statsRes.ok) {
            const statsData = await statsRes.json();
            if (statsData.success && statsData.stats) {
                const s = statsData.stats;
                if (document.getElementById("ngoStatTotal")) document.getElementById("ngoStatTotal").textContent = s.totalRequests || 0;
                if (document.getElementById("ngoStatPending")) document.getElementById("ngoStatPending").textContent = s.pendingRequests || 0;
                if (document.getElementById("ngoStatAllocated")) document.getElementById("ngoStatAllocated").textContent = s.allocatedRequests || 0;
                if (document.getElementById("ngoStatFulfilled")) document.getElementById("ngoStatFulfilled").textContent = s.fulfilledRequests || 0;
            }
        }

        // 2. Load Available Surplus Batches count
        try {
            const availRes = await fetch(`${baseUrl}/api/donations/available`);
            if (availRes.ok) {
                const availData = await availRes.json();
                const surplusEl = document.getElementById("ngoStatAvailableSurplus");
                if (surplusEl) surplusEl.textContent = availData.count || 0;
            }
        } catch (err) {
            console.warn("Could not load available surplus count:", err);
        }

        // 2. Load Recent Requests
        const reqRes = await fetch(`${baseUrl}/api/requests/ngo/${ngoId}`);
        if (reqRes.ok) {
            const reqData = await reqRes.json();
            if (reqData.success && Array.isArray(reqData.requests) && tableBody) {
                if (reqData.requests.length === 0) {
                    tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#78909c; padding:30px;">No requests submitted yet. Click "+ Request Food" to get started.</td></tr>`;
                    return;
                }

                tableBody.innerHTML = "";
                reqData.requests.slice(0, 5).forEach(r => {
                    const row = document.createElement("tr");
                    const statusClass = (r.Status || "pending").toLowerCase();
                    const priorityClass = `priority-${(r.Priority || "medium").toLowerCase()}`;
                    const reqByDate = r.RequiredBy ? new Date(r.RequiredBy).toLocaleString([], {
                        month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
                    }) : "N/A";

                    row.innerHTML = `
                        <td><strong>${escapeHtml(r.FoodName)}</strong><br><small style="color:#78909c;">${escapeHtml(r.FoodType || '')}</small></td>
                        <td>${escapeHtml(r.QuantityRequired)} ${escapeHtml(r.Unit)}</td>
                        <td>${reqByDate}</td>
                        <td><span class="priority-badge ${priorityClass}">${escapeHtml(r.Priority)}</span></td>
                        <td><span style="font-size:13px;">${escapeHtml(r.DeliveryLocation)}</span></td>
                        <td><span class="status ${statusClass}">${escapeHtml(r.Status)}</span></td>
                    `;
                    tableBody.appendChild(row);
                });
            }
        }
    } catch (e) {
        console.error("NGO dashboard load error:", e);
        if (tableBody) {
            tableBody.innerHTML = `<tr><td colspan="6" class="table-error">⚠️ Could not load recent requests.</td></tr>`;
        }
    }
}

async function loadNgoMyRequestsPage(ngoId = 4) {
    const tableBody = document.getElementById("ngoRequestsTableBody");

    try {
        const baseUrl = await getWorkingBackendUrl();
        const response = await fetch(`${baseUrl}/api/requests/ngo/${ngoId}`);
        if (!response.ok) throw new Error("Failed to load NGO requests");

        const data = await response.json();
        cachedNgoRequests = (data.success && Array.isArray(data.requests)) ? data.requests : [];

        // Update counts
        const countAll = cachedNgoRequests.length;
        const countPending = cachedNgoRequests.filter(r => r.Status === "PENDING").length;
        const countAllocated = cachedNgoRequests.filter(r => r.Status === "ALLOCATED").length;
        const countFulfilled = cachedNgoRequests.filter(r => r.Status === "FULFILLED").length;
        const countCancelled = cachedNgoRequests.filter(r => r.Status === "CANCELLED").length;

        if (document.getElementById("countReqAll")) document.getElementById("countReqAll").textContent = countAll;
        if (document.getElementById("countReqPending")) document.getElementById("countReqPending").textContent = countPending;
        if (document.getElementById("countReqAllocated")) document.getElementById("countReqAllocated").textContent = countReqAllocated;
        if (document.getElementById("countReqFulfilled")) document.getElementById("countReqFulfilled").textContent = countReqFulfilled;
        if (document.getElementById("countReqCancelled")) document.getElementById("countReqCancelled").textContent = countReqCancelled;

        renderNgoRequestsTable();
    } catch (e) {
        console.error("Error loading NGO requests:", e);
        if (tableBody) {
            tableBody.innerHTML = `<tr><td colspan="8" class="table-error">⚠️ Failed to load requests. Please check backend.</td></tr>`;
        }
    }
}

function renderNgoRequestsTable() {
    const tableBody = document.getElementById("ngoRequestsTableBody");
    const emptyState = document.getElementById("emptyRequestsState");
    const tableElement = document.getElementById("ngoRequestsTable");
    if (!tableBody) return;

    let filtered = cachedNgoRequests;

    if (currentNgoRequestFilter !== "ALL") {
        filtered = filtered.filter(r => (r.Status || "").toUpperCase() === currentNgoRequestFilter);
    }

    if (currentNgoRequestSearch.trim()) {
        const q = currentNgoRequestSearch.toLowerCase().trim();
        filtered = filtered.filter(r => 
            (r.FoodName && r.FoodName.toLowerCase().includes(q)) ||
            (r.FoodType && r.FoodType.toLowerCase().includes(q)) ||
            (r.DeliveryLocation && r.DeliveryLocation.toLowerCase().includes(q)) ||
            String(r.RequestID).includes(q)
        );
    }

    if (filtered.length === 0) {
        tableBody.innerHTML = "";
        if (tableElement) tableElement.style.display = "none";
        if (emptyState) emptyState.style.display = "block";
        return;
    }

    if (tableElement) tableElement.style.display = "table";
    if (emptyState) emptyState.style.display = "none";
    tableBody.innerHTML = "";

    filtered.forEach(r => {
        const row = document.createElement("tr");
        const statusClass = (r.Status || "pending").toLowerCase();
        const priorityClass = `priority-${(r.Priority || "medium").toLowerCase()}`;
        const reqByDate = r.RequiredBy ? new Date(r.RequiredBy).toLocaleString([], {
            month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
        }) : "N/A";
        const isPending = (r.Status === "PENDING");

        row.innerHTML = `
            <td><strong>#${r.RequestID}</strong></td>
            <td>
                <strong>${escapeHtml(r.FoodName)}</strong>
                <div style="font-size:12px; color:#78909c;">${escapeHtml(r.FoodType || '')}</div>
            </td>
            <td><strong>${escapeHtml(r.QuantityRequired)}</strong> <span style="font-size:12px; color:#64748b;">${escapeHtml(r.Unit)}</span></td>
            <td>${reqByDate}</td>
            <td><span class="priority-badge ${priorityClass}">${escapeHtml(r.Priority)}</span></td>
            <td><span style="font-size:13px;">${escapeHtml(r.DeliveryLocation)}</span></td>
            <td><span class="status ${statusClass}">${escapeHtml(r.Status)}</span></td>
            <td>
                ${isPending ? `
                    <button type="button" class="btn-cancel-action" onclick="cancelNgoRequest(${r.RequestID})" title="Cancel this food request">
                        Cancel
                    </button>
                ` : `<span style="font-size:12px; color:#94a3b8;">No actions</span>`}
            </td>
        `;
        tableBody.appendChild(row);
    });
}

function filterNgoRequests(status, btnEl) {
    currentNgoRequestFilter = status;
    document.querySelectorAll(".filter-tab").forEach(tab => tab.classList.remove("active"));
    if (btnEl) btnEl.classList.add("active");
    renderNgoRequestsTable();
}

function searchNgoRequests(query) {
    currentNgoRequestSearch = query;
    renderNgoRequestsTable();
}

async function cancelNgoRequest(requestId) {
    if (!confirm(`Are you sure you want to cancel Food Request #${requestId}?`)) {
        return;
    }

    try {
        const baseUrl = await getWorkingBackendUrl();
        const response = await fetch(`${baseUrl}/api/requests/${requestId}/cancel`, {
            method: "PUT",
            headers: {
                "Accept": "application/json",
                "Content-Type": "application/json"
            }
        });

        const result = await response.json();

        if (response.ok && result.success) {
            showNotification(`Food Request #${requestId} has been cancelled.`, "success");
            const user = getCurrentUser();
            const ngoId = (user && user.id) ? user.id : 4;
            loadNgoMyRequestsPage(ngoId);
        } else {
            showNotification(result.message || "Failed to cancel request.", "error");
        }
    } catch (e) {
        console.error("Cancel request error:", e);
        showNotification("Failed to connect to backend to cancel request.", "error");
    }
}

window.filterNgoRequests = filterNgoRequests;
window.searchNgoRequests = searchNgoRequests;
window.cancelNgoRequest = cancelNgoRequest;
window.loadNgoDashboardData = loadNgoDashboardData;
window.loadNgoMyRequestsPage = loadNgoMyRequestsPage;

/* =========================================================================
   AVAILABLE FOOD BROWSER (NGO)
   ========================================================================= */

let cachedAvailableDonations = [];
let currentAvailableFoodSearch = "";

async function loadAvailableFoodForNgo() {
    const grid = document.getElementById("availableFoodGrid");
    const countLabel = document.getElementById("availableFoodCountLabel");

    try {
        const baseUrl = await getWorkingBackendUrl();
        const response = await fetch(`${baseUrl}/api/donations/available`);
        if (!response.ok) throw new Error("Failed to load available food");

        const data = await response.json();
        cachedAvailableDonations = (data.success && Array.isArray(data.donations)) ? data.donations : [];

        if (countLabel) {
            countLabel.textContent = `${cachedAvailableDonations.length} items available right now`;
        }

        renderAvailableFoodGrid();
    } catch (e) {
        console.error("Error loading available food:", e);
        if (grid) {
            grid.innerHTML = `<div class="table-error" style="grid-column: 1/-1;">⚠️ Failed to load available donations. Please verify backend server.</div>`;
        }
    }
}

function renderAvailableFoodGrid() {
    const grid = document.getElementById("availableFoodGrid");
    const emptyState = document.getElementById("emptyAvailableFoodState");
    if (!grid) return;

    let filtered = cachedAvailableDonations;

    if (currentAvailableFoodSearch.trim()) {
        const q = currentAvailableFoodSearch.toLowerCase().trim();
        filtered = filtered.filter(d => 
            (d.FoodName && d.FoodName.toLowerCase().includes(q)) ||
            (d.FoodType && d.FoodType.toLowerCase().includes(q)) ||
            (d.PickupLocation && d.PickupLocation.toLowerCase().includes(q))
        );
    }

    if (filtered.length === 0) {
        grid.innerHTML = "";
        grid.style.display = "none";
        if (emptyState) emptyState.style.display = "block";
        return;
    }

    grid.style.display = "grid";
    if (emptyState) emptyState.style.display = "none";
    grid.innerHTML = "";

    filtered.forEach(d => {
        const card = document.createElement("div");
        card.className = "food-surplus-card";

        const expiryDate = new Date(d.ExpiryAt).toLocaleString([], {
            month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
        });

        const prepDate = d.PreparedAt ? new Date(d.PreparedAt).toLocaleString([], {
            month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
        }) : "Recently";

        // Query string for pre-filling create-request.html
        const claimQuery = `foodName=${encodeURIComponent(d.FoodName)}&foodType=${encodeURIComponent(d.FoodType || 'Prepared Food')}&quantity=${encodeURIComponent(d.Quantity)}&unit=${encodeURIComponent(d.Unit)}`;

        card.innerHTML = `
            <div class="card-header-surplus">
                <span class="food-category-pill">${escapeHtml(d.FoodType || 'Food')}</span>
                <span class="status available">Available</span>
            </div>

            <div class="card-body-surplus">
                <h3 class="food-title">${escapeHtml(d.FoodName)}</h3>
                <div class="food-quantity-highlight">
                    🍱 <strong>${escapeHtml(d.Quantity)} ${escapeHtml(d.Unit)}</strong>
                </div>

                <div class="food-details-list">
                    <div class="detail-row">
                        <span class="detail-label">🕒 Prepared:</span>
                        <span class="detail-value">${prepDate}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">⏳ Expiry:</span>
                        <span class="detail-value expire-warning">${expiryDate}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">📍 Pickup:</span>
                        <span class="detail-value">${escapeHtml(d.PickupLocation)}</span>
                    </div>
                </div>
            </div>

            <div class="card-footer-surplus">
                <a href="create-request.html?${claimQuery}" class="primary-button text-decoration-none display-inline-block btn-claim-food">
                    Request This Food →
                </a>
            </div>
        `;
        grid.appendChild(card);
    });
}

function searchAvailableFood(query) {
    currentAvailableFoodSearch = query;
    renderAvailableFoodGrid();
}

window.loadAvailableFoodForNgo = loadAvailableFoodForNgo;
window.searchAvailableFood = searchAvailableFood;

async function loadDonorDashboardData(donorId = 2) {
    const tableBody = document.getElementById("donorRecentTableBody") || document.querySelector(".table-container tbody");

    try {
        const baseUrl = await getWorkingBackendUrl();
        const response = await fetch(`${baseUrl}/api/donations/donor/${donorId}`);
        if (!response.ok) return;

        const data = await response.json();
        if (!data.success || !Array.isArray(data.donations)) return;

        const donations = data.donations;

        const total = donations.length;
        const available = donations.filter(d => d.Status === "AVAILABLE").length;
        const allocated = donations.filter(d => d.Status === "ALLOCATED").length;
        const completed = donations.filter(d => d.Status === "COMPLETED").length;
        const wasted = donations.filter(d => d.Status === "EXPIRED").length;

        const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
        setVal("donorStatTotal", total);
        setVal("donorStatAvailable", available);
        setVal("donorStatAllocated", allocated);
        setVal("donorStatCompleted", completed);
        setVal("donorStatWasted", wasted);

        if (tableBody) {
            if (donations.length === 0) {
                tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#64748b; padding:30px;">No food donations recorded yet. Click "+ Add Donation" above to share surplus!</td></tr>`;
                return;
            }

            tableBody.innerHTML = "";
            donations.slice(0, 8).forEach(d => {
                const row = document.createElement("tr");
                const isExpired = (d.Status === "EXPIRED");
                const statusClass = isExpired ? "expired" : (d.Status || "available").toLowerCase();
                const displayStatus = isExpired ? "Wasted (Expired)" : d.Status;

                const expiryDate = new Date(d.ExpiryAt).toLocaleString([], {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit"
                });

                row.innerHTML = `
                    <td><strong>${escapeHtml(d.FoodName)}</strong></td>
                    <td><strong>${escapeHtml(d.Quantity)}</strong> <span style="font-size:12px; color:#64748b;">${escapeHtml(d.Unit)}</span></td>
                    <td><span class="food-category-pill">${escapeHtml(d.FoodType || 'General')}</span></td>
                    <td>
                        <div style="font-size:12px; ${isExpired ? 'color:#be123c; font-weight:700;' : ''}">
                            ${isExpired ? '⚠️ Expired: ' : '⏳ '}${expiryDate}
                        </div>
                    </td>
                    <td><span style="font-size:13px;">${escapeHtml(d.PickupLocation)}</span></td>
                    <td>
                        <span class="status ${statusClass}">
                            ${escapeHtml(displayStatus)}
                        </span>
                    </td>
                `;
                tableBody.appendChild(row);
            });
        }
    } catch (e) {
        console.warn("Could not load donor dashboard data:", e);
    }
}

async function triggerManualExpiryCheck() {
    try {
        const baseUrl = await getWorkingBackendUrl();
        const res = await fetch(`${baseUrl}/api/donations/check-expiry`, { method: "POST" });
        const result = await res.json();
        if (res.ok && result.success) {
            const s = result.stats;
            showNotification(`⏱️ Food expiration check: ${s.totalWasted} total expired items marked as wasted (${s.expiredAvailable} before allocation, ${s.expiredInTransit} before delivery).`, "info");
            const user = getCurrentUser();
            const donorId = (user && user.role === "DONOR" && user.id) ? user.id : 2;
            loadDonorDashboardData(donorId);
        } else {
            showNotification(result.message || "Failed to check expiration.", "error");
        }
    } catch (e) {
        console.error("Manual expiry check error:", e);
        showNotification("Could not connect to backend server.", "error");
    }
}

window.triggerManualExpiryCheck = triggerManualExpiryCheck;

function escapeHtml(str) {
    if (!str) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

/* =========================================================================
   PHASE D — ALLOCATION STUDIO PAGE LOGIC
   ========================================================================= */

let cachedAllocations = [];
let currentAllocFilter = "ALL";
let currentAllocSearch = "";

/** Initialize the full Allocation Studio page */
async function initAllocationStudio() {
    await Promise.all([
        loadAllocationStats(),
        loadAllocationDropdowns(),
        loadSmartSuggestions(),
        loadAllocationsTable()
    ]);
}

/** Fetch and display allocation stats in header cards */
async function loadAllocationStats() {
    try {
        const baseUrl = await getWorkingBackendUrl();
        const res = await fetch(`${baseUrl}/api/allocations/stats`);
        if (!res.ok) return;
        const data = await res.json();
        if (!data.success) return;

        const s = data.stats;
        const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val || 0; };
        set("statTotalAlloc", s.totalAllocations);
        set("statPendingPickup", s.pendingPickup);
        set("statInTransit", s.inTransit);
        set("statCompletedAlloc", s.completed);
    } catch (e) {
        console.warn("Could not load allocation stats:", e);
    }
}

/** Populate the Donation and Request dropdowns in the manual form */
async function loadAllocationDropdowns() {
    const donSelect = document.getElementById("allocDonationSelect");
    const reqSelect = document.getElementById("allocRequestSelect");
    if (!donSelect || !reqSelect) return;

    try {
        const baseUrl = await getWorkingBackendUrl();

        // Load available donations
        const donRes = await fetch(`${baseUrl}/api/donations/available`);
        if (donRes.ok) {
            const donData = await donRes.json();
            donSelect.innerHTML = '<option value="">-- Choose Available Donation --</option>';
            (donData.donations || []).forEach(d => {
                const exp = d.ExpiryAt ? new Date(d.ExpiryAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
                const opt = document.createElement("option");
                opt.value = d.DonationID;
                opt.textContent = `#${d.DonationID} — ${d.FoodName} (${d.Quantity} ${d.Unit}) | Exp: ${exp}`;
                opt.dataset.qty = d.Quantity;
                opt.dataset.unit = d.Unit;
                opt.dataset.foodName = d.FoodName;
                opt.dataset.foodType = d.FoodType || "";
                donSelect.appendChild(opt);
            });
        }

        // Load pending requests
        const reqRes = await fetch(`${baseUrl}/api/requests/pending`);
        if (reqRes.ok) {
            const reqData = await reqRes.json();
            reqSelect.innerHTML = '<option value="">-- Choose Pending Request --</option>';
            (reqData.requests || []).forEach(r => {
                const req = r.RequiredBy ? new Date(r.RequiredBy).toLocaleString([], { month: "short", day: "numeric" }) : "";
                const opt = document.createElement("option");
                opt.value = r.RequestID;
                opt.textContent = `#${r.RequestID} — ${r.FoodName} (${r.QuantityRequired} ${r.Unit}) | ${r.Priority} | ${r.NGOOrg || r.NGOName || ""} | By: ${req}`;
                opt.dataset.qty = r.QuantityRequired;
                opt.dataset.unit = r.Unit;
                opt.dataset.priority = r.Priority;
                reqSelect.appendChild(opt);
            });
        }
    } catch (e) {
        console.warn("Could not load allocation dropdowns:", e);
        donSelect.innerHTML = '<option value="">⚠️ Could not load donations</option>';
        reqSelect.innerHTML = '<option value="">⚠️ Could not load requests</option>';
    }
}

function onDonationSelectChanged() {
    const sel = document.getElementById("allocDonationSelect");
    const help = document.getElementById("donationHelpText");
    const qtyInput = document.getElementById("allocQuantity");
    const unitDisplay = document.getElementById("allocUnitDisplay");

    if (sel && sel.value && sel.selectedIndex > 0) {
        const opt = sel.options[sel.selectedIndex];
        const qty = opt.dataset.qty;
        const unit = opt.dataset.unit || "units";
        if (help) help.textContent = `Available: ${qty} ${unit}`;
        if (qtyInput) {
            qtyInput.max = qty;
            qtyInput.placeholder = `Max: ${qty}`;
            if (!qtyInput.value) qtyInput.value = qty;
        }
        if (unitDisplay) unitDisplay.value = unit;
    } else {
        if (help) help.textContent = "";
    }
}

function onRequestSelectChanged() {
    const sel = document.getElementById("allocRequestSelect");
    const help = document.getElementById("requestHelpText");
    const qtyInput = document.getElementById("allocQuantity");
    const unitDisplay = document.getElementById("allocUnitDisplay");

    if (sel && sel.value && sel.selectedIndex > 0) {
        const opt = sel.options[sel.selectedIndex];
        const qty = opt.dataset.qty;
        const unit = opt.dataset.unit || "units";
        const priority = opt.dataset.priority;
        if (help) {
            help.textContent = `Required: ${qty} ${unit} | Priority: ${priority}`;
        }
        if (qtyInput && !qtyInput.value) qtyInput.value = qty;
        if (unitDisplay) unitDisplay.value = unit;
    } else {
        if (help) help.textContent = "";
    }
}

/** Handle manual allocation form submit */
async function handleManualAllocation(event) {
    event.preventDefault();
    const donationId = document.getElementById("allocDonationSelect").value;
    const requestId = document.getElementById("allocRequestSelect").value;
    const quantity = Number(document.getElementById("allocQuantity").value);
    const submitBtn = document.querySelector("#manualAllocationForm button[type='submit']");
    const origText = submitBtn ? submitBtn.textContent : "Confirm & Allocate Food";

    if (!donationId || !requestId || !quantity || quantity <= 0) {
        showNotification("Please select a donation, a request, and enter a valid quantity.", "warning");
        return;
    }

    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Allocating..."; }

    try {
        const baseUrl = await getWorkingBackendUrl();
        const response = await fetch(`${baseUrl}/api/allocations`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Accept": "application/json" },
            body: JSON.stringify({ donationId: Number(donationId), requestId: Number(requestId), allocatedQuantity: quantity })
        });

        const result = await response.json();

        if (response.ok && result.success) {
            showNotification(`✅ Allocation #${result.allocationId} created! ${result.allocatedQuantity} ${result.unit} matched.`, "success");

            // Reset form and reload everything
            document.getElementById("allocDonationSelect").value = "";
            document.getElementById("allocRequestSelect").value = "";
            document.getElementById("allocQuantity").value = "";
            document.getElementById("allocUnitDisplay").value = "units";
            document.getElementById("donationHelpText").textContent = "";
            document.getElementById("requestHelpText").textContent = "";

            await initAllocationStudio();
        } else {
            showNotification(result.message || "Allocation failed. Please check inputs.", "error");
        }
    } catch (e) {
        console.error("Manual allocation error:", e);
        showNotification("Could not connect to backend to create allocation.", "error");
    } finally {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = origText; }
    }
}

/** Trigger auto-match engine */
async function triggerAutoMatch() {
    const btn = document.getElementById("btnAutoMatch");
    const origText = btn ? btn.textContent : "⚡ Run Auto-Match Engine";
    if (btn) { btn.disabled = true; btn.textContent = "⚡ Running Auto-Match..."; }

    try {
        const baseUrl = await getWorkingBackendUrl();
        const response = await fetch(`${baseUrl}/api/allocations/auto-match`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Accept": "application/json" }
        });

        const result = await response.json();

        if (response.ok && result.success) {
            if (result.matchedCount > 0) {
                showNotification(`⚡ Auto-Match Complete! ${result.matchedCount} food donation(s) matched and allocated.`, "success");
                await initAllocationStudio();
            } else {
                showNotification(`Auto-Match ran successfully but no compatible pairs found right now.\n${result.message}`, "info");
            }
        } else {
            showNotification(result.message || "Auto-match failed.", "error");
        }
    } catch (e) {
        console.error("Auto-match error:", e);
        showNotification("Could not connect to backend for auto-match.", "error");
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = origText; }
    }
}

/** Load smart match suggestions and render them */
async function loadSmartSuggestions() {
    const container = document.getElementById("suggestionsList");
    if (!container) return;

    try {
        const baseUrl = await getWorkingBackendUrl();
        const res = await fetch(`${baseUrl}/api/allocations/suggestions`);
        if (!res.ok) throw new Error("Failed to load suggestions");
        const data = await res.json();

        if (!data.success || !data.suggestions || data.suggestions.length === 0) {
            container.innerHTML = `
                <div class="empty-state" style="padding:30px 15px;">
                    <div class="empty-icon">🤝</div>
                    <p>No suggestions available. Add available food donations and pending requests to see smart matches.</p>
                </div>`;
            return;
        }

        container.innerHTML = "";
        const top = data.suggestions.slice(0, 5);

        top.forEach(s => {
            const d = s.donation;
            const r = s.request;
            const scoreColor = s.matchScore >= 75 ? "#15803d" : s.matchScore >= 50 ? "#b45309" : "#64748b";
            const scoreLabel = s.matchScore >= 75 ? "Excellent Match" : s.matchScore >= 50 ? "Good Match" : "Possible Match";

            const card = document.createElement("div");
            card.className = "suggestion-card";
            card.innerHTML = `
                <div class="suggestion-score" style="background:${scoreColor};">
                    <span class="score-number">${s.matchScore}%</span>
                    <span class="score-label">${scoreLabel}</span>
                </div>
                <div class="suggestion-body">
                    <div class="suggestion-row">
                        <span class="sug-label">🍱 Donation:</span>
                        <span><strong>${escapeHtml(d.FoodName)}</strong> (${escapeHtml(d.FoodType)}) — ${escapeHtml(d.Quantity)} ${escapeHtml(d.Unit)}<br><small style="color:#64748b;">📍 ${escapeHtml(d.PickupLocation)}</small></span>
                    </div>
                    <div class="suggestion-row">
                        <span class="sug-label">🤝 Request:</span>
                        <span><strong>${escapeHtml(r.FoodName)}</strong> — ${escapeHtml(r.QuantityRequired)} ${escapeHtml(r.Unit)}<br><small style="color:#64748b;">🏥 ${escapeHtml(r.NGOOrg || r.NGOName)}</small></span>
                    </div>
                    <div class="suggestion-reasons">
                        ${s.reasons.map(reason => `<span class="reason-chip">✓ ${escapeHtml(reason)}</span>`).join("")}
                    </div>
                </div>
                <button type="button" class="btn-apply-suggestion" 
                    onclick="applySuggestion(${d.DonationID}, ${r.RequestID}, ${s.suggestedQuantity}, '${escapeHtml(d.Unit)}')">
                    Apply →
                </button>
            `;
            container.appendChild(card);
        });
    } catch (e) {
        console.error("Smart suggestions error:", e);
        if (container) {
            container.innerHTML = `<p class="table-error">⚠️ Could not load suggestions.</p>`;
        }
    }
}

/** Click "Apply →" on a suggestion: pre-fills the manual form */
function applySuggestion(donationId, requestId, qty, unit) {
    const donSel = document.getElementById("allocDonationSelect");
    const reqSel = document.getElementById("allocRequestSelect");
    const qtyInput = document.getElementById("allocQuantity");
    const unitDisplay = document.getElementById("allocUnitDisplay");

    if (donSel) donSel.value = donationId;
    if (reqSel) reqSel.value = requestId;
    if (qtyInput) qtyInput.value = qty;
    if (unitDisplay) unitDisplay.value = unit;

    onDonationSelectChanged();
    onRequestSelectChanged();

    // Scroll to the form
    const form = document.getElementById("manualAllocationForm");
    if (form) form.scrollIntoView({ behavior: "smooth", block: "center" });

    showNotification(`Suggestion applied! Review the details and click "Confirm & Allocate Food".`, "info");
}

/** Load all allocations into the history table */
async function loadAllocationsTable() {
    const tableBody = document.getElementById("allocationsTableBody");
    if (!tableBody) return;

    try {
        const baseUrl = await getWorkingBackendUrl();
        const res = await fetch(`${baseUrl}/api/allocations`);
        if (!res.ok) throw new Error("Failed to load allocations");
        const data = await res.json();

        cachedAllocations = (data.success && Array.isArray(data.allocations)) ? data.allocations : [];

        // Update filter counts
        const total = cachedAllocations.length;
        const pending = cachedAllocations.filter(a => a.Status === "ALLOCATED").length;
        const transit = cachedAllocations.filter(a => a.Status === "PICKED_UP").length;
        const completed = cachedAllocations.filter(a => ["DELIVERED", "COMPLETED"].includes(a.Status)).length;
        const cancelled = cachedAllocations.filter(a => a.Status === "CANCELLED").length;

        const s = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
        s("countAllocAll", total);
        s("countAllocPending", pending);
        s("countAllocTransit", transit);
        s("countAllocCompleted", completed);
        s("countAllocCancelled", cancelled);

        renderAllocationsTable();
    } catch (e) {
        console.error("Allocations table error:", e);
        if (tableBody) {
            tableBody.innerHTML = `<tr><td colspan="9" class="table-error">⚠️ Could not load allocations. Check backend.</td></tr>`;
        }
    }
}

function renderAllocationsTable() {
    const tableBody = document.getElementById("allocationsTableBody");
    const emptyState = document.getElementById("emptyAllocationsState");
    const tableEl = document.getElementById("allocationsTable");
    if (!tableBody) return;

    let filtered = cachedAllocations;

    if (currentAllocFilter !== "ALL") {
        if (currentAllocFilter === "COMPLETED") {
            filtered = filtered.filter(a => ["DELIVERED", "COMPLETED"].includes(a.Status));
        } else {
            filtered = filtered.filter(a => a.Status === currentAllocFilter);
        }
    }

    if (currentAllocSearch.trim()) {
        const q = currentAllocSearch.toLowerCase().trim();
        filtered = filtered.filter(a =>
            (a.FoodName && a.FoodName.toLowerCase().includes(q)) ||
            (a.DonorOrg && a.DonorOrg.toLowerCase().includes(q)) ||
            (a.DonorName && a.DonorName.toLowerCase().includes(q)) ||
            (a.NGOOrg && a.NGOOrg.toLowerCase().includes(q)) ||
            (a.NGOName && a.NGOName.toLowerCase().includes(q)) ||
            String(a.AllocationID).includes(q)
        );
    }

    if (filtered.length === 0) {
        tableBody.innerHTML = "";
        if (tableEl) tableEl.style.display = "none";
        if (emptyState) emptyState.style.display = "block";
        return;
    }

    if (tableEl) tableEl.style.display = "table";
    if (emptyState) emptyState.style.display = "none";
    tableBody.innerHTML = "";

    filtered.forEach(a => {
        const row = document.createElement("tr");
        const statusClass = (a.Status || "allocated").toLowerCase().replace("_", "-");
        const allocDate = a.AllocationDate ? new Date(a.AllocationDate).toLocaleString([], {
            month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
        }) : "N/A";
        const priorityClass = `priority-${(a.Priority || "medium").toLowerCase()}`;
        const canCancel = a.Status === "ALLOCATED";

        row.innerHTML = `
            <td><strong>#${a.AllocationID}</strong></td>
            <td>
                <strong>${escapeHtml(a.FoodName)}</strong>
                <div style="font-size:12px;color:#78909c;">${escapeHtml(a.FoodType || "")}</div>
            </td>
            <td><strong>${escapeHtml(a.AllocatedQuantity)}</strong> <span style="font-size:12px;color:#64748b;">${escapeHtml(a.Unit)}</span></td>
            <td>
                <div style="font-size:13px;">${escapeHtml(a.DonorOrg || a.DonorName || "")}</div>
                <div style="font-size:11px;color:#64748b;">📍 ${escapeHtml(a.PickupLocation || "")}</div>
            </td>
            <td>
                <div style="font-size:13px;">${escapeHtml(a.NGOOrg || a.NGOName || "")}</div>
                <div style="font-size:11px;color:#64748b;">📦 ${escapeHtml(a.DeliveryLocation || "")}</div>
            </td>
            <td><span class="priority-badge ${priorityClass}">${escapeHtml(a.Priority || "—")}</span></td>
            <td style="font-size:12px;">${allocDate}</td>
            <td><span class="status ${statusClass}">${escapeHtml(a.Status)}</span></td>
            <td>
                ${canCancel ? `
                    <button type="button" class="btn-cancel-action" onclick="cancelAllocation(${a.AllocationID})" title="Cancel allocation">
                        Cancel
                    </button>
                ` : `<span style="font-size:12px;color:#94a3b8;">—</span>`}
            </td>
        `;
        tableBody.appendChild(row);
    });
}

function filterAllocations(status, btnEl) {
    currentAllocFilter = status;
    document.querySelectorAll(".filter-tab").forEach(t => t.classList.remove("active"));
    if (btnEl) btnEl.classList.add("active");
    renderAllocationsTable();
}

function searchAllocations(query) {
    currentAllocSearch = query;
    renderAllocationsTable();
}

async function cancelAllocation(allocId) {
    if (!confirm(`Are you sure you want to cancel Allocation #${allocId}?\n\nThis will restore the donation and request to their available state.`)) return;

    try {
        const baseUrl = await getWorkingBackendUrl();
        const res = await fetch(`${baseUrl}/api/allocations/${allocId}/cancel`, {
            method: "PUT",
            headers: { "Accept": "application/json", "Content-Type": "application/json" }
        });
        const result = await res.json();

        if (res.ok && result.success) {
            showNotification(`Allocation #${allocId} cancelled. Donation and request restored.`, "success");
            await initAllocationStudio();
        } else {
            showNotification(result.message || "Failed to cancel allocation.", "error");
        }
    } catch (e) {
        console.error("Cancel allocation error:", e);
        showNotification("Could not connect to backend to cancel allocation.", "error");
    }
}

// Expose Phase D functions globally
window.filterAllocations = filterAllocations;
window.searchAllocations = searchAllocations;
window.cancelAllocation = cancelAllocation;
window.triggerAutoMatch = triggerAutoMatch;
window.handleManualAllocation = handleManualAllocation;
window.applySuggestion = applySuggestion;
window.onDonationSelectChanged = onDonationSelectChanged;
window.onRequestSelectChanged = onRequestSelectChanged;
window.initAllocationStudio = initAllocationStudio;

/* =========================================================================
   PHASE E — VOLUNTEER / PICKUP & DELIVERY MODULE
   ========================================================================= */

let cachedVolDeliveries = [];
let currentVolFilter = "ALL";

/** Initialize the Volunteer Dashboard page */
async function initVolunteerDashboard() {
    const user = getCurrentUser();
    const volunteerId = (user && user.role === "VOLUNTEER" && user.id) ? user.id : (user && user.id ? user.id : 6);

    // Update welcome message
    const welcome = document.getElementById("volunteerWelcomeMsg");
    if (welcome) {
        if (user && user.name) {
            welcome.textContent = `Welcome back, ${user.name}! (${user.role}) Here are your assigned pickups and deliveries.`;
        } else {
            welcome.textContent = "Welcome, Volunteer (Demo mode)! Here are active pickups and deliveries.";
        }
    }

    await Promise.all([
        loadVolunteerStats(volunteerId),
        loadActiveDeliveryCards(volunteerId),
        loadAvailablePickups(volunteerId)
    ]);
}

/** Initialize the My Deliveries full-page view */
async function initVolunteerDeliveries() {
    const user = getCurrentUser();
    const volunteerId = (user && user.role === "VOLUNTEER" && user.id) ? user.id : (user && user.id ? user.id : 6);

    await Promise.all([
        loadAllVolDeliveries(volunteerId),
        loadAvailablePickups(volunteerId)
    ]);
}

/** Load and display volunteer stats into the dashboard header cards */
async function loadVolunteerStats(volunteerId) {
    try {
        const baseUrl = await getWorkingBackendUrl();
        const res = await fetch(`${baseUrl}/api/volunteer/stats/${volunteerId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!data.success) return;

        const s = data.stats;
        const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
        set("statTotalAssigned", s.totalAssigned);
        set("statPendingPickup", s.pendingPickup);
        set("statInTransit", s.inTransit);
        set("statDelivered", s.delivered);
    } catch (e) {
        console.warn("Could not load volunteer stats:", e);
    }
}

/** Load active (non-delivered) deliveries and render cards on dashboard */
async function loadActiveDeliveryCards(volunteerId) {
    const loadingEl = document.getElementById("activeDeliveriesLoading");
    const cardsEl = document.getElementById("activeDeliveryCards");
    const emptyEl = document.getElementById("noActiveDeliveries");

    try {
        const baseUrl = await getWorkingBackendUrl();
        const res = await fetch(`${baseUrl}/api/volunteer/deliveries/${volunteerId}`);
        if (!res.ok) throw new Error("Failed to load deliveries");
        const data = await res.json();

        if (loadingEl) loadingEl.style.display = "none";

        const active = (data.deliveries || []).filter(d => !["DELIVERED", "CANCELLED"].includes(d.DeliveryStatus));

        if (active.length === 0) {
            if (emptyEl) emptyEl.style.display = "block";
            if (cardsEl) cardsEl.style.display = "none";
            return;
        }

        if (emptyEl) emptyEl.style.display = "none";
        if (cardsEl) {
            cardsEl.style.display = "grid";
            cardsEl.innerHTML = "";
            // Show max 4 on dashboard
            active.slice(0, 4).forEach(d => {
                cardsEl.appendChild(buildDeliveryCard(d, true));
            });
        }
    } catch (e) {
        console.error("Load active delivery cards error:", e);
        if (loadingEl) loadingEl.style.display = "none";
        if (emptyEl) {
            emptyEl.style.display = "block";
            const p = emptyEl.querySelector("p");
            if (p) p.textContent = "Could not load deliveries. Make sure the backend is running.";
        }
    }
}

/** Load ALL deliveries for the My Deliveries page */
async function loadAllVolDeliveries(volunteerId) {
    const loadingEl = document.getElementById("deliveriesLoading");
    const cardsEl = document.getElementById("deliveryCardsContainer");
    const emptyEl = document.getElementById("emptyDeliveries");

    try {
        const baseUrl = await getWorkingBackendUrl();
        const res = await fetch(`${baseUrl}/api/volunteer/deliveries/${volunteerId}`);
        if (!res.ok) throw new Error("Failed to load deliveries");
        const data = await res.json();

        cachedVolDeliveries = data.deliveries || [];

        if (loadingEl) loadingEl.style.display = "none";

        // Update tab counts
        updateVolTabCounts();
        renderVolDeliveries();
    } catch (e) {
        console.error("Load all deliveries error:", e);
        if (loadingEl) loadingEl.style.display = "none";
        if (emptyEl) {
            emptyEl.style.display = "block";
            const title = document.getElementById("emptyDeliveriesTitle");
            const msg = document.getElementById("emptyDeliveriesMsg");
            if (title) title.textContent = "Connection Error";
            if (msg) msg.textContent = "Could not load deliveries. Check that the backend server is running.";
        }
    }
}

function updateVolTabCounts() {
    const all = cachedVolDeliveries.length;
    const assigned = cachedVolDeliveries.filter(d => d.DeliveryStatus === "ASSIGNED").length;
    const pickedUp = cachedVolDeliveries.filter(d => ["PICKED_UP", "IN_TRANSIT"].includes(d.DeliveryStatus)).length;
    const delivered = cachedVolDeliveries.filter(d => d.DeliveryStatus === "DELIVERED").length;
    const cancelled = cachedVolDeliveries.filter(d => d.DeliveryStatus === "CANCELLED").length;

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set("cntAll", all);
    set("cntAssigned", assigned);
    set("cntPickedUp", pickedUp);
    set("cntDelivered", delivered);
    set("cntCancelled", cancelled);
}

function filterVolDeliveries(status, btnEl) {
    currentVolFilter = status;
    document.querySelectorAll(".filter-tab").forEach(t => t.classList.remove("active"));
    if (btnEl) btnEl.classList.add("active");
    renderVolDeliveries();
}

function renderVolDeliveries() {
    const cardsEl = document.getElementById("deliveryCardsContainer");
    const emptyEl = document.getElementById("emptyDeliveries");
    const emptyTitle = document.getElementById("emptyDeliveriesTitle");
    const emptyMsg = document.getElementById("emptyDeliveriesMsg");

    if (!cardsEl) return;

    let filtered = cachedVolDeliveries;

    if (currentVolFilter !== "ALL") {
        if (currentVolFilter === "PICKED_UP") {
            filtered = filtered.filter(d => ["PICKED_UP", "IN_TRANSIT"].includes(d.DeliveryStatus));
        } else {
            filtered = filtered.filter(d => d.DeliveryStatus === currentVolFilter);
        }
    }

    if (filtered.length === 0) {
        cardsEl.style.display = "none";
        if (emptyEl) {
            emptyEl.style.display = "block";
            if (emptyTitle) emptyTitle.textContent = "No Deliveries Found";
            if (emptyMsg) emptyMsg.textContent = currentVolFilter === "ALL"
                ? "You have no deliveries assigned yet."
                : `No deliveries with status: ${currentVolFilter.replace("_", " ")}.`;
        }
        return;
    }

    if (emptyEl) emptyEl.style.display = "none";
    cardsEl.style.display = "grid";
    cardsEl.innerHTML = "";

    filtered.forEach(d => {
        cardsEl.appendChild(buildDeliveryCard(d, false));
    });
}

/** Build a delivery card element */
function buildDeliveryCard(d, compact) {
    const card = document.createElement("div");
    const statusClass = (d.DeliveryStatus || "assigned").toLowerCase().replace("_", "-");
    const priorityClass = `priority-${(d.Priority || "medium").toLowerCase()}`;

    const expiry = d.ExpiryAt ? new Date(d.ExpiryAt).toLocaleString([], {
        month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
    }) : "N/A";

    const allocDate = d.AllocationDate ? new Date(d.AllocationDate).toLocaleString([], {
        month: "short", day: "numeric"
    }) : "";

    const isAssigned = d.DeliveryStatus === "ASSIGNED";
    const isPickedUp = ["PICKED_UP", "IN_TRANSIT"].includes(d.DeliveryStatus);
    const isDelivered = d.DeliveryStatus === "DELIVERED";
    const isCancelled = d.DeliveryStatus === "CANCELLED";

    card.className = `delivery-card ${statusClass}`;

    card.innerHTML = `
        <div class="delivery-card-header">
            <div class="delivery-id-group">
                <span class="delivery-id">#${d.PickupDeliveryID}</span>
                <span class="delivery-food-name">${escapeHtml(d.FoodName)}</span>
            </div>
            <div class="delivery-badges">
                <span class="priority-badge ${priorityClass}">${escapeHtml(d.Priority || "MEDIUM")}</span>
                <span class="status ${statusClass}">${escapeHtml(d.DeliveryStatus.replace("_", " "))}</span>
            </div>
        </div>

        <div class="delivery-card-body">
            <div class="delivery-info-row">
                <span class="info-icon">🍱</span>
                <span><strong>${escapeHtml(d.FoodName)}</strong> (${escapeHtml(d.FoodType)}) — ${escapeHtml(String(d.AllocatedQuantity))} ${escapeHtml(d.Unit)}</span>
            </div>
            <div class="delivery-route">
                <div class="route-from">
                    <span class="route-dot pickup-dot">●</span>
                    <div>
                        <div class="route-label">Pickup From</div>
                        <div class="route-value">${escapeHtml(d.PickupLocation)}</div>
                        <div class="route-sub">${escapeHtml(d.DonorOrg || d.DonorName || "")}</div>
                    </div>
                </div>
                <div class="route-arrow">→</div>
                <div class="route-to">
                    <span class="route-dot deliver-dot">●</span>
                    <div>
                        <div class="route-label">Deliver To</div>
                        <div class="route-value">${escapeHtml(d.DeliveryLocation)}</div>
                        <div class="route-sub">${escapeHtml(d.NGOOrg || d.NGOName || "")}</div>
                    </div>
                </div>
            </div>
            <div class="delivery-meta">
                <span>⏰ Expires: ${expiry}</span>
                <span>📅 Allocated: ${allocDate}</span>
            </div>
            ${d.Remarks ? `<div class="delivery-remarks">📝 ${escapeHtml(d.Remarks)}</div>` : ""}
        </div>

        <div class="delivery-card-footer">
            ${isAssigned ? `
                <button class="btn-pickup-action" onclick="openPickupModal(${d.PickupDeliveryID})">
                    🚗 Confirm Pickup
                </button>
            ` : ""}
            ${isPickedUp ? `
                <button class="btn-deliver-action" onclick="openDeliverModal(${d.PickupDeliveryID})">
                    🎉 Confirm Delivery
                </button>
            ` : ""}
            ${isDelivered ? `
                <span class="delivery-done-badge">✅ Delivery Complete</span>
            ` : ""}
            ${isCancelled ? `
                <span class="delivery-cancelled-badge">❌ Cancelled</span>
            ` : ""}
        </div>
    `;

    return card;
}

/* -------- REFRESH ALL VOLUNTEER UI VIEWS -------- */
async function refreshVolunteerData(volunteerId) {
    const vid = volunteerId || (getCurrentUser() && getCurrentUser().id ? getCurrentUser().id : 6);
    const promises = [loadAvailablePickups(vid)];
    if (document.getElementById("statTotalAssigned")) {
        promises.push(loadVolunteerStats(vid));
    }
    if (document.getElementById("activeDeliveryCards")) {
        promises.push(loadActiveDeliveryCards(vid));
    }
    if (document.getElementById("deliveryCardsContainer")) {
        promises.push(loadAllVolDeliveries(vid));
    }
    await Promise.all(promises);
}

/* -------- PICKUP MODAL -------- */
function openPickupModal(deliveryId) {
    const modal = document.getElementById("pickupModal");
    const hiddenId = document.getElementById("pickupDeliveryId");
    const remarks = document.getElementById("pickupRemarks");
    if (hiddenId) hiddenId.value = deliveryId;
    if (remarks) remarks.value = "";
    if (modal) modal.style.display = "flex";
}

function closePickupModal() {
    const modal = document.getElementById("pickupModal");
    if (modal) modal.style.display = "none";
}

async function submitPickupConfirmation() {
    const deliveryId = document.getElementById("pickupDeliveryId")?.value;
    const remarks = document.getElementById("pickupRemarks")?.value.trim() || "";
    const btn = document.getElementById("btnConfirmPickup");
    const user = getCurrentUser();
    const volunteerId = (user && user.role === "VOLUNTEER" && user.id) ? user.id : (user && user.id ? user.id : 6);

    if (!deliveryId) return;
    if (btn) { btn.disabled = true; btn.textContent = "Confirming..."; }

    try {
        const baseUrl = await getWorkingBackendUrl();
        const res = await fetch(`${baseUrl}/api/volunteer/deliveries/${deliveryId}/pickup`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ volunteerId, remarks })
        });
        const result = await res.json();

        if (res.ok && result.success) {
            closePickupModal();
            showNotification("✅ Pickup confirmed! Delivery is now in transit.", "success");
            await refreshVolunteerData(volunteerId);
        } else {
            showNotification(result.message || "Failed to confirm pickup.", "error");
        }
    } catch (e) {
        console.error("Pickup confirmation error:", e);
        showNotification("Could not connect to backend.", "error");
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = "✅ Confirm Pickup"; }
    }
}

/* -------- DELIVERY MODAL -------- */
function openDeliverModal(deliveryId) {
    const modal = document.getElementById("deliverModal");
    const hiddenId = document.getElementById("deliverDeliveryId");
    const remarks = document.getElementById("deliverRemarks");
    if (hiddenId) hiddenId.value = deliveryId;
    if (remarks) remarks.value = "";
    if (modal) modal.style.display = "flex";
}

function closeDeliverModal() {
    const modal = document.getElementById("deliverModal");
    if (modal) modal.style.display = "none";
}

async function submitDeliveryConfirmation() {
    const deliveryId = document.getElementById("deliverDeliveryId")?.value;
    const remarks = document.getElementById("deliverRemarks")?.value.trim() || "";
    const btn = document.getElementById("btnConfirmDeliver");
    const user = getCurrentUser();
    const volunteerId = (user && user.role === "VOLUNTEER" && user.id) ? user.id : (user && user.id ? user.id : 6);

    if (!deliveryId) return;
    if (btn) { btn.disabled = true; btn.textContent = "Confirming..."; }

    try {
        const baseUrl = await getWorkingBackendUrl();
        const res = await fetch(`${baseUrl}/api/volunteer/deliveries/${deliveryId}/deliver`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ volunteerId, remarks })
        });
        const result = await res.json();

        if (res.ok && result.success) {
            closeDeliverModal();
            showNotification("🎉 Delivery confirmed! Great work — food has reached the community.", "success");
            await refreshVolunteerData(volunteerId);
        } else {
            showNotification(result.message || "Failed to confirm delivery.", "error");
        }
    } catch (e) {
        console.error("Delivery confirmation error:", e);
        showNotification("Could not connect to backend.", "error");
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = "🎉 Confirm Delivery"; }
    }
}

// Expose Phase E functions globally
window.initVolunteerDashboard = initVolunteerDashboard;
window.initVolunteerDeliveries = initVolunteerDeliveries;
window.filterVolDeliveries = filterVolDeliveries;
window.openPickupModal = openPickupModal;
window.closePickupModal = closePickupModal;
window.submitPickupConfirmation = submitPickupConfirmation;
window.openDeliverModal = openDeliverModal;
window.closeDeliverModal = closeDeliverModal;
window.submitDeliveryConfirmation = submitDeliveryConfirmation;
window.refreshVolunteerData = refreshVolunteerData;

/* =========================================================================
   VOLUNTEER AVAILABLE PICKUPS — CLAIM SYSTEM
   ========================================================================= */

let cachedAvailPickups = [];

/** Load available (unassigned) pickups for volunteers to claim */
async function loadAvailablePickups(volunteerId) {
    const loadingEl = document.getElementById("availPickupsLoading");
    const cardsEl = document.getElementById("availPickupCards");
    const emptyEl = document.getElementById("noAvailPickups");
    const countEl = document.getElementById("availPickupCount");

    if (!loadingEl && !cardsEl) return; // not on a relevant page

    try {
        const baseUrl = await getWorkingBackendUrl();
        const res = await fetch(`${baseUrl}/api/volunteer/available-pickups`);
        if (!res.ok) throw new Error("Failed to load available pickups");
        const data = await res.json();

        cachedAvailPickups = data.pickups || [];

        if (loadingEl) loadingEl.style.display = "none";
        if (countEl) countEl.textContent = cachedAvailPickups.length > 0 ? `${cachedAvailPickups.length} available` : "None available";

        if (cachedAvailPickups.length === 0) {
            if (emptyEl) emptyEl.style.display = "block";
            if (cardsEl) cardsEl.style.display = "none";
            return;
        }

        if (emptyEl) emptyEl.style.display = "none";
        if (cardsEl) {
            cardsEl.style.display = "grid";
            cardsEl.innerHTML = "";
            cachedAvailPickups.forEach(p => {
                cardsEl.appendChild(buildAvailablePickupCard(p, volunteerId));
            });
        }
    } catch (e) {
        console.warn("Could not load available pickups:", e);
        if (loadingEl) loadingEl.style.display = "none";
        if (emptyEl) emptyEl.style.display = "block";
    }
}

/** Build a card for an available (unclaimed) pickup */
function buildAvailablePickupCard(p, volunteerId) {
    const card = document.createElement("div");
    const priorityClass = `priority-${(p.Priority || "medium").toLowerCase()}`;

    const expiry = p.ExpiryAt ? new Date(p.ExpiryAt).toLocaleString([], {
        month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
    }) : "N/A";

    const expiryMs = p.ExpiryAt ? (new Date(p.ExpiryAt) - Date.now()) : 0;
    const hoursLeft = Math.max(0, Math.floor(expiryMs / 3600000));
    const urgentColor = hoursLeft < 4 ? "#dc2626" : hoursLeft < 12 ? "#d97706" : "#16a34a";

    card.className = "delivery-card available-pickup-card";
    card.style.cssText = "border-top: 4px solid #7c3aed; position: relative;";

    const foodNameSafe = escapeHtml(p.FoodName);
    const pickupLocSafe = escapeHtml(p.PickupLocation);
    const deliveryLocSafe = escapeHtml(p.DeliveryLocation);

    card.innerHTML = `
        <div style="position:absolute; top:12px; right:12px; background:#7c3aed; color:#fff; font-size:11px; font-weight:700; padding:3px 8px; border-radius:20px;">UNCLAIMED</div>
        <div class="delivery-card-header" style="padding-right:90px;">
            <div class="delivery-id-group">
                <span class="delivery-id">#${p.PickupDeliveryID}</span>
                <span class="delivery-food-name">${foodNameSafe}</span>
            </div>
            <div class="delivery-badges">
                <span class="priority-badge ${priorityClass}">${escapeHtml(p.Priority || "MEDIUM")}</span>
            </div>
        </div>
        <div class="delivery-card-body">
            <div class="delivery-info-row">
                <span class="info-icon">🍱</span>
                <span><strong>${foodNameSafe}</strong> (${escapeHtml(p.FoodType)}) — ${escapeHtml(String(p.AllocatedQuantity))} ${escapeHtml(p.Unit)}</span>
            </div>
            <div class="delivery-route">
                <div class="route-from">
                    <span class="route-dot pickup-dot">●</span>
                    <div>
                        <div class="route-label">Pickup From</div>
                        <div class="route-value">${pickupLocSafe}</div>
                        <div class="route-sub">${escapeHtml(p.DonorOrg || p.DonorName || "")}</div>
                    </div>
                </div>
                <div class="route-arrow">→</div>
                <div class="route-to">
                    <span class="route-dot deliver-dot">●</span>
                    <div>
                        <div class="route-label">Deliver To</div>
                        <div class="route-value">${deliveryLocSafe}</div>
                        <div class="route-sub">${escapeHtml(p.NGOOrg || p.NGOName || "")}</div>
                    </div>
                </div>
            </div>
            <div class="delivery-meta">
                <span style="color:${urgentColor};">⏰ Expires: ${expiry} (${hoursLeft}h left)</span>
                <span>📦 Qty: ${escapeHtml(String(p.AllocatedQuantity))} ${escapeHtml(p.Unit)}</span>
            </div>
        </div>
        <div class="delivery-card-footer">
            <button class="btn-pickup-action" style="background:#7c3aed;"
                onclick="openClaimModal(${p.PickupDeliveryID})"
            >
                🚗 Accept Pickup Request
            </button>
        </div>
    `;
    return card;
}

/** Open the claim confirmation modal */
function openClaimModal(deliveryId) {
    const modal = document.getElementById("claimPickupModal");
    const hiddenId = document.getElementById("claimDeliveryId");
    const detailEl = document.getElementById("claimPickupDetail");
    if (!modal) return;

    const p = cachedAvailPickups.find(item => Number(item.PickupDeliveryID) === Number(deliveryId));

    if (hiddenId) hiddenId.value = deliveryId;
    if (detailEl) {
        if (p) {
            detailEl.innerHTML = `
                <p style="margin-bottom:6px;"><strong>Pickup #${deliveryId}:</strong> ${escapeHtml(p.FoodName)} (${escapeHtml(p.FoodType)})</p>
                <p style="margin-bottom:4px;">📍 <strong>From:</strong> ${escapeHtml(p.PickupLocation)} (${escapeHtml(p.DonorOrg || p.DonorName || "Donor")})</p>
                <p style="margin-bottom:4px;">📍 <strong>To:</strong> ${escapeHtml(p.DeliveryLocation)} (${escapeHtml(p.NGOOrg || p.NGOName || "NGO")})</p>
                <p style="color:#64748b; font-size:13px; margin-top:6px;">📦 Quantity: ${escapeHtml(String(p.AllocatedQuantity))} ${escapeHtml(p.Unit)}</p>
            `;
        } else {
            detailEl.innerHTML = `<p><strong>Pickup #${deliveryId}</strong></p>`;
        }
    }
    modal.style.display = "flex";
}

function closeClaimModal() {
    const modal = document.getElementById("claimPickupModal");
    if (modal) modal.style.display = "none";
}

async function submitClaimPickup() {
    const deliveryId = document.getElementById("claimDeliveryId")?.value;
    const btn = document.getElementById("btnConfirmClaim");
    const user = getCurrentUser();
    const volunteerId = (user && user.role === "VOLUNTEER" && user.id) ? user.id : (user && user.id ? user.id : 6);

    if (!deliveryId) {
        showNotification("No delivery selected.", "warning");
        return;
    }
    if (btn) { btn.disabled = true; btn.textContent = "Claiming..."; }

    try {
        const baseUrl = await getWorkingBackendUrl();
        const res = await fetch(`${baseUrl}/api/volunteer/claim-delivery/${deliveryId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ volunteerId })
        });
        const result = await res.json();

        if (res.ok && result.success) {
            closeClaimModal();
            showNotification("🚗 Pickup claimed! It's now in your assigned deliveries.", "success");
            // Refresh volunteer data across all tabs/views
            await refreshVolunteerData(volunteerId);
        } else {
            showNotification(result.message || "Failed to claim pickup.", "error");
        }
    } catch (e) {
        console.error("Claim pickup error:", e);
        showNotification("Could not connect to backend.", "error");
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = "🚗 Yes, Claim This Pickup"; }
    }
}

window.loadAvailablePickups = loadAvailablePickups;
window.openClaimModal = openClaimModal;
window.closeClaimModal = closeClaimModal;
window.submitClaimPickup = submitClaimPickup;

/* =========================================================================
   PHASE F — DISTRIBUTION HISTORY PAGE LOGIC
   ========================================================================= */

let cachedDistributions = [];
let currentHistorySearch = "";

async function initHistoryPage() {
    await Promise.all([
        loadHistoryStats(),
        loadHistoryData()
    ]);
}

async function loadHistoryStats() {
    try {
        const baseUrl = await getWorkingBackendUrl();
        const res = await fetch(`${baseUrl}/api/history/stats`);
        if (!res.ok) return;
        const data = await res.json();
        if (!data.success || !data.stats) return;

        const s = data.stats;
        const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v !== undefined && v !== null ? v : 0; };
        set("hstatDist", s.totalDistributions);
        set("hstatAllocated", `${s.totalFoodKg || 0} kg`);
        set("hstatDistributed", `${s.totalDistributions} batches`);
        set("hstatDeliveries", s.completedDeliveries);
    } catch (e) {
        console.warn("Could not load history stats:", e);
    }
}

async function loadHistoryData() {
    const loadingEl = document.getElementById("historyLoading");
    const tableWrapper = document.getElementById("historyTableWrapper");
    const emptyEl = document.getElementById("historyEmpty");

    try {
        const baseUrl = await getWorkingBackendUrl();
        const res = await fetch(`${baseUrl}/api/history/distributions`);
        if (!res.ok) throw new Error("Failed to load distribution history");
        const data = await res.json();

        cachedDistributions = data.distributions || [];
        if (loadingEl) loadingEl.style.display = "none";

        renderHistoryTable();
    } catch (e) {
        console.error("History data error:", e);
        if (loadingEl) loadingEl.style.display = "none";
        if (emptyEl) {
            emptyEl.style.display = "block";
            const p = emptyEl.querySelector("p");
            if (p) p.textContent = "Could not load distribution history. Check backend connection.";
        }
    }
}

function renderHistoryTable() {
    const tableBody = document.getElementById("historyTableBody");
    const tableWrapper = document.getElementById("historyTableWrapper");
    const emptyEl = document.getElementById("historyEmpty");
    if (!tableBody) return;

    let filtered = cachedDistributions;

    if (currentHistorySearch.trim()) {
        const q = currentHistorySearch.toLowerCase().trim();
        filtered = filtered.filter(item =>
            (item.FoodName && item.FoodName.toLowerCase().includes(q)) ||
            (item.DonorName && item.DonorName.toLowerCase().includes(q)) ||
            (item.DonorOrg && item.DonorOrg.toLowerCase().includes(q)) ||
            (item.NGOName && item.NGOName.toLowerCase().includes(q)) ||
            (item.NGOOrg && item.NGOOrg.toLowerCase().includes(q)) ||
            (item.VolunteerName && item.VolunteerName.toLowerCase().includes(q)) ||
            (item.DistributionLocation && item.DistributionLocation.toLowerCase().includes(q))
        );
    }

    if (filtered.length === 0) {
        if (tableWrapper) tableWrapper.style.display = "none";
        if (emptyEl) emptyEl.style.display = "block";
        tableBody.innerHTML = "";
        return;
    }

    if (tableWrapper) tableWrapper.style.display = "block";
    if (emptyEl) emptyEl.style.display = "none";
    tableBody.innerHTML = "";

    filtered.forEach(item => {
        const row = document.createElement("tr");
        const distDate = item.DistributionDate ? new Date(item.DistributionDate).toLocaleString([], {
            month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit"
        }) : "N/A";
        const statusClass = (item.DistributionStatus || "distributed").toLowerCase().replace("_", "-");

        row.innerHTML = `
            <td><strong>#${item.DistributionID}</strong></td>
            <td>
                <strong>${escapeHtml(item.FoodName)}</strong>
                <div style="font-size:12px; color:#64748b;">${escapeHtml(item.FoodType || "")}</div>
            </td>
            <td><strong>${escapeHtml(String(item.QuantityDistributed))}</strong> ${escapeHtml(item.Unit || "kg")}</td>
            <td>
                <div>${escapeHtml(item.DonorOrg || item.DonorName || "—")}</div>
                <small style="color:#64748b;">📍 ${escapeHtml(item.PickupLocation || "—")}</small>
            </td>
            <td>
                <div>${escapeHtml(item.NGOOrg || item.NGOName || "—")}</div>
                <small style="color:#64748b;">📦 ${escapeHtml(item.DeliveryLocation || "—")}</small>
            </td>
            <td>${item.VolunteerName ? `🚗 <strong>${escapeHtml(item.VolunteerName)}</strong>` : `<span style="color:#94a3b8;">Unassigned</span>`}</td>
            <td>${escapeHtml(item.DistributionLocation || "—")}</td>
            <td style="font-size:12px;">${distDate}</td>
            <td><span class="status ${statusClass}">${escapeHtml(item.DistributionStatus)}</span></td>
        `;
        tableBody.appendChild(row);
    });
}

function searchHistory(query) {
    currentHistorySearch = query;
    renderHistoryTable();
}

/* =========================================================================
   PHASE G — ADMIN DASHBOARD & ANALYTICS
   ========================================================================= */

let adminChartsInstances = {};

async function initAdminDashboard() {
    const user = getCurrentUser();
    const welcome = document.getElementById("adminWelcome");
    if (welcome && user && user.name) {
        welcome.textContent = `Welcome back, Admin ${user.name}! System analytics and live operations overview.`;
    }

    await Promise.all([
        loadAdminStats(),
        loadAdminActivity()
    ]);
}

async function loadAdminStats() {
    try {
        const baseUrl = await getWorkingBackendUrl();
        const res = await fetch(`${baseUrl}/api/admin/stats`);
        if (!res.ok) return;
        const data = await res.json();
        if (!data.success || !data.stats) return;

        const s = data.stats;
        const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v !== undefined && v !== null ? v : 0; };

        set("kpiUsers", s.totalUsers);
        set("kpiDonations", s.totalDonations);
        set("kpiRequests", s.totalRequests);
        set("kpiAllocations", s.totalAllocations);
        set("kpiDeliveries", s.totalDeliveries);
        set("kpiFoodRescued", `${s.totalFoodDistributedKg || s.totalFoodAllocatedKg || 0} kg`);

        // Breakdowns
        const ub = document.getElementById("kpiUsersBreakdown");
        if (ub) ub.textContent = `${s.totalDonors || 0} Donors | ${s.totalNGOs || 0} NGOs | ${s.totalVolunteers || 0} Vols`;

        const db = document.getElementById("kpiDonationsBreakdown");
        if (db) db.textContent = `${s.availableDonations || 0} Available | ${s.completedDonations || 0} Completed`;

        const rb = document.getElementById("kpiRequestsBreakdown");
        if (rb) rb.textContent = `${s.pendingRequests || 0} Pending | ${s.fulfilledRequests || 0} Fulfilled`;

        const delb = document.getElementById("kpiDeliveriesBreakdown");
        if (delb) delb.textContent = `${s.completedDeliveries || 0} Delivered successfully`;

        // Render Charts if Chart.js is available
        if (typeof Chart !== "undefined" && data.charts) {
            renderAdminCharts(data.charts);
        }
    } catch (e) {
        console.warn("Could not load admin stats:", e);
    }
}

function renderAdminCharts(charts) {
    // 1. Donations by Status (Doughnut)
    const ctxDonation = document.getElementById("chartDonationStatus");
    if (ctxDonation) {
        if (adminChartsInstances.donation) adminChartsInstances.donation.destroy();
        const labels = (charts.donationsByStatus || []).map(item => item.Status);
        const values = (charts.donationsByStatus || []).map(item => item.cnt);
        adminChartsInstances.donation = new Chart(ctxDonation, {
            type: "doughnut",
            data: {
                labels: labels.length ? labels : ["Available", "Allocated", "Completed"],
                datasets: [{
                    data: values.length ? values : [5, 4, 3],
                    backgroundColor: ["#16a34a", "#0284c7", "#7c3aed", "#f59e0b", "#ef4444"]
                }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom" } } }
        });
    }

    // 2. Requests by Priority (Bar)
    const ctxReq = document.getElementById("chartRequestPriority");
    if (ctxReq) {
        if (adminChartsInstances.req) adminChartsInstances.req.destroy();
        const labels = (charts.requestsByPriority || []).map(item => item.Priority);
        const values = (charts.requestsByPriority || []).map(item => item.cnt);
        adminChartsInstances.req = new Chart(ctxReq, {
            type: "bar",
            data: {
                labels: labels.length ? labels : ["URGENT", "HIGH", "MEDIUM", "LOW"],
                datasets: [{
                    label: "Requests",
                    data: values.length ? values : [1, 2, 1, 0],
                    backgroundColor: ["#ef4444", "#f97316", "#3b82f6", "#10b981"]
                }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
        });
    }

    // 3. Allocations Trend (Line)
    const ctxTrend = document.getElementById("chartAllocTrend");
    if (ctxTrend) {
        if (adminChartsInstances.trend) adminChartsInstances.trend.destroy();
        const labels = (charts.allocationsByDay || []).map(item => item.label);
        const values = (charts.allocationsByDay || []).map(item => item.cnt);
        adminChartsInstances.trend = new Chart(ctxTrend, {
            type: "line",
            data: {
                labels: labels.length ? labels : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
                datasets: [{
                    label: "Allocations",
                    data: values.length ? values : [1, 2, 1, 3, 2, 4, 3],
                    borderColor: "#2e7d32",
                    backgroundColor: "rgba(46, 125, 50, 0.1)",
                    fill: true,
                    tension: 0.3
                }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
        });
    }

    // 4. Users by Role (Pie)
    const ctxRole = document.getElementById("chartUserRoles");
    if (ctxRole) {
        if (adminChartsInstances.role) adminChartsInstances.role.destroy();
        const labels = (charts.usersByRole || []).map(item => item.Role);
        const values = (charts.usersByRole || []).map(item => item.cnt);
        adminChartsInstances.role = new Chart(ctxRole, {
            type: "pie",
            data: {
                labels: labels.length ? labels : ["DONOR", "NGO", "VOLUNTEER", "ADMIN"],
                datasets: [{
                    data: values.length ? values : [4, 2, 2, 1],
                    backgroundColor: ["#f59e0b", "#0ea5e9", "#10b981", "#64748b"]
                }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom" } } }
        });
    }
}

async function loadAdminActivity() {
    const loading = document.getElementById("activityFeedLoading");
    const feed = document.getElementById("activityFeed");
    if (!feed) return;

    try {
        const baseUrl = await getWorkingBackendUrl();
        const res = await fetch(`${baseUrl}/api/admin/activity`);
        if (!res.ok) throw new Error("Failed to load activity");
        const data = await res.json();

        if (loading) loading.style.display = "none";
        feed.style.display = "flex";
        feed.innerHTML = "";

        const activities = data.activities || [];
        if (activities.length === 0) {
            feed.innerHTML = `<p style="color:#64748b; padding:10px;">No recent activity logged.</p>`;
            return;
        }

        activities.forEach(act => {
            const item = document.createElement("div");
            item.className = "activity-item";
            const icon = act.type === "Donation" ? "🍱" : act.type === "Request" ? "🤝" : "🔗";
            const timeStr = act.timestamp ? new Date(act.timestamp).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";

            item.innerHTML = `
                <div class="activity-icon">${icon}</div>
                <div class="activity-content">
                    <div class="activity-desc"><strong>[${escapeHtml(act.type)}]</strong> ${escapeHtml(act.description)}</div>
                    <div class="activity-time">${timeStr} · <span class="status ${String(act.status).toLowerCase()}">${escapeHtml(act.status || "")}</span></div>
                </div>
            `;
            feed.appendChild(item);
        });
    } catch (e) {
        console.warn("Could not load activity feed:", e);
        if (loading) loading.style.display = "none";
    }
}

/* =========================================================================
   PHASE G — ADMIN USERS MANAGEMENT
   ========================================================================= */

let cachedAdminUsers = [];
let currentAdminUserFilter = "ALL";
let currentAdminUserSearch = "";

async function initAdminUsersPage() {
    const loading = document.getElementById("usersLoading");
    const wrapper = document.getElementById("usersTableWrapper");

    try {
        const baseUrl = await getWorkingBackendUrl();
        const res = await fetch(`${baseUrl}/api/admin/users`);
        if (!res.ok) throw new Error("Failed to load users");
        const data = await res.json();

        cachedAdminUsers = data.users || [];
        if (loading) loading.style.display = "none";

        updateAdminUserTabCounts();
        renderAdminUsers();
    } catch (e) {
        console.error("Admin users error:", e);
        if (loading) loading.style.display = "none";
    }
}

function updateAdminUserTabCounts() {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set("ucntAll", cachedAdminUsers.length);
    set("ucntDonor", cachedAdminUsers.filter(u => u.Role === "DONOR").length);
    set("ucntNGO", cachedAdminUsers.filter(u => u.Role === "NGO").length);
    set("ucntVolunteer", cachedAdminUsers.filter(u => u.Role === "VOLUNTEER").length);
    set("ucntAdmin", cachedAdminUsers.filter(u => u.Role === "ADMIN").length);
}

function filterUsers(role, btnEl) {
    currentAdminUserFilter = role;
    document.querySelectorAll(".filter-tabs-bar .filter-tab").forEach(t => t.classList.remove("active"));
    if (btnEl) btnEl.classList.add("active");
    renderAdminUsers();
}

function searchUsers(query) {
    currentAdminUserSearch = query;
    renderAdminUsers();
}

function renderAdminUsers() {
    const body = document.getElementById("usersTableBody");
    const wrapper = document.getElementById("usersTableWrapper");
    const empty = document.getElementById("usersEmpty");
    if (!body) return;

    let filtered = cachedAdminUsers;

    if (currentAdminUserFilter !== "ALL") {
        filtered = filtered.filter(u => u.Role === currentAdminUserFilter);
    }

    if (currentAdminUserSearch.trim()) {
        const q = currentAdminUserSearch.toLowerCase().trim();
        filtered = filtered.filter(u =>
            (u.Name && u.Name.toLowerCase().includes(q)) ||
            (u.Email && u.Email.toLowerCase().includes(q)) ||
            (u.OrganizationName && u.OrganizationName.toLowerCase().includes(q)) ||
            (u.City && u.City.toLowerCase().includes(q))
        );
    }

    if (filtered.length === 0) {
        if (wrapper) wrapper.style.display = "none";
        if (empty) empty.style.display = "block";
        body.innerHTML = "";
        return;
    }

    if (wrapper) wrapper.style.display = "block";
    if (empty) empty.style.display = "none";
    body.innerHTML = "";

    filtered.forEach(u => {
        const tr = document.createElement("tr");
        const statusClass = u.Status === "ACTIVE" ? "available" : "cancelled";
        const isSelf = getCurrentUser() && getCurrentUser().id === u.UserID;
        const isAdmin = u.Role === "ADMIN";

        tr.innerHTML = `
            <td>#${u.UserID}</td>
            <td><strong>${escapeHtml(u.Name)}</strong></td>
            <td>${escapeHtml(u.Email)}</td>
            <td>${escapeHtml(u.Phone || "—")}</td>
            <td><span class="role-badge role-${u.Role.toLowerCase()}">${escapeHtml(u.Role)}</span></td>
            <td>${escapeHtml(u.OrganizationName || "—")}</td>
            <td>${escapeHtml(u.City || "—")}</td>
            <td><span class="status ${statusClass}">${escapeHtml(u.Status)}</span></td>
            <td>
                ${isAdmin || isSelf ? `<span style="font-size:12px; color:#94a3b8;">Protected</span>` : `
                    <button class="btn-action-toggle ${u.Status === 'ACTIVE' ? 'deactivate' : 'activate'}"
                        onclick="toggleUserStatus(${u.UserID})">
                        ${u.Status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                    </button>
                `}
            </td>
        `;
        body.appendChild(tr);
    });
}

async function toggleUserStatus(userId) {
    try {
        const baseUrl = await getWorkingBackendUrl();
        const res = await fetch(`${baseUrl}/api/admin/users/${userId}/status`, { method: "PUT" });
        const result = await res.json();
        if (res.ok && result.success) {
            showNotification(`User status updated to ${result.newStatus}.`, "success");
            await initAdminUsersPage();
        } else {
            showNotification(result.message || "Failed to update user status.", "error");
        }
    } catch (e) {
        console.error("Toggle user error:", e);
        showNotification("Could not connect to backend.", "error");
    }
}

/* =========================================================================
   PHASE G — ADMIN DELIVERIES TRACKER
   ========================================================================= */

let cachedAdminDeliveries = [];
let currentAdminDeliveryFilter = "ALL";
let currentAdminDeliverySearch = "";

async function initAdminDeliveriesPage() {
    const loading = document.getElementById("adminDeliveriesLoading");
    const cardsEl = document.getElementById("adminDeliveryCards");

    try {
        const baseUrl = await getWorkingBackendUrl();
        const res = await fetch(`${baseUrl}/api/admin/deliveries`);
        if (!res.ok) throw new Error("Failed to load deliveries");
        const data = await res.json();

        cachedAdminDeliveries = data.deliveries || [];
        if (loading) loading.style.display = "none";

        updateAdminDeliveryCounts();
        renderAdminDeliveries();
    } catch (e) {
        console.error("Admin deliveries error:", e);
        if (loading) loading.style.display = "none";
    }
}

function updateAdminDeliveryCounts() {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    const unassigned = cachedAdminDeliveries.filter(d => !d.VolunteerID && d.DeliveryStatus === "ASSIGNED").length;
    set("adcntAll", cachedAdminDeliveries.length);
    set("adcntUnassigned", unassigned);
    set("adcntAssigned", cachedAdminDeliveries.filter(d => d.VolunteerID && d.DeliveryStatus === "ASSIGNED").length);
    set("adcntPickedUp", cachedAdminDeliveries.filter(d => ["PICKED_UP", "IN_TRANSIT"].includes(d.DeliveryStatus)).length);
    set("adcntDelivered", cachedAdminDeliveries.filter(d => d.DeliveryStatus === "DELIVERED").length);
    set("adcntCancelled", cachedAdminDeliveries.filter(d => d.DeliveryStatus === "CANCELLED").length);

    set("dstatAssigned", cachedAdminDeliveries.filter(d => d.DeliveryStatus === "ASSIGNED").length);
    set("dstatTransit", cachedAdminDeliveries.filter(d => ["PICKED_UP", "IN_TRANSIT"].includes(d.DeliveryStatus)).length);
    set("dstatDelivered", cachedAdminDeliveries.filter(d => d.DeliveryStatus === "DELIVERED").length);
    set("dstatCancelled", cachedAdminDeliveries.filter(d => d.DeliveryStatus === "CANCELLED").length);
}

function filterAdminDeliveries(status, btnEl) {
    currentAdminDeliveryFilter = status;
    document.querySelectorAll(".filter-tabs-bar .filter-tab").forEach(t => t.classList.remove("active"));
    if (btnEl) btnEl.classList.add("active");
    renderAdminDeliveries();
}

function searchAdminDeliveries(query) {
    currentAdminDeliverySearch = query;
    renderAdminDeliveries();
}

function renderAdminDeliveries() {
    const cardsEl = document.getElementById("adminDeliveryCards");
    const emptyEl = document.getElementById("adminDeliveriesEmpty");
    if (!cardsEl) return;

    let filtered = cachedAdminDeliveries;

    if (currentAdminDeliveryFilter !== "ALL") {
        if (currentAdminDeliveryFilter === "PICKED_UP") {
            filtered = filtered.filter(d => ["PICKED_UP", "IN_TRANSIT"].includes(d.DeliveryStatus));
        } else if (currentAdminDeliveryFilter === "UNASSIGNED") {
            filtered = filtered.filter(d => !d.VolunteerID && d.DeliveryStatus === "ASSIGNED");
        } else if (currentAdminDeliveryFilter === "ASSIGNED") {
            filtered = filtered.filter(d => d.VolunteerID && d.DeliveryStatus === "ASSIGNED");
        } else {
            filtered = filtered.filter(d => d.DeliveryStatus === currentAdminDeliveryFilter);
        }
    }

    if (currentAdminDeliverySearch.trim()) {
        const q = currentAdminDeliverySearch.toLowerCase().trim();
        filtered = filtered.filter(d =>
            (d.FoodName && d.FoodName.toLowerCase().includes(q)) ||
            (d.VolunteerName && d.VolunteerName.toLowerCase().includes(q)) ||
            (d.DonorName && d.DonorName.toLowerCase().includes(q)) ||
            (d.NGOName && d.NGOName.toLowerCase().includes(q))
        );
    }

    if (filtered.length === 0) {
        cardsEl.style.display = "none";
        if (emptyEl) emptyEl.style.display = "block";
        return;
    }

    if (emptyEl) emptyEl.style.display = "none";
    cardsEl.style.display = "grid";
    cardsEl.innerHTML = "";

    filtered.forEach(d => {
        const card = document.createElement("div");
        const isUnassigned = !d.VolunteerID && d.DeliveryStatus === "ASSIGNED";
        const statusClass = isUnassigned ? "unassigned" : (d.DeliveryStatus || "assigned").toLowerCase().replace("_", "-");
        const priorityClass = `priority-${(d.Priority || "medium").toLowerCase()}`;

        card.className = `delivery-card ${statusClass}`;
        if (isUnassigned) card.style.borderTop = "4px solid #7c3aed";

        card.innerHTML = `
            <div class="delivery-card-header">
                <div class="delivery-id-group">
                    <span class="delivery-id">#${d.PickupDeliveryID}</span>
                    <span class="delivery-food-name">${escapeHtml(d.FoodName)}</span>
                </div>
                <div class="delivery-badges">
                    <span class="priority-badge ${priorityClass}">${escapeHtml(d.Priority || "MEDIUM")}</span>
                    <span class="status ${statusClass}">${isUnassigned ? "UNASSIGNED" : escapeHtml(d.DeliveryStatus)}</span>
                </div>
            </div>
            <div class="delivery-card-body">
                <div class="delivery-info-row">
                    <span class="info-icon">🍱</span>
                    <span><strong>${escapeHtml(d.FoodName)}</strong> — ${escapeHtml(String(d.AllocatedQuantity))} ${escapeHtml(d.Unit)}</span>
                </div>
                <div class="delivery-route">
                    <div class="route-from">
                        <span class="route-dot pickup-dot">●</span>
                        <div>
                            <div class="route-label">From (Donor)</div>
                            <div class="route-value">${escapeHtml(d.PickupLocation)}</div>
                            <div class="route-sub">${escapeHtml(d.DonorOrg || d.DonorName || "")}</div>
                        </div>
                    </div>
                    <div class="route-arrow">→</div>
                    <div class="route-to">
                        <span class="route-dot deliver-dot">●</span>
                        <div>
                            <div class="route-label">To (NGO)</div>
                            <div class="route-value">${escapeHtml(d.DeliveryLocation)}</div>
                            <div class="route-sub">${escapeHtml(d.NGOOrg || d.NGOName || "")}</div>
                        </div>
                    </div>
                </div>
                <div class="delivery-meta" style="margin-top:4px;">
                    ${isUnassigned
                        ? `<span style="color:#7c3aed; font-weight:600;">⚠️ No volunteer assigned yet</span>`
                        : `<span>🚗 Volunteer: <strong>${escapeHtml(d.VolunteerName || "—")}</strong> (${escapeHtml(d.VolunteerPhone || "—")})</span>`
                    }
                </div>
            </div>
            ${isUnassigned ? `
            <div class="delivery-card-footer">
                <button class="btn-pickup-action" style="background:#7c3aed;"
                    onclick="openAssignModal(${d.PickupDeliveryID})"
                >
                    👤 Assign Volunteer
                </button>
            </div>` : ""}
        `;
        cardsEl.appendChild(card);
    });
}

/* ---- ADMIN ASSIGN VOLUNTEER MODAL ---- */
let cachedVolunteersList = [];

async function openAssignModal(deliveryId) {
    const modal = document.getElementById("assignVolunteerModal");
    const hiddenId = document.getElementById("assignDeliveryId");
    const infoEl = document.getElementById("assignDeliveryInfo");
    const select = document.getElementById("assignVolunteerSelect");
    if (!modal) return;

    const delivery = cachedAdminDeliveries.find(d => Number(d.PickupDeliveryID) === Number(deliveryId));

    if (hiddenId) hiddenId.value = deliveryId;
    if (infoEl) {
        if (delivery) {
            infoEl.innerHTML = `
                <div style="font-weight:700; color:#1e293b; margin-bottom:4px;">Delivery #${deliveryId}: ${escapeHtml(delivery.FoodName)}</div>
                <div style="font-size:13px; color:#475569; margin-bottom:2px;">📍 <strong>From:</strong> ${escapeHtml(delivery.PickupLocation)} (${escapeHtml(delivery.DonorOrg || delivery.DonorName || "Donor")})</div>
                <div style="font-size:13px; color:#475569; margin-bottom:2px;">📍 <strong>To:</strong> ${escapeHtml(delivery.DeliveryLocation)} (${escapeHtml(delivery.NGOOrg || delivery.NGOName || "NGO")})</div>
                <div style="font-size:12px; color:#64748b; margin-top:4px;">📦 Qty: ${escapeHtml(String(delivery.AllocatedQuantity))} ${escapeHtml(delivery.Unit)}</div>
            `;
        } else {
            infoEl.innerHTML = `<strong>Delivery #${deliveryId}</strong>`;
        }
    }

    // Always fetch latest active volunteers
    try {
        const baseUrl = await getWorkingBackendUrl();
        const res = await fetch(`${baseUrl}/api/volunteers`);
        const data = await res.json();
        cachedVolunteersList = data.volunteers || [];
    } catch (e) {
        console.warn("Could not load volunteers:", e);
    }

    if (select) {
        select.innerHTML = `<option value="">-- Select an Active Volunteer --</option>`;
        if (cachedVolunteersList.length === 0) {
            select.innerHTML = `<option value="">No active volunteers found</option>`;
        } else {
            cachedVolunteersList.forEach(v => {
                const opt = document.createElement("option");
                opt.value = v.UserID;
                opt.textContent = `👤 ${v.Name} (${v.City || "Active"}) — 📞 ${v.Phone || "N/A"}`;
                select.appendChild(opt);
            });
        }
    }

    modal.style.display = "flex";
}

function closeAssignModal() {
    const modal = document.getElementById("assignVolunteerModal");
    if (modal) modal.style.display = "none";
}

async function submitVolunteerAssignment() {
    const deliveryId = document.getElementById("assignDeliveryId")?.value;
    const volunteerId = document.getElementById("assignVolunteerSelect")?.value;
    const btn = document.getElementById("btnConfirmAssign");

    if (!deliveryId || !volunteerId) {
        showNotification("Please select a volunteer.", "warning");
        return;
    }
    if (btn) { btn.disabled = true; btn.textContent = "Assigning..."; }

    try {
        const baseUrl = await getWorkingBackendUrl();
        const res = await fetch(`${baseUrl}/api/admin/deliveries/${deliveryId}/assign`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ volunteerId: Number(volunteerId) })
        });
        const result = await res.json();

        if (res.ok && result.success) {
            closeAssignModal();
            showNotification(`✅ ${result.message}`, "success");
            // Reload deliveries
            await initAdminDeliveriesPage();
        } else {
            showNotification(result.message || "Failed to assign volunteer.", "error");
        }
    } catch (e) {
        console.error("Assign volunteer error:", e);
        showNotification("Could not connect to backend.", "error");
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = "✅ Assign Volunteer"; }
    }
}

window.openAssignModal = openAssignModal;
window.closeAssignModal = closeAssignModal;
window.submitVolunteerAssignment = submitVolunteerAssignment;

/* =========================================================================
   PHASE H — PROFILE MANAGEMENT LOGIC
   ========================================================================= */

async function initProfilePage() {
    const user = getCurrentUser();
    if (!user || !user.id) {
        showNotification("Please log in to manage your profile.", "warning");
        setTimeout(() => { window.location.href = "login.html"; }, 1000);
        return;
    }

    const setRoleBadge = document.getElementById("profileRoleBadge");
    if (setRoleBadge) {
        setRoleBadge.textContent = user.role || "USER";
        setRoleBadge.className = `role-badge role-${(user.role || "").toLowerCase()}`;
    }
    const infoRole = document.getElementById("infoRoleText");
    if (infoRole) infoRole.textContent = user.role || "USER";
    const infoId = document.getElementById("infoUserIdText");
    if (infoId) infoId.textContent = `#${user.id}`;

    try {
        const baseUrl = await getWorkingBackendUrl();
        const res = await fetch(`${baseUrl}/api/profile/${user.id}`);
        if (!res.ok) throw new Error("Failed to fetch profile");
        const data = await res.json();

        if (data.success && data.user) {
            const u = data.user;
            const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ""; };
            setVal("profName", u.Name);
            setVal("profEmail", u.Email);
            setVal("profPhone", u.Phone);
            setVal("profCity", u.City);
            setVal("profOrg", u.OrganizationName);
            setVal("profAddress", u.Address);
        }
    } catch (e) {
        console.warn("Could not load user profile:", e);
    }

    // Load Phase I notifications
    await loadUserNotifications();
}

async function handleProfileUpdate(event) {
    event.preventDefault();
    const user = getCurrentUser();
    if (!user || !user.id) return;

    const btn = document.getElementById("btnSaveProfile");
    const origText = btn ? btn.textContent : "💾 Save Profile Changes";
    if (btn) { btn.disabled = true; btn.textContent = "Saving..."; }

    const profileData = {
        name: document.getElementById("profName").value.trim(),
        phone: document.getElementById("profPhone").value.trim(),
        city: document.getElementById("profCity").value.trim(),
        organizationName: document.getElementById("profOrg").value.trim(),
        address: document.getElementById("profAddress").value.trim()
    };

    try {
        const baseUrl = await getWorkingBackendUrl();
        const res = await fetch(`${baseUrl}/api/profile/${user.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(profileData)
        });
        const result = await res.json();

        if (res.ok && result.success) {
            showNotification("✅ Profile details updated successfully!", "success");
            // Update local storage name
            user.name = profileData.name;
            setCurrentUser(user);
        } else {
            showNotification(result.message || "Failed to update profile.", "error");
        }
    } catch (e) {
        console.error("Profile update error:", e);
        showNotification("Could not connect to backend to save profile.", "error");
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = origText; }
    }
}

async function handlePasswordChange(event) {
    event.preventDefault();
    const user = getCurrentUser();
    if (!user || !user.id) return;

    const currentPassword = document.getElementById("currentPassword").value;
    const newPassword = document.getElementById("newPassword").value;
    const confirmNewPassword = document.getElementById("confirmNewPassword").value;

    if (newPassword !== confirmNewPassword) {
        showNotification("New passwords do not match. Please re-check.", "warning");
        return;
    }

    const btn = document.getElementById("btnSavePassword");
    const origText = btn ? btn.textContent : "🔑 Update Password";
    if (btn) { btn.disabled = true; btn.textContent = "Updating..."; }

    try {
        const baseUrl = await getWorkingBackendUrl();
        const res = await fetch(`${baseUrl}/api/profile/${user.id}/password`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ currentPassword, newPassword })
        });
        const result = await res.json();

        if (res.ok && result.success) {
            showNotification("🔒 Password changed successfully!", "success");
            document.getElementById("currentPassword").value = "";
            document.getElementById("newPassword").value = "";
            document.getElementById("confirmNewPassword").value = "";
        } else {
            showNotification(result.message || "Failed to change password.", "error");
        }
    } catch (e) {
        console.error("Password change error:", e);
        showNotification("Could not connect to backend.", "error");
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = origText; }
    }
}

function redirectToRoleDashboard() {
    const user = getCurrentUser();
    if (!user) {
        window.location.href = "login.html";
        return;
    }
    const role = (user.role || "").toUpperCase();
    if (role === "ADMIN") window.location.href = "admin/dashboard.html";
    else if (role === "DONOR") window.location.href = "donor/dashboard.html";
    else if (role === "NGO") window.location.href = "ngo/dashboard.html";
    else if (role === "VOLUNTEER") window.location.href = "volunteer/dashboard.html";
    else window.location.href = "index.html";
}

/* =========================================================================
   PHASE I — IN-APP NOTIFICATIONS LOGIC
   ========================================================================= */

async function loadUserNotifications() {
    const user = getCurrentUser();
    if (!user || !user.id) return;

    const loading = document.getElementById("notificationsLoading");
    const list = document.getElementById("notificationsList");
    const empty = document.getElementById("notificationsEmpty");

    try {
        const baseUrl = await getWorkingBackendUrl();
        const res = await fetch(`${baseUrl}/api/notifications/${user.id}`);
        if (!res.ok) throw new Error("Failed to load notifications");
        const data = await res.json();

        if (loading) loading.style.display = "none";

        const notifs = data.notifications || [];
        if (notifs.length === 0) {
            if (list) list.style.display = "none";
            if (empty) empty.style.display = "block";
            return;
        }

        if (empty) empty.style.display = "none";
        if (list) {
            list.style.display = "flex";
            list.innerHTML = "";

            notifs.forEach(n => {
                const item = document.createElement("div");
                item.className = `notif-item notif-${n.type || 'default'}`;
                const timeStr = n.timestamp ? new Date(n.timestamp).toLocaleString([], {
                    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
                }) : "Just now";

                item.innerHTML = `
                    <div class="notif-dot">●</div>
                    <div class="notif-body">
                        <div class="notif-msg">${escapeHtml(n.message)}</div>
                        <div class="notif-time">${timeStr}</div>
                    </div>
                `;
                list.appendChild(item);
            });
        }
    } catch (e) {
        console.warn("Could not load notifications:", e);
        if (loading) loading.style.display = "none";
    }
}

// Global window exposure for all new phases
window.initHistoryPage = initHistoryPage;
window.searchHistory = searchHistory;
window.initAdminDashboard = initAdminDashboard;
window.initAdminUsersPage = initAdminUsersPage;
window.filterUsers = filterUsers;
window.searchUsers = searchUsers;
window.toggleUserStatus = toggleUserStatus;
window.initAdminDeliveriesPage = initAdminDeliveriesPage;
window.filterAdminDeliveries = filterAdminDeliveries;
window.searchAdminDeliveries = searchAdminDeliveries;
window.initProfilePage = initProfilePage;
window.handleProfileUpdate = handleProfileUpdate;
window.handlePasswordChange = handlePasswordChange;
window.redirectToRoleDashboard = redirectToRoleDashboard;
window.loadUserNotifications = loadUserNotifications;