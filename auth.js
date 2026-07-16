// auth.js - Упрощенная система авторизации - Версия 2.1
// ВНИМАНИЕ: В учебных целях пароли хранятся в открытом виде.
// В реальном проекте необходимо использовать хеширование паролей!

class AuthSystem {
    constructor() {
        this.currentUser = null;
        this.users = [
            {
                id: 1,
                username: "AnnaM",
                password: "AnnaM123",
                email: "admin@example.com",
                fullName: "Администратор Системы",
                role: "admin",
                createdAt: "2025-12-12",
                description: "Полный доступ ко всем заданиям"
            },
            {
                id: 2,
                username: "AntonT",
                password: "AntonT123",
                email: "admin@example.com",
                fullName: "Администратор Системы",
                role: "admin",
                createdAt: "2025-12-12",
                description: "Полный доступ ко всем заданиям"
            }
        ];
        this.authChannel = null;
        this.init();
    }

    async init() {
        this.checkSession();
        this.initAuthChannel();
        this.updateAllAuthUI();
        console.log('AuthSystem инициализирован. Версия: 2.2');
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



    async login(username, password) {
        // Валидация входных данных
        if (!username || !password) {
            return { success: false, message: 'Имя пользователя и пароль обязательны' };
        }
        
        if (username.length < 3 || username.length > 50) {
            return { success: false, message: 'Имя пользователя должно быть от 3 до 50 символов' };
        }
        
        if (password.length < 6) {
            return { success: false, message: 'Пароль должен быть не менее 6 символов' };
        }
        
        // Санитизация ввода для защиты от XSS
        const sanitizedUsername = this.sanitizeInput(username);
        const sanitizedPassword = this.sanitizeInput(password);
        
        const user = this.users.find(u => u.username === sanitizedUsername && u.password === sanitizedPassword);
        
        if (user) {
            this.currentUser = {
                id: user.id,
                username: user.username,
                fullName: user.fullName,
                role: user.role,
                email: user.email
            };
            
            localStorage.setItem('sqlUser', JSON.stringify(this.currentUser));
            
            // Обновляем UI на всех страницах
            this.updateAllAuthUI();
            
            return { success: true, user: this.currentUser };
        }
        
        return { success: false, message: 'Неверное имя пользователя или пароль' };
    }

    logout() {
        this.currentUser = null;
        localStorage.removeItem('sqlUser');
        this.updateAllAuthUI();
        return { success: true };
    }

    checkSession() {
        const userData = localStorage.getItem('sqlUser');
        if (userData) {
            this.currentUser = JSON.parse(userData);
            return true;
        }
        return false;
    }

    isAuthenticated() {
        return this.currentUser !== null;
    }

    getCurrentUser() {
        return this.currentUser;
    }

    sanitizeInput(input) {
        if (typeof input !== 'string') return '';
        return input
            .replace(/[&<>'"]/g, function(m) {
                return {
                    '&': '&amp;',
                    '<': '&lt;',
                    '>': '&gt;',
                    "'": '&#39;',
                    '"': '&quot;'
                }[m];
            })
            .trim();
    }

    updateAllAuthUI() {
        // Обновляем UI на текущей странице
        this.updatePageAuthUI();
        
        // Отправляем событие для обновления других вкладок
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
        
        console.log('Текущая страница:', currentPage, 'Это главная?', isHomePage);
        
        // Обновляем статус в заголовке
        this.updateAuthStatus(isAuthenticated, user, isHomePage);
        
        // Обновляем кнопки входа/выхода
        this.updateAuthButtons(isAuthenticated, user, isHomePage);
        
        // Обновляем сообщения о доступе к ответам
        this.updateAnswerAccessMessages(isAuthenticated, user);
        
        // Обновляем поля для SQL-запросов
        if (window.updateQueryFields) {
            window.updateQueryFields(isAuthenticated);
        }
        
        // Обновляем сообщения на главной странице
        this.updateMainMessage(isAuthenticated, user);
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
        } else {
            return userInfoHTML + `
                <a href="index.html" class="btn btn-back">
                    <i class="fas fa-arrow-left"></i> На главную
                </a>
            ` + logoutButtonHTML;
        }
    }

    generateGuestButtonsHTML(isHomePage) {
        if (isHomePage) {
            return `
                <a href="login.html" class="btn btn-login">
                    <i class="fas fa-sign-in-alt"></i> Войти
                </a>
            `;
        } else {
            return `
                <a href="index.html" class="btn btn-back">
                    <i class="fas fa-arrow-left"></i> На главную
                </a>
            `;
        }
    }

    updateAnswerAccessMessages(isAuthenticated, user) {
        const answerAccessElements = document.querySelectorAll('.answer-access-message');
        answerAccessElements.forEach(el => {
            if (isAuthenticated) {
                const safeFullName = this.sanitizeInput(user.fullName);
                el.innerHTML = `<i class="fas fa-check-circle" style="color: #2e7d32;"></i> Ответы доступны (вы авторизованы как ${safeFullName})`;
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
                mainMessage.innerHTML = `Добро пожаловать, <strong>${safeFullName}</strong>! У вас есть доступ ко всем ответам на задания.`;
            } else {
                mainMessage.innerHTML = 'Доступ к заданиям открыт для всех. Задания все одинаковой сложности и уровня знаний. Пожалуйста, включите демонстрацию экрана перед выбором задания!';
            }
        }
    }
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
