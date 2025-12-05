// auth.js - Система авторизации

class AuthSystem {
    constructor() {
        this.currentUser = null;
        this.users = [];
        this.init();
    }

    async init() {
        // Загружаем пользователей из файла
        await this.loadUsers();
        // Проверяем, есть ли сохраненная сессия
        this.checkSession();
    }

    async loadUsers() {
        try {
            const response = await fetch('users.json');
            this.users = await response.json();
        } catch (error) {
            console.error('Ошибка загрузки пользователей:', error);
            // Создаем дефолтных пользователей, если файл не найден
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
                role: user.role
            };
            
            // Сохраняем в localStorage
            localStorage.setItem('currentUser', JSON.stringify(this.currentUser));
            localStorage.setItem('isAuthenticated', 'true');
            
            return { success: true, user: this.currentUser };
        }
        
        return { success: false, message: 'Неверное имя пользователя или пароль' };
    }

    logout() {
        this.currentUser = null;
        localStorage.removeItem('currentUser');
        localStorage.removeItem('isAuthenticated');
        window.location.href = 'login.html';
    }

    checkSession() {
        const userData = localStorage.getItem('currentUser');
        const isAuthenticated = localStorage.getItem('isAuthenticated');
        
        if (userData && isAuthenticated === 'true') {
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

    requireAuth(redirectUrl = 'login.html') {
        if (!this.isAuthenticated()) {
            window.location.href = redirectUrl;
            return false;
        }
        return true;
    }
}

// Создаем глобальный экземпляр
window.authSystem = new AuthSystem();

// Вспомогательные функции
function checkAuth() {
    return window.authSystem.isAuthenticated();
}

function logout() {
    window.authSystem.logout();
}

function getCurrentUser() {
    return window.authSystem.getCurrentUser();
}
