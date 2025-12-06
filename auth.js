// auth.js - Упрощенная система авторизации - Версия 2.0

class AuthSystem {
    constructor() {
        this.currentUser = null;
        this.users = [];
        this.init();
    }

    async init() {
        await this.loadUsers();
        this.checkSession();
        this.updateAllAuthUI();
        console.log('AuthSystem инициализирован. Версия: 2.0');
    }

    async loadUsers() {
        try {
            const response = await fetch('users.json');
            this.users = await response.json();
        } catch (error) {
            console.error('Ошибка загрузки пользователей:', error);
            this.users = [
                {
                    id: 1,
                    username: 'admin',
                    password: 'admin123',
                    email: 'admin@example.com',
                    fullName: 'Администратор',
                    role: 'admin',
                    createdAt: '2023-01-01'
                },
                {
                    id: 2,
                    username: 'student',
                    password: 'student123',
                    email: 'student@example.com',
                    fullName: 'Студент',
                    role: 'student',
                    createdAt: '2023-01-01'
                },
                {
                    id: 3,
                    username: 'teacher',
                    password: 'teacher123',
                    email: 'teacher@example.com',
                    fullName: 'Преподаватель',
                    role: 'teacher',
                    createdAt: '2023-02-01'
                },
                {
                    id: 4,
                    username: 'test',
                    password: 'test123',
                    email: 'test@example.com',
                    fullName: 'Тестовый Пользователь',
                    role: 'student',
                    createdAt: '2023-02-15'
                }
            ];
        }
    }

    async login(username, password) {
        const user = this.users.find(u => u.username === username && u.password === password);
        
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

    updateAllAuthUI() {
        // Обновляем UI на текущей странице
        this.updatePageAuthUI();
        
        // Отправляем событие для обновления других вкладок
        if (typeof BroadcastChannel !== 'undefined') {
            const channel = new BroadcastChannel('auth_channel');
            channel.postMessage({ type: 'auth_update', user: this.currentUser });
        }
        
        // Сохраняем в sessionStorage для обновления текущей вкладки
        sessionStorage.setItem('authUpdate', Date.now().toString());
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
        const authStatusElements = document.querySelectorAll('.auth-status');
        authStatusElements.forEach(el => {
            if (isAuthenticated) {
                el.innerHTML = `<i class="fas fa-user-check" style="color: #2e7d32;"></i> Авторизован как <strong>${user.fullName}</strong>`;
            } else {
                if (isHomePage) {
                    el.innerHTML = '<i class="fas fa-user" style="color: #6c757d;"></i> Не авторизован';
                } else {
                    el.innerHTML = ''; // Убираем статус для неавторизованных на страницах вариантов
                }
            }
        });
        
        // Обновляем кнопки входа/выхода
        const authButtons = document.querySelectorAll('.auth-buttons');
        authButtons.forEach(container => {
            if (isAuthenticated) {
                // Для авторизованных пользователей
                if (isHomePage) {
                    // На главной странице показываем инфо пользователя и кнопку выхода
                    container.innerHTML = `
                        <div class="user-info-mini">
                            <span class="user-avatar-mini">${user.fullName.charAt(0)}</span>
                            <span class="user-name-mini">${user.fullName}</span>
                        </div>
                        <button class="btn btn-logout" onclick="window.authSystem.logout()">
                            <i class="fas fa-sign-out-alt"></i> Выйти
                        </button>
                    `;
                } else {
                    // На страницах вариантов показываем инфо пользователя, кнопку на главную и выход
                    container.innerHTML = `
                        <div class="user-info-mini">
                            <span class="user-avatar-mini">${user.fullName.charAt(0)}</span>
                            <span class="user-name-mini">${user.fullName}</span>
                        </div>
                        <a href="index.html" class="btn btn-back">
                            <i class="fas fa-arrow-left"></i>
                            На главную
                        </a>
                        <button class="btn btn-logout" onclick="window.authSystem.logout()">
                            <i class="fas fa-sign-out-alt"></i> Выйти
                        </button>
                    `;
                }
            } else {
                // Для неавторизованных пользователей
                if (isHomePage) {
                    // На главной странице показываем только кнопку входа
                    container.innerHTML = `
                        <a href="login.html" class="btn btn-login">
                            <i class="fas fa-sign-in-alt"></i> Войти
                        </a>
                    `;
                } else {
                    // На страницах вариантов показываем ТОЛЬКО кнопку на главную
                    container.innerHTML = `
                        <a href="index.html" class="btn btn-back">
                            <i class="fas fa-arrow-left"></i>
                            На главную
                        </a>
                    `;
                }
            }
        });
        
        // Обновляем сообщения о доступе к ответам
        const answerAccessElements = document.querySelectorAll('.answer-access-message');
        answerAccessElements.forEach(el => {
            if (isAuthenticated) {
                el.innerHTML = `<i class="fas fa-check-circle" style="color: #2e7d32;"></i> Ответы доступны (вы авторизованы как ${user.fullName})`;
                el.style.display = 'block';
            } else {
                el.style.display = 'none'; // Скрываем сообщение для неавторизованных
            }
        });
        
        // Обновляем поля для SQL-запросов
        if (window.updateQueryFields) {
            window.updateQueryFields(isAuthenticated);
        }
        
        // Обновляем сообщения на главной странице
        const mainMessage = document.getElementById('mainAuthMessage');
        if (mainMessage) {
            if (isAuthenticated) {
                mainMessage.innerHTML = `Добро пожаловать, <strong>${user.fullName}</strong>! У вас есть доступ ко всем ответам на задания.`;
            } else {
                mainMessage.innerHTML = 'Доступ к заданиям открыт для всех . Задания все одинаковой сложности и уровня знаний.';
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

// Обработка сообщений между вкладками
if (typeof BroadcastChannel !== 'undefined') {
    const authChannel = new BroadcastChannel('auth_channel');
    authChannel.onmessage = (event) => {
        if (event.data.type === 'auth_update') {
            window.authSystem.currentUser = event.data.user;
            window.authSystem.updatePageAuthUI();
        }
    };
}

// Проверяем обновления аутентификации
setInterval(() => {
    const lastUpdate = sessionStorage.getItem('authUpdate');
    if (lastUpdate && Date.now() - parseInt(lastUpdate) < 1000) {
        window.authSystem.updatePageAuthUI();
    }
}, 500);

// Обновляем UI при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        window.authSystem.updatePageAuthUI();
    }, 100);
});
