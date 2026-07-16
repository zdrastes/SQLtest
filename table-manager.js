// table-manager.js - Общий модуль для управления таблицами во всех вариантах

class TableManager {
    constructor(database, tableNames, defaultQueries) {
        this.database = database;
        this.tableNames = tableNames;
        this.defaultQueries = defaultQueries;
        this.currentTable = tableNames[0];
    }

    // Инициализация менеджера таблиц
    init() {
        this.renderTableData(this.currentTable);
        this.setupTableTabs();
        this.setupQueryFields();
    }

    // Настройка вкладок таблиц
    setupTableTabs() {
        document.querySelectorAll('.table-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                this.switchTable(tab.dataset.table);
            });
        });
    }

    // Настройка полей запросов
    setupQueryFields() {
        // Глобальная функция для обновления полей запросов
        window.updateQueryFields = (isAuthenticated) => {
            for (let i = 1; i <= 7; i++) {
                const textarea = document.getElementById(`query${i}`);
                if (textarea) {
                    if (isAuthenticated) {
                        textarea.value = this.defaultQueries[i] || '';
                    } else {
                        textarea.value = '';
                    }
                }
            }
        };
    }

    // Переключение таблицы
    switchTable(tableName) {
        this.currentTable = tableName;
        
        document.querySelectorAll('.table-tab').forEach(tab => {
            if (tab.dataset.table === tableName) {
                tab.classList.add('active');
            } else {
                tab.classList.remove('active');
            }
        });
        
        this.renderTableData(tableName);
    }

    // Отображение данных таблицы
    renderTableData(tableName) {
        const container = document.getElementById('table-data-container');
        
        if (tableName === 'all') {
            this.renderAllTables(container);
            return;
        }
        
        const tableData = this.database[tableName];
        if (!tableData || tableData.length === 0) {
            container.innerHTML = '<p style="text-align: center; padding: 20px;">Нет данных для отображения</p>';
            return;
        }
        
        const tableColumns = Object.keys(tableData[0]);
        container.innerHTML = this.generateTableHTML(tableName, tableData, tableColumns);
    }

    // Отображение всех таблиц
    renderAllTables(container) {
        let html = '';
        
        this.tableNames.forEach(tblName => {
            if (tblName === 'all') return;
            
            const tableData = this.database[tblName];
            if (!tableData || tableData.length === 0) {
                html += `<div class="table-data-container" style="margin-bottom: 30px;">`;
                html += `<h3 style="color: var(--primary); margin-bottom: 15px; display: flex; align-items: center; gap: 10px;"><i class="fas fa-table"></i> Таблица ${tblName}</h3>`;
                html += '<p style="text-align: center; padding: 20px;">Нет данных для отображения</p>';
                html += '</div>';
                return;
            }
            
            const tableColumns = Object.keys(tableData[0]);
            html += `<div class="table-data-container" style="margin-bottom: 30px;">`;
            html += `<h3 style="color: var(--primary); margin-bottom: 15px; display: flex; align-items: center; gap: 10px;"><i class="fas fa-table"></i> Таблица ${tblName}</h3>`;
            html += this.generateTableHTML(tblName, tableData, tableColumns, false);
            html += '</div>';
        });
        
        container.innerHTML = html;
    }

    // Генерация HTML для таблицы
    generateTableHTML(tableName, tableData, tableColumns, includeContainer = true) {
        let html = '';
        
        if (includeContainer) {
            html += '<div class="table-data-container">';
        }
        
        html += '<table>';
        html += '<thead><tr>';
        
        tableColumns.forEach(column => {
            html += `<th>${this.escapeHtml(column)}</th>`;
        });
        html += '</tr></thead>';
        
        html += '<tbody>';
        tableData.forEach(row => {
            html += '<tr>';
            tableColumns.forEach(column => {
                html += `<td>${this.escapeHtml(String(row[column] ?? ''))}</td>`;
            });
            html += '</tr>';
        });
        html += '</tbody>';
        html += '</table>';
        
        html += `<div class="row-count"><i class="fas fa-list"></i> Всего записей: ${tableData.length}</div>`;
        
        if (includeContainer) {
            html += '</div>';
        }
        
        return html;
    }

    // Экранирование HTML для защиты от XSS
    escapeHtml(text) {
        if (text === null || text === undefined) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Функция для инициализации менеджера таблиц
window.initTableManager = function(database, tableNames, defaultQueries) {
    const manager = new TableManager(database, tableNames, defaultQueries);
    
    // Ждем загрузки DOM
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => manager.init());
    } else {
        manager.init();
    }
    
    return manager;
};
