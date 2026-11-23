// table-manager.js - Общий модуль отображения данных таблиц для всех вариантов.
// Отвечает только за просмотр данных: вкладки таблиц и рендер содержимого.
// Задания и проверка запросов живут в sql-checker.js.

class TableManager {
    constructor(database, tableNames) {
        this.database = database;
        this.tableNames = tableNames;
        this.currentTable = tableNames[0];
    }

    init() {
        this.renderTableData(this.currentTable);
        this.setupTableTabs();
    }

    setupTableTabs() {
        document.querySelectorAll('.table-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                this.switchTable(tab.dataset.table);
            });
        });
    }

    switchTable(tableName) {
        this.currentTable = tableName;

        document.querySelectorAll('.table-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.table === tableName);
        });

        this.renderTableData(tableName);
    }

    renderTableData(tableName) {
        const container = document.getElementById('table-data-container');
        if (!container) {
            return;
        }

        if (tableName === 'all') {
            this.renderAllTables(container);
            return;
        }

        const tableData = this.database[tableName];
        if (!tableData || tableData.length === 0) {
            container.innerHTML = this.renderEmptyTable(tableName);
            return;
        }

        const tableColumns = Object.keys(tableData[0]);
        container.innerHTML = this.generateTableHTML(tableName, tableData, tableColumns);
    }

    renderAllTables(container) {
        container.innerHTML = this.tableNames
            .filter(tableName => tableName !== 'all')
            .map(tableName => {
                const tableData = this.database[tableName];
                if (!tableData || tableData.length === 0) {
                    return this.renderEmptyTable(tableName);
                }
                const tableColumns = Object.keys(tableData[0]);
                return '<div class="table-data-container" style="margin-bottom: 30px;">' +
                    this.renderTableHeading(tableName) +
                    this.generateTableHTML(tableName, tableData, tableColumns, false) +
                    '</div>';
            })
            .join('');
    }

    renderTableHeading(tableName) {
        return '<h3 style="color: var(--primary); margin-bottom: 15px; display: flex; align-items: center; gap: 10px;">' +
            '<i class="fas fa-table"></i> Таблица ' + this.escapeHtml(tableName) + '</h3>';
    }

    renderEmptyTable(tableName) {
        return '<div class="table-data-container">' +
            this.renderTableHeading(tableName) +
            '<p style="text-align: center; padding: 20px;">Нет данных для отображения</p>' +
            '</div>';
    }

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
                html += `<td>${this.escapeHtml(row[column] ?? '')}</td>`;
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

    escapeHtml(text) {
        if (text === null || text === undefined) return '';
        const div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    }
}

// Функция инициализации менеджера таблиц
window.initTableManager = function (database, tableNames) {
    const manager = new TableManager(database, tableNames);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => manager.init());
    } else {
        manager.init();
    }

    return manager;
};
