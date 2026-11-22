/**
 * Athyx Network — Client Authentication & Gateway System
 * Powered by Firebase Auth & Firestore
 */

import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { 
  getAuth, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  updateProfile 
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import { 
  getFirestore, 
  doc, 
  getDoc, 
  setDoc, 
  serverTimestamp 
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

// Athyx Firebase Config
export const firebaseConfig = {
  apiKey: 'AIzaSyD6Yxgw8mvgQRmn87PtyfKl-pEUlbLRl7A',
  authDomain: 'athyx-network.firebaseapp.com',
  projectId: 'athyx-network',
  storageBucket: 'athyx-network.firebasestorage.app',
  messagingSenderId: '159446068149',
  appId: '1:159446068149:web:60062fc1ccb5b83e8e47fc'
};

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Helper: Persistent Device ID (Required by firestore.rules validOwnProfile)
function getOrCreateDeviceId() {
  let id = localStorage.getItem('athyx_device_id');
  if (!id || id.length < 5) {
    id = 'dev_' + (crypto.randomUUID ? crypto.randomUUID() : (Math.random().toString(36).substring(2, 12) + Date.now().toString(36)));
    localStorage.setItem('athyx_device_id', id);
  }
  return id;
}

// Convert username to Athyx internal email for Firebase Auth
function usernameToEmail(username) {
  const clean = username.trim().toLowerCase();
  if (clean.includes('@')) return clean;
  return `${clean}@athyx-network.local`;
}

// State
let isSignUpMode = false;
let currentUser = null;

// DOM Elements
let gatewayOverlay = null;
let authForm = null;
let usernameInput = null;
let passwordInput = null;
let confirmPwInput = null;
let confirmPwGroup = null;
let submitBtn = null;
let alertBox = null;
let alertText = null;
let tabSignInBtn = null;
let tabSignUpBtn = null;
let tabSlider = null;
let togglePwBtn = null;
let togglePwIcon = null;
let toggleLink = null;
let footerText = null;
let userProfileBtn = null;
let userProfileName = null;
let userDropdownMenu = null;
let userLogoutBtn = null;

function showAlert(message) {
  if (!alertBox || !alertText) return;
  alertText.textContent = message;
  alertBox.style.display = 'flex';
}

function hideAlert() {
  if (!alertBox) return;
  alertBox.style.display = 'none';
}

function setFormLoading(loading) {
  if (!submitBtn) return;
  submitBtn.disabled = loading;
  if (loading) {
    submitBtn.classList.add('loading');
  } else {
    submitBtn.classList.remove('loading');
  }
}

function setMode(signUp) {
  isSignUpMode = signUp;
  hideAlert();

  if (tabSlider) {
    if (signUp) tabSlider.classList.add('right');
    else tabSlider.classList.remove('right');
  }

  if (tabSignInBtn && tabSignUpBtn) {
    tabSignInBtn.classList.toggle('active', !signUp);
    tabSignUpBtn.classList.toggle('active', signUp);
  }

  if (confirmPwGroup) {
    confirmPwGroup.style.display = signUp ? 'flex' : 'none';
    if (confirmPwInput) confirmPwInput.required = signUp;
  }

  const btnText = document.getElementById('authBtnText');
  if (btnText) {
    btnText.textContent = signUp ? 'Create Account' : 'Log In';
  }

  if (footerText && toggleLink) {
    if (signUp) {
      footerText.textContent = 'Already have an account?';
      toggleLink.innerHTML = 'Log in &rarr;';
    } else {
      footerText.textContent = "Don't have an account?";
      toggleLink.innerHTML = 'Create one now &rarr;';
    }
  }
}

async function handleFormSubmit(e) {
  if (e) e.preventDefault();
  hideAlert();

  const rawUsername = usernameInput ? usernameInput.value.trim() : '';
  const password = passwordInput ? passwordInput.value : '';
  const confirmPassword = confirmPwInput ? confirmPwInput.value : '';

  // Validation
  if (!rawUsername) {
    showAlert('Please enter your username.');
    return;
  }

  // Username validation: 3-20 characters, no spaces, letters, numbers, dash, underscore
  const usernameRegex = /^[a-zA-Z0-9_-]{3,20}$/;
  if (!usernameRegex.test(rawUsername)) {
    showAlert('Username must be 3-20 characters and contain only letters, numbers, hyphens, or underscores (no spaces).');
    return;
  }

  if (!password || password.length < 6) {
    showAlert('Password must be at least 6 characters.');
    return;
  }

  if (isSignUpMode) {
    if (password !== confirmPassword) {
      showAlert('Passwords do not match. Please re-type your password.');
      return;
    }
  }

  const email = usernameToEmail(rawUsername);
  setFormLoading(true);

  if (isSignUpMode) {
    // --- SIGN UP FLOW ---
    try {
      // 1. Check if username is already registered in usernames collection
      const usernameDocRef = doc(db, 'usernames', rawUsername.toLowerCase());
      const usernameSnap = await getDoc(usernameDocRef);
      if (usernameSnap.exists()) {
        showAlert('This username is already taken. Please choose another username.');
        setFormLoading(false);
        return;
      }

      // 2. Create user in Firebase Auth
      const userCred = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCred.user;

      // 3. Update Auth Profile Display Name
      await updateProfile(user, { displayName: rawUsername });

      // 4. Register in Firestore usernames collection
      await setDoc(usernameDocRef, {
        uid: user.uid,
        email: email
      });

      // 5. Register user profile in Firestore users collection
      const deviceId = getOrCreateDeviceId();
      await setDoc(doc(db, 'users', user.uid), {
        nickname: rawUsername,
        username: rawUsername,
        role: 'member',
        banned: false,
        deviceId: deviceId
      });

      localStorage.setItem('athyx_user', rawUsername);
      console.log('[Athyx Auth] Successfully created account for:', rawUsername);

    } catch (err) {
      console.error('[Athyx Auth] Sign up error:', err);
      let msg = 'Failed to create account. Please try again.';
      if (err.code === 'auth/email-already-in-use') {
        msg = 'This username is already registered. Try logging in instead.';
      } else if (err.code === 'auth/weak-password') {
        msg = 'Password should be at least 6 characters.';
      } else if (err.code === 'auth/network-request-failed') {
        msg = 'Network connection error. Check your internet connection.';
      } else if (err.message) {
        msg = err.message;
      }
      showAlert(msg);
      setFormLoading(false);
    }

  } else {
    // --- LOG IN FLOW ---
    try {
      const userCred = await signInWithEmailAndPassword(auth, email, password);
      const user = userCred.user;
      const username = user.displayName || rawUsername;
      localStorage.setItem('athyx_user', username);
      console.log('[Athyx Auth] Logged in as:', username);

    } catch (err) {
      console.error('[Athyx Auth] Log in error:', err);
      let msg = 'Invalid username or password.';
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        msg = 'Incorrect username or password. Please try again.';
      } else if (err.code === 'auth/too-many-requests') {
        msg = 'Too many failed login attempts. Please wait a few moments and try again.';
      } else if (err.code === 'auth/network-request-failed') {
        msg = 'Network error. Please check your connection.';
      }
      showAlert(msg);
      setFormLoading(false);
    }
  }
}

// Unlock UI when authenticated
function unlockGateway(user) {
  currentUser = user;
  const username = user?.displayName || localStorage.getItem('athyx_user') || 'Member';
  localStorage.setItem('athyx_user', username);
  document.documentElement.classList.add('auth-session-present');

  // Smoothly unlock and hide gateway overlay
  if (gatewayOverlay) {
    gatewayOverlay.classList.add('unlocked');
  }

  // If school disguise is open, unlock it automatically
  if (typeof window.unlockSchoolDisguise === 'function') {
    try { window.unlockSchoolDisguise(); } catch(e) {}
  } else {
    const disguise = document.getElementById("school-disguise-site");
    if (disguise) {
      disguise.classList.add("unlocked");
      setTimeout(() => { disguise.style.display = "none"; }, 300);
    }
  }

  // Update navbar user pill
  if (userProfileName) {
    userProfileName.textContent = username;
  }
  const dropdownName = document.getElementById('dropdown-user-name');
  if (dropdownName) dropdownName.textContent = username;

  const dropdownAvatar = document.getElementById('dropdown-avatar-char');
  if (dropdownAvatar && username) {
    dropdownAvatar.textContent = username.charAt(0).toUpperCase();
  }

  setFormLoading(false);
}

// Lock UI when not authenticated
function lockGateway() {
  currentUser = null;
  localStorage.removeItem('athyx_user');
  document.documentElement.classList.remove('auth-session-present');
  if (gatewayOverlay) {
    gatewayOverlay.classList.remove('unlocked');
  }
  if (userProfileName) {
    userProfileName.textContent = 'Account';
  }
  if (userDropdownMenu) {
    userDropdownMenu.classList.remove('show');
  }
  setFormLoading(false);
}

// Sign out
export async function logOutUser() {
  try {
    localStorage.removeItem('athyx_user');
    document.documentElement.classList.remove('auth-session-present');
    await signOut(auth);
    lockGateway();
  } catch (err) {
    console.error('[Athyx Auth] Sign out error:', err);
  }
}

// Initialize Auth DOM bindings and listeners
export function initAuth() {
  gatewayOverlay = document.getElementById('athyx-auth-gateway');
  authForm = document.getElementById('authForm');
  usernameInput = document.getElementById('authUsername');
  passwordInput = document.getElementById('authPassword');
  confirmPwInput = document.getElementById('authConfirmPassword');
  confirmPwGroup = document.getElementById('confirmPwGroup');
  submitBtn = document.getElementById('authSubmitBtn');
  alertBox = document.getElementById('authAlert');
  alertText = document.getElementById('authAlertText');
  tabSignInBtn = document.getElementById('tabSignInBtn');
  tabSignUpBtn = document.getElementById('tabSignUpBtn');
  tabSlider = document.getElementById('authTabSlider');
  togglePwBtn = document.getElementById('togglePwBtn');
  togglePwIcon = document.getElementById('togglePwIcon');
  toggleLink = document.getElementById('authToggleLink');
  footerText = document.getElementById('authFooterText');
  userProfileBtn = document.getElementById('user-profile-btn');
  userProfileName = document.getElementById('user-profile-name');
  userDropdownMenu = document.getElementById('user-dropdown-menu');
  userLogoutBtn = document.getElementById('user-logout-btn');

  // Tab switching
  if (tabSignInBtn) tabSignInBtn.onclick = () => setMode(false);
  if (tabSignUpBtn) tabSignUpBtn.onclick = () => setMode(true);
  if (toggleLink) toggleLink.onclick = () => setMode(!isSignUpMode);

  // Form submit
  if (authForm) authForm.onsubmit = handleFormSubmit;

  // Toggle password visibility
  if (togglePwBtn && passwordInput && togglePwIcon) {
    togglePwBtn.onclick = () => {
      const isPw = passwordInput.type === 'password';
      passwordInput.type = isPw ? 'text' : 'password';
      togglePwIcon.className = isPw ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
    };
  }

  // Account dropdown in navigation
  if (userProfileBtn && userDropdownMenu) {
    userProfileBtn.onclick = (e) => {
      e.stopPropagation();
      userDropdownMenu.classList.toggle('show');
    };
  }

  if (userLogoutBtn) {
    userLogoutBtn.onclick = (e) => {
      e.stopPropagation();
      logOutUser();
    };
  }

  document.addEventListener('click', (e) => {
    if (userDropdownMenu && !userDropdownMenu.contains(e.target) && e.target !== userProfileBtn) {
      userDropdownMenu.classList.remove('show');
    }
  });

  // Listen to Firebase Auth state
  onAuthStateChanged(auth, (user) => {
    if (user) {
      console.log('[Athyx Auth] Session detected:', user.uid, user.displayName);
      unlockGateway(user);
    } else {
      console.log('[Athyx Auth] No active session. Gateway locked.');
      lockGateway();
    }
  });
}

// Auto-run when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAuth);
} else {
  initAuth();
}
