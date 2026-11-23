// auth.js - Система авторизации - Версия 3.0
//
// Пароли не хранятся в открытом виде: для каждого пользователя сохраняются
// случайная соль и SHA-256(salt:password). Вычисление хеша - через Web Crypto,
// при его недоступности используется встроенный JS-фолбэк.
// После 5 неудачных попыток вход блокируется на 5 минут.
//
// ВАЖНО: это статический сайт, поэтому клиентскую защиту можно обойти.
// Для реальной защиты учётных данных нужен серверный бэкенд.

class AuthSystem {
    constructor() {
        this.currentUser = null;

        // Учётные записи: username, соль и SHA-256(salt:password).
        // Запись для нового пользователя можно сгенерировать консольным
        // скриптом из README (раздел "Настройка пользователей").
        this.users = [
            {
                id: 1,
                username: 'AnnaM',
                salt: '832e3f80acb6b81c7998b02b8eb35a20',
                hash: 'c7202021ee9cf33743416a50cd37d1dcbccc55f7f09c06d05be46e5ab77c1817',
                email: 'admin@example.com',
                fullName: 'Администратор Системы',
                role: 'admin',
                createdAt: '2025-12-12',
                description: 'Полный доступ ко всем заданиям'
            },
            {
                id: 2,
                username: 'AntonT',
                salt: '75b3b8a8c84a6c569aafd9127a9d1366',
                hash: '223196c42c2b5dd1863486b8a422af48153d735933ec57d6ad15e22ac81a78d1',
                email: 'admin@example.com',
                fullName: 'Администратор Системы',
                role: 'admin',
                createdAt: '2025-12-12',
                description: 'Полный доступ ко всем заданиям'
            }
        ];

        this.maxFailedAttempts = 5;
        this.lockDurationSeconds = 300;
        this.failedAttemptsKey = 'sqlAuthFailedAttempts';
        this.lockUntilKey = 'sqlAuthLockUntil';

        this.authChannel = null;
        this.init();
    }

    async init() {
        this.checkSession();
        this.initAuthChannel();
        this.initStorageSync();
        this.updateAllAuthUI();
    }

    // ------------------------------------------------------------ //
    // Хеширование                                                   //
    // ------------------------------------------------------------ //

    async sha256Hex(text) {
        if (window.crypto && window.crypto.subtle && typeof TextEncoder !== 'undefined') {
            const data = new TextEncoder().encode(text);
            const digest = await window.crypto.subtle.digest('SHA-256', data);
            return bytesToHex(new Uint8Array(digest));
        }
        return sha256HexFallback(text);
    }

    // Сравнение строк за время, не зависящее от позиции первого различия
    safeEquals(left, right) {
        if (left.length !== right.length) {
            return false;
        }
        let diff = 0;
        for (let i = 0; i < left.length; i++) {
            diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
        }
        return diff === 0;
    }

    // ------------------------------------------------------------ //
    // Вход / выход                                                  //
    // ------------------------------------------------------------ //

    async login(username, password) {
        const lockState = this.getLockState();
        if (lockState.isLocked) {
            return {
                success: false,
                isLocked: true,
                message: 'Слишком много неудачных попыток. Повторите через ' + this.formatSeconds(lockState.secondsRemaining) + '.'
            };
        }

        const validationError = this.validateCredentials(username, password);
        if (validationError) {
            return { success: false, message: validationError };
        }

        const sanitizedUsername = this.sanitizeInput(username);
        // Пароль экранировать нельзя: хеш считается по фактическому значению
        const trimmedPassword = password.trim();
        const user = this.users.find(u => u.username === sanitizedUsername);

        if (user) {
            const computedHash = await this.sha256Hex(user.salt + ':' + trimmedPassword);
            if (this.safeEquals(computedHash, user.hash)) {
                this.resetFailedAttempts();
                this.currentUser = {
                    id: user.id,
                    username: user.username,
                    fullName: user.fullName,
                    role: user.role,
                    email: user.email
                };
                localStorage.setItem('sqlUser', JSON.stringify(this.currentUser));
                this.updateAllAuthUI();
                return { success: true, user: this.currentUser };
            }
        }

        return this.registerFailedAttempt();
    }

    validateCredentials(username, password) {
        if (!username || !password) {
            return 'Имя пользователя и пароль обязательны';
        }
        if (username.length < 3 || username.length > 50) {
            return 'Имя пользователя должно быть от 3 до 50 символов';
        }
        if (password.length < 6) {
            return 'Пароль должен быть не менее 6 символов';
        }
        return null;
    }

    registerFailedAttempt() {
        const attempts = this.getFailedAttempts() + 1;
        localStorage.setItem(this.failedAttemptsKey, String(attempts));

        if (attempts >= this.maxFailedAttempts) {
            localStorage.setItem(this.lockUntilKey, String(Date.now() + this.lockDurationSeconds * 1000));
            localStorage.setItem(this.failedAttemptsKey, '0');
            return {
                success: false,
                isLocked: true,
                message: 'Слишком много неудачных попыток. Вход заблокирован на ' + this.formatSeconds(this.lockDurationSeconds) + '.'
            };
        }

        const attemptsLeft = this.maxFailedAttempts - attempts;
        return {
            success: false,
            attemptsLeft: attemptsLeft,
            message: 'Неверное имя пользователя или пароль. Осталось попыток: ' + attemptsLeft
        };
    }

    getFailedAttempts() {
        return Number(localStorage.getItem(this.failedAttemptsKey)) || 0;
    }

    resetFailedAttempts() {
        localStorage.removeItem(this.failedAttemptsKey);
        localStorage.removeItem(this.lockUntilKey);
    }

    getLockState() {
        const lockUntil = Number(localStorage.getItem(this.lockUntilKey)) || 0;
        const secondsRemaining = Math.max(0, Math.ceil((lockUntil - Date.now()) / 1000));
        return {
            isLocked: secondsRemaining > 0,
            secondsRemaining: secondsRemaining,
            attemptsLeft: Math.max(0, this.maxFailedAttempts - this.getFailedAttempts()),
            maxAttempts: this.maxFailedAttempts
        };
    }

    formatSeconds(totalSeconds) {
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        if (minutes === 0) {
            return seconds + ' сек.';
        }
        return minutes + ' мин. ' + seconds + ' сек.';
    }

    logout() {
        this.currentUser = null;
        localStorage.removeItem('sqlUser');
        this.updateAllAuthUI();
        return { success: true };
    }

    // ------------------------------------------------------------ //
    // Сессия и синхронизация вкладок                                //
    // ------------------------------------------------------------ //

    checkSession() {
        const userData = localStorage.getItem('sqlUser');
        if (userData) {
            try {
                this.currentUser = JSON.parse(userData);
            } catch (error) {
                this.currentUser = null;
                localStorage.removeItem('sqlUser');
            }
            return this.currentUser !== null;
        }
        return false;
    }

    isAuthenticated() {
        return this.currentUser !== null;
    }

    getCurrentUser() {
        return this.currentUser;
    }

    initAuthChannel() {
        if (typeof BroadcastChannel !== 'undefined') {
            this.authChannel = new BroadcastChannel('auth_channel');
            this.authChannel.onmessage = (event) => {
                if (event.data.type === 'auth_update') {
                    this.currentUser = event.data.user;
                    this.updatePageAuthUI();
                }
            };
        }
    }

    initStorageSync() {
        window.addEventListener('storage', (event) => {
            if (event.key === 'sqlUser') {
                this.currentUser = event.newValue ? JSON.parse(event.newValue) : null;
                this.updatePageAuthUI();
            }
        });
    }

    // ------------------------------------------------------------ //
    // Отрисовка интерфейса                                          //
    // ------------------------------------------------------------ //

    sanitizeInput(input) {
        if (typeof input !== 'string') return '';
        return input
            .replace(/[&<>'"]/g, function (m) {
                return {
                    '&': '&' + 'amp;',
                    '<': '&' + 'lt;',
                    '>': '&' + 'gt;',
                    "'": '&#39;',
                    '"': '&' + 'quot;'
                }[m];
            })
            .trim();
    }

    updateAllAuthUI() {
        this.updatePageAuthUI();

        if (this.authChannel) {
            this.authChannel.postMessage({ type: 'auth_update', user: this.currentUser });
        }
    }

    updatePageAuthUI() {
        const isAuthenticated = this.isAuthenticated();
        const user = this.currentUser;
        const currentPath = window.location.pathname;
        const currentPage = currentPath.split('/').pop() || '';
        const isHomePage = currentPage === 'index.html' ||
                          currentPage === '' ||
                          currentPath.endsWith('/');

        this.updateAuthStatus(isAuthenticated, user, isHomePage);
        this.updateAuthButtons(isAuthenticated, user, isHomePage);
        this.updateAnswerAccessMessages(isAuthenticated, user);
        this.updateMainMessage(isAuthenticated, user);

        // Хук для страниц вариантов: sql-checker.js обновляет
        // доступность кнопок "Показать решение"
        if (typeof window.onAuthStateChanged === 'function') {
            window.onAuthStateChanged(isAuthenticated, user);
        }
    }

    updateAuthStatus(isAuthenticated, user, isHomePage) {
        const authStatusElements = document.querySelectorAll('.auth-status');
        authStatusElements.forEach(el => {
            if (isAuthenticated) {
                const safeFullName = this.sanitizeInput(user.fullName);
                el.innerHTML = `<i class="fas fa-user-check" style="color: #2e7d32;"></i> Авторизован как <strong>${safeFullName}</strong>`;
            } else {
                if (isHomePage) {
                    el.innerHTML = '<i class="fas fa-user" style="color: #6c757d;"></i> Не авторизован';
                } else {
                    el.innerHTML = '';
                }
            }
        });
    }

    updateAuthButtons(isAuthenticated, user, isHomePage) {
        const authButtons = document.querySelectorAll('.auth-buttons');
        authButtons.forEach(container => {
            if (isAuthenticated) {
                container.innerHTML = this.generateAuthButtonsHTML(user, isHomePage);
            } else {
                container.innerHTML = this.generateGuestButtonsHTML(isHomePage);
            }
        });
    }

    generateAuthButtonsHTML(user, isHomePage) {
        const safeFullName = this.sanitizeInput(user.fullName);
        const userInfoHTML = `
            <div class="user-info-mini">
                <span class="user-avatar-mini">${safeFullName.charAt(0)}</span>
                <span class="user-name-mini">${safeFullName}</span>
            </div>
        `;

        const logoutButtonHTML = `
            <button class="btn btn-logout" onclick="window.authSystem.logout()">
                <i class="fas fa-sign-out-alt"></i> Выйти
            </button>
        `;

        if (isHomePage) {
            return userInfoHTML + logoutButtonHTML;
        }
        return userInfoHTML + `
            <a href="index.html" class="btn btn-back">
                <i class="fas fa-arrow-left"></i> На главную
            </a>
        ` + logoutButtonHTML;
    }

    generateGuestButtonsHTML(isHomePage) {
        if (isHomePage) {
            return `
                <a href="login.html" class="btn btn-login">
                    <i class="fas fa-sign-in-alt"></i> Войти
                </a>
            `;
        }
        return `
            <a href="index.html" class="btn btn-back">
                <i class="fas fa-arrow-left"></i> На главную
            </a>
        `;
    }

    updateAnswerAccessMessages(isAuthenticated, user) {
        const answerAccessElements = document.querySelectorAll('.answer-access-message');
        answerAccessElements.forEach(el => {
            if (isAuthenticated) {
                const safeFullName = this.sanitizeInput(user.fullName);
                el.innerHTML = `<i class="fas fa-check-circle" style="color: #2e7d32;"></i> Ответы доступны (вы авторизованы как ${safeFullName}). Рядом с каждым заданием есть кнопка «Показать решение».`;
                el.style.display = 'block';
            } else {
                el.style.display = 'none';
            }
        });
    }

    updateMainMessage(isAuthenticated, user) {
        const mainMessage = document.getElementById('mainAuthMessage');
        if (mainMessage) {
            if (isAuthenticated) {
                const safeFullName = this.sanitizeInput(user.fullName);
                mainMessage.innerHTML = `Добро пожаловать, <strong>${safeFullName}</strong>! Вам доступны эталонные решения всех заданий.`;
            } else {
                mainMessage.innerHTML = 'Задания проверяются автоматически прямо в браузере. Пожалуйста, включите демонстрацию экрана перед выбором задания!';
            }
        }
    }
}

// ------------------------------------------------------------ //
// JS-фолбэк SHA-256 (используется, если недоступен Web Crypto)  //
// ------------------------------------------------------------ //

const SHA256_K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
];

function bytesToHex(bytes) {
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function utf8Encode(text) {
    const bytes = [];
    for (let i = 0; i < text.length; i++) {
        const code = text.codePointAt(i);
        if (code > 0xffff) {
            i++;
        }
        if (code < 0x80) {
            bytes.push(code);
        } else if (code < 0x800) {
            bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
        } else if (code < 0x10000) {
            bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
        } else {
            bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
        }
    }
    return bytes;
}

function rotateRight(value, bits) {
    return (value >>> bits) | (value << (32 - bits));
}

function sha256HexFallback(text) {
    const message = utf8Encode(text);
    const messageBitLength = message.length * 8;
    const paddedLength = (((message.length + 8) >> 6) + 1) << 6;

    const padded = message.slice();
    padded.push(0x80);
    while (padded.length < paddedLength) {
        padded.push(0);
    }
    padded[paddedLength - 8] = Math.floor(messageBitLength / 0x100000000) & 0xff;
    padded[paddedLength - 4] = (messageBitLength >>> 24) & 0xff;
    padded[paddedLength - 3] = (messageBitLength >>> 16) & 0xff;
    padded[paddedLength - 2] = (messageBitLength >>> 8) & 0xff;
    padded[paddedLength - 1] = messageBitLength & 0xff;

    const hash = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];

    for (let offset = 0; offset < paddedLength; offset += 64) {
        const w = new Array(64);
        for (let i = 0; i < 16; i++) {
            w[i] = (padded[offset + i * 4] << 24) |
                   (padded[offset + i * 4 + 1] << 16) |
                   (padded[offset + i * 4 + 2] << 8) |
                    padded[offset + i * 4 + 3];
        }
        for (let i = 16; i < 64; i++) {
            const s0 = rotateRight(w[i - 15], 7) ^ rotateRight(w[i - 15], 18) ^ (w[i - 15] >>> 3);
            const s1 = rotateRight(w[i - 2], 17) ^ rotateRight(w[i - 2], 19) ^ (w[i - 2] >>> 10);
            w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
        }

        let a = hash[0], b = hash[1], c = hash[2], d = hash[3];
        let e = hash[4], f = hash[5], g = hash[6], h = hash[7];

        for (let i = 0; i < 64; i++) {
            const s1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
            const ch = (e & f) ^ (~e & g);
            const temp1 = (h + s1 + ch + SHA256_K[i] + w[i]) | 0;
            const s0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
            const maj = (a & b) ^ (a & c) ^ (b & c);
            const temp2 = (s0 + maj) | 0;

            h = g; g = f; f = e;
            e = (d + temp1) | 0;
            d = c; c = b; b = a;
            a = (temp1 + temp2) | 0;
        }

        hash[0] = (hash[0] + a) | 0;
        hash[1] = (hash[1] + b) | 0;
        hash[2] = (hash[2] + c) | 0;
        hash[3] = (hash[3] + d) | 0;
        hash[4] = (hash[4] + e) | 0;
        hash[5] = (hash[5] + f) | 0;
        hash[6] = (hash[6] + g) | 0;
        hash[7] = (hash[7] + h) | 0;
    }

    return bytesToHex(hash.flatMap(value => [
        (value >>> 24) & 0xff,
        (value >>> 16) & 0xff,
        (value >>> 8) & 0xff,
        value & 0xff
    ]));
}

// Создаем глобальный экземпляр
window.authSystem = new AuthSystem();

// Функции для удобного доступа
window.checkAuth = () => window.authSystem.isAuthenticated();
window.getCurrentUser = () => window.authSystem.getCurrentUser();
window.logout = () => {
    window.authSystem.logout();
    window.location.reload();
};

// Обновляем UI при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        window.authSystem.updatePageAuthUI();
    }, 100);
});
