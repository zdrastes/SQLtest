// sql-checker.js - Автопроверка SQL-заданий в браузере
//
// Движок: sql.js (SQLite, скомпилированный в WebAssembly, загружается с CDN).
// Каждая проверка выполняется на свежей копии учебной базы данных, поэтому
// DML-задания не портят данные для следующих попыток.
//
// Сравнение с эталоном:
//  - SELECT-задания: мультимножество строк (порядок строк и имена столбцов
//    не важны, числам допускается погрешность 0.01);
//  - DML/транзакции: итоговое состояние проверяемых таблиц.
//
// Эталонные результаты лежат в expected.js (генерируется tools/generate-expected.js),
// тексты эталонных решений - в solutions.js (загружается только по запросу).

(function () {
    'use strict';

    var SQLJS_VERSION = '1.13.0';
    var SQLJS_BASE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/' + SQLJS_VERSION + '/';
    var FLOAT_TOLERANCE = 0.01;
    var PROGRESS_KEY_PREFIX = 'sqltest.progress.';
    var MISMATCH_SAMPLE_SIZE = 3;

    var enginePromise = null;
    var expectedPromise = null;
    var solutionsPromise = null;

    // ---------------------------------------------------------------- //
    // Загрузка внешних ресурсов (ленивая, однократная)                  //
    // ---------------------------------------------------------------- //

    function loadScript(src) {
        return new Promise(function (resolve, reject) {
            var script = document.createElement('script');
            script.src = src;
            script.onload = function () { resolve(); };
            script.onerror = function () { reject(new Error('Не удалось загрузить ' + src)); };
            document.head.appendChild(script);
        });
    }

    function getEngine() {
        if (!enginePromise) {
            enginePromise = loadScript(SQLJS_BASE_URL + 'sql-wasm.js').then(function () {
                if (typeof initSqlJs !== 'function') {
                    throw new Error('Библиотека sql.js загрузилась некорректно');
                }
                return initSqlJs({ locateFile: function (file) { return SQLJS_BASE_URL + file; } });
            });
        }
        return enginePromise;
    }

    function getExpected() {
        if (!expectedPromise) {
            expectedPromise = loadScript('expected.js').then(function () {
                var data = window.SQLTEST_EXPECTED && window.SQLTEST_EXPECTED[window.SQL_VARIANT];
                if (!data) {
                    throw new Error('Эталонные результаты для этого варианта не найдены');
                }
                return data;
            });
        }
        return expectedPromise;
    }

    function getSolutions() {
        if (!solutionsPromise) {
            solutionsPromise = loadScript('solutions.js').then(function () {
                var data = window.SQLTEST_SOLUTIONS && window.SQLTEST_SOLUTIONS[window.SQL_VARIANT];
                if (!data) {
                    throw new Error('Решения для этого варианта не найдены');
                }
                return data;
            });
        }
        return solutionsPromise;
    }

    // ---------------------------------------------------------------- //
    // Работа с базой данных                                             //
    // ---------------------------------------------------------------- //

    function sqlLiteral(value) {
        if (value === null || value === undefined) {
            return 'NULL';
        }
        if (typeof value === 'number') {
            return String(value);
        }
        return "'" + String(value).replace(/'/g, "''") + "'";
    }

    function buildFreshDatabase(SQL) {
        var db = new SQL.Database();
        db.exec(window.SQL_DB_SCHEMA);

        Object.keys(window.SQL_DB_DATA).forEach(function (tableName) {
            var rows = window.SQL_DB_DATA[tableName];
            if (!rows || rows.length === 0) {
                return;
            }
            var columns = Object.keys(rows[0]);
            var columnList = columns.map(function (c) { return '"' + c + '"'; }).join(', ');

            rows.forEach(function (row) {
                var values = columns.map(function (column) { return sqlLiteral(row[column]); }).join(', ');
                db.exec('INSERT INTO "' + tableName + '" (' + columnList + ') VALUES (' + values + ');');
            });
        });

        return db;
    }

    function selectAllRows(db, tableName, columns) {
        var columnList = columns.map(function (c) { return '"' + c + '"'; }).join(', ');
        var result = db.exec('SELECT ' + columnList + ' FROM "' + tableName + '";');
        return result.length > 0 ? result[0].values : [];
    }

    // ---------------------------------------------------------------- //
    // Сравнение результатов                                             //
    // ---------------------------------------------------------------- //

    function isNumericLike(value) {
        return typeof value === 'number' || (typeof value === 'string' && value.trim() !== '' && !isNaN(Number(value)));
    }

    function canonicalCell(value) {
        if (value === null || value === undefined) {
            return null;
        }
        if (typeof value === 'number') {
            return isFinite(value) ? Math.round(value * 100) / 100 : String(value);
        }
        if (typeof value === 'string') {
            return value.trim();
        }
        return String(value);
    }

    // Ключ сортировки: значения обоих наборов сортируются одинаково,
    // поэтому сравнение идёт попарно, без привязки к порядку строк.
    function canonicalRowKey(row) {
        return row.map(function (cell) {
            var canonical = canonicalCell(cell);
            return canonical === null ? '\u0000null' : String(canonical);
        }).join('\u0001');
    }

    function compareCells(got, expected) {
        if (got === null && expected === null) {
            return true;
        }
        if (got === null || expected === null) {
            return false;
        }
        if (typeof got === 'number' && typeof expected === 'number') {
            return Math.abs(got - expected) <= FLOAT_TOLERANCE;
        }
        if (typeof got === 'string' && typeof expected === 'string') {
            return got === expected;
        }
        if (isNumericLike(got) && isNumericLike(expected)) {
            return Math.abs(Number(got) - Number(expected)) <= FLOAT_TOLERANCE;
        }
        return String(got) === String(expected);
    }

    function compareRowSets(gotRows, expectedRows) {
        if (!Array.isArray(gotRows) || !Array.isArray(expectedRows)) {
            return { ok: false, code: 'internal' };
        }
        if (expectedRows.length > 0 && gotRows.length > 0 &&
            gotRows[0].length !== expectedRows[0].length) {
            return { ok: false, code: 'column-count', gotColumns: gotRows[0].length, expectedColumns: expectedRows[0].length };
        }
        if (gotRows.length !== expectedRows.length) {
            return { ok: false, code: 'row-count', gotRows: gotRows.length, expectedRows: expectedRows.length };
        }

        var gotSorted = gotRows.slice().sort(function (a, b) {
            return canonicalRowKey(a) < canonicalRowKey(b) ? -1 : 1;
        });
        var expectedSorted = expectedRows.slice().sort(function (a, b) {
            return canonicalRowKey(a) < canonicalRowKey(b) ? -1 : 1;
        });

        for (var i = 0; i < gotSorted.length; i++) {
            for (var j = 0; j < gotSorted[i].length; j++) {
                if (!compareCells(canonicalCell(gotSorted[i][j]), canonicalCell(expectedSorted[i][j]))) {
                    return {
                        ok: false,
                        code: 'row-values',
                        index: i,
                        gotRow: gotSorted[i],
                        expectedRow: expectedSorted[i]
                    };
                }
            }
        }
        return { ok: true };
    }

    // Убирает строковые литералы и комментарии, чтобы ключевые слова
    // внутри строк и комментариев не принимались за команды DML.
    function stripSqlLiterals(sql) {
        return sql
            .replace(/'[^']*'/g, "''")
            .replace(/--[^\n]*/g, ' ')
            .replace(/\/\*[\s\S]*?\*\//g, ' ');
    }

    function containsDml(sql) {
        var clean = stripSqlLiterals(sql).toUpperCase();
        return /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|REPLACE|ATTACH|DETACH|VACUUM)\b/.test(clean);
    }

    // ---------------------------------------------------------------- //
    // Прогресс                                                          //
    // ---------------------------------------------------------------- //

    function getProgressStorageKey() {
        return PROGRESS_KEY_PREFIX + window.SQL_VARIANT;
    }

    function loadSolvedTasks() {
        try {
            var raw = localStorage.getItem(getProgressStorageKey());
            var parsed = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed) ? parsed : [];
        } catch (error) {
            return [];
        }
    }

    function saveSolvedTasks(solved) {
        localStorage.setItem(getProgressStorageKey(), JSON.stringify(solved));
    }

    function markTaskSolved(taskId) {
        var solved = loadSolvedTasks();
        if (solved.indexOf(taskId) === -1) {
            solved.push(taskId);
            saveSolvedTasks(solved);
        }
        updateProgressBar();
    }

    function clearProgress() {
        saveSolvedTasks([]);
        updateProgressBar();
        document.querySelectorAll('.task-item').forEach(function (card) {
            card.classList.remove('task-solved');
            var badge = card.querySelector('.solved-badge');
            if (badge) {
                badge.hidden = true;
            }
        });
    }

    function updateProgressBar() {
        var tasks = window.SQL_TASKS || [];
        var solved = loadSolvedTasks();
        var solvedCount = tasks.filter(function (task) { return solved.indexOf(task.id) !== -1; }).length;
        var percent = tasks.length > 0 ? Math.round((solvedCount / tasks.length) * 100) : 0;

        var count = document.getElementById('progress-count');
        var fill = document.getElementById('progress-fill');
        if (count) {
            count.textContent = solvedCount + ' из ' + tasks.length;
        }
        if (fill) {
            fill.style.width = percent + '%';
        }
    }

    // ---------------------------------------------------------------- //
    // Отрисовка заданий                                                 //
    // ---------------------------------------------------------------- //

    var TYPE_LABELS = {
        select: 'SELECT',
        dml: 'DML (UPDATE / DELETE)',
        transaction: 'Транзакция'
    };

    function escapeHtml(text) {
        var div = document.createElement('div');
        div.textContent = text === null || text === undefined ? '' : String(text);
        return div.innerHTML;
    }

    function difficultyLabel(difficulty) {
        var stars = '';
        for (var i = 0; i < (difficulty || 1); i++) {
            stars += '\u2605';
        }
        return stars;
    }

    function taskMetaHtml(task) {
        var parts = [TYPE_LABELS[task.type] || task.type];
        if (task.checkTables && task.checkTables.length > 0) {
            parts.push('проверяются таблицы: ' + task.checkTables.join(', '));
        } else {
            parts.push('сравнение результата с эталоном');
        }
        return escapeHtml(parts.join(' \u00B7 '));
    }

    function renderTaskCard(task) {
        var card = document.createElement('div');
        card.className = 'query-item task-item';
        card.id = 'task-' + task.id;
        card.setAttribute('data-task-id', task.id);

        card.innerHTML =
            '<div class="query-question">' +
                '<span class="query-number">' + task.id + '</span>' +
                '<span class="task-text">' + escapeHtml(task.text) + '</span>' +
                '<span class="difficulty-badge" title="Уровень сложности">' + difficultyLabel(task.difficulty) + '</span>' +
                '<span class="solved-badge" hidden><i class="fas fa-check-circle"></i> решено</span>' +
            '</div>' +
            '<div class="task-meta"><i class="fas fa-tag"></i> ' + taskMetaHtml(task) + '</div>' +
            '<div class="query-input-area">' +
                '<textarea id="query' + task.id + '" spellcheck="false" placeholder="Введите SQL-запрос..."></textarea>' +
                '<div class="task-buttons">' +
                    '<button type="button" class="btn btn-check" data-task="' + task.id + '"><i class="fas fa-play"></i> Проверить</button>' +
                    '<button type="button" class="btn btn-hint" data-task="' + task.id + '"><i class="fas fa-lightbulb"></i> Подсказка</button>' +
                    '<button type="button" class="btn btn-solution" data-task="' + task.id + '"><i class="fas fa-key"></i> Показать решение</button>' +
                '</div>' +
                '<div class="hint-panel" id="hint' + task.id + '" hidden><i class="fas fa-lightbulb"></i> ' + escapeHtml(task.hint) + '</div>' +
                '<div class="solution-panel" id="solution' + task.id + '" hidden><pre><code id="solution-code' + task.id + '"></code></pre></div>' +
                '<div class="task-result" id="result' + task.id + '"></div>' +
            '</div>';

        return card;
    }

    function renderProgressBar(container) {
        container.innerHTML =
            '<div class="progress-panel">' +
                '<div class="progress-info"><i class="fas fa-chart-bar"></i> Прогресс: <strong id="progress-count"></strong></div>' +
                '<div class="progress-track"><div class="progress-fill" id="progress-fill"></div></div>' +
                '<button type="button" class="btn-progress-reset" id="progress-reset"><i class="fas fa-undo"></i> Сбросить прогресс</button>' +
            '</div>';
        document.getElementById('progress-reset').addEventListener('click', clearProgress);
        updateProgressBar();
    }

    function markCardSolved(taskId) {
        var card = document.getElementById('task-' + taskId);
        if (!card) {
            return;
        }
        card.classList.add('task-solved');
        var badge = card.querySelector('.solved-badge');
        if (badge) {
            badge.hidden = false;
        }
    }

    function restoreSolvedMarks() {
        var solved = loadSolvedTasks();
        solved.forEach(function (taskId) { markCardSolved(taskId); });
    }

    // ---------------------------------------------------------------- //
    // Вывод результата проверки                                         //
    // ---------------------------------------------------------------- //

    function setTaskBusy(taskId, busy) {
        var button = document.querySelector('.btn-check[data-task="' + taskId + '"]');
        if (!button) {
            return;
        }
        button.disabled = busy;
        button.innerHTML = busy
            ? '<i class="fas fa-spinner fa-spin"></i> Проверяю...'
            : '<i class="fas fa-play"></i> Проверить';
    }

    function showResult(taskId, kind, html) {
        var panel = document.getElementById('result' + taskId);
        if (!panel) {
            return;
        }
        panel.className = 'task-result ' + kind;
        panel.innerHTML = html;
    }

    function formatRowPreview(row) {
        return row.map(function (cell) {
            return cell === null ? 'NULL' : String(cell);
        }).join(' | ');
    }

    function buildMismatchDetails(comparison) {
        if (comparison.code === 'column-count') {
            return 'Количество столбцов не совпадает: получено ' + comparison.gotColumns +
                ', ожидается ' + comparison.expectedColumns + '. Убедитесь, что выводите именно те столбцы, которые указаны в задании.';
        }
        if (comparison.code === 'row-count') {
            return 'Количество строк не совпадает: получено ' + comparison.gotRows +
                ', ожидается ' + comparison.expectedRows + '.';
        }
        if (comparison.code === 'row-values') {
            var details = 'Значения не совпадают. Порядок строк и названия столбцов не важны, важен состав и значения столбцов.';
            if (comparison.gotRow && comparison.expectedRow) {
                details += '<br>Ваша строка: <code>' + escapeHtml(formatRowPreview(comparison.gotRow)) + '</code>';
            }
            return details;
        }
        return 'Результат не совпадает с эталоном.';
    }

    function buildTableMismatch(tableName, comparison) {
        if (comparison.code === 'column-count') {
            return 'Таблица ' + tableName + ': количество столбцов не совпадает.';
        }
        if (comparison.code === 'row-count') {
            return 'Таблица ' + tableName + ': количество строк не совпадает — получено ' +
                comparison.gotRows + ', ожидается ' + comparison.expectedRows + '.';
        }
        var details = 'Таблица ' + tableName + ': содержимое не совпадает с ожидаемым.';
        if (comparison.index !== undefined && comparison.gotRow) {
            var sample = comparison.gotRow.slice(0, MISMATCH_SAMPLE_SIZE).map(function (cell) {
                return cell === null ? 'NULL' : String(cell);
            }).join(' | ');
            details += '<br>Пример вашей строки: <code>' + escapeHtml(sample) + '</code>';
        }
        return details;
    }

    // ---------------------------------------------------------------- //
    // Проверка задания                                                  //
    // ---------------------------------------------------------------- //

    function getTaskById(taskId) {
        return (window.SQL_TASKS || []).filter(function (task) { return task.id === taskId; })[0] || null;
    }

    function checkSelectTask(task, db, expectedTask) {
        var textarea = document.getElementById('query' + task.id);
        var sql = textarea.value.trim();
        if (!sql) {
            return { ok: false, message: 'Введите SQL-запрос.' };
        }
        if (containsDml(sql)) {
            return { ok: false, message: 'В этом задании нужен один запрос SELECT, изменять данные нельзя.' };
        }

        var results;
        try {
            results = db.exec(sql);
        } catch (error) {
            return { ok: false, message: 'Ошибка SQL: ' + escapeHtml(error.message) };
        }

        if (results.length === 0) {
            return { ok: false, message: 'Запрос не вернул строк результата.' };
        }
        if (results.length > 1) {
            return { ok: false, message: 'Выполнено несколько запросов — нужен ровно один запрос SELECT.' };
        }

        var comparison = compareRowSets(results[0].values, expectedTask.rows);
        if (comparison.ok) {
            return { ok: true, message: 'Результат совпадает с эталоном (' + expectedTask.rows.length + ' строк).' };
        }
        return { ok: false, message: buildMismatchDetails(comparison) };
    }

    function checkDmlTask(task, db, expectedTask) {
        var textarea = document.getElementById('query' + task.id);
        var sql = textarea.value.trim();
        if (!sql) {
            return { ok: false, message: 'Введите SQL-запрос.' };
        }

        try {
            db.exec(sql);
        } catch (error) {
            return { ok: false, message: 'Ошибка SQL: ' + escapeHtml(error.message) };
        }

        var tableNames = task.checkTables || Object.keys(expectedTask.tables);
        for (var i = 0; i < tableNames.length; i++) {
            var tableName = tableNames[i];
            var expectedTable = expectedTask.tables[tableName];
            var columns = Object.keys(window.SQL_DB_DATA[tableName][0]);
            var gotRows = selectAllRows(db, tableName, columns);
            var comparison = compareRowSets(gotRows, expectedTable.rows);
            if (!comparison.ok) {
                return { ok: false, message: buildTableMismatch(tableName, comparison) };
            }
        }
        return { ok: true, message: 'Итоговое состояние таблиц (' + tableNames.join(', ') + ') совпадает с ожидаемым.' };
    }

    function runCheck(taskId) {
        var task = getTaskById(taskId);
        if (!task) {
            return;
        }

        setTaskBusy(taskId, true);
        showResult(taskId, 'info', '<i class="fas fa-spinner fa-spin"></i> Выполняю запрос на копии базы данных...');

        var engineReady = getEngine().catch(function () { return null; });
        var expectedReady = getExpected().catch(function () { return null; });

        Promise.all([engineReady, expectedReady]).then(function (loaded) {
            var SQL = loaded[0];
            var expectedTasks = loaded[1];

            if (!SQL) {
                showResult(taskId, 'err',
                    '<i class="fas fa-wifi"></i> Автопроверка недоступна: не загрузился SQL-движок (sql.js с CDN). ' +
                    'Проверьте подключение к интернету и обновите страницу.');
                return null;
            }
            if (!expectedTasks) {
                showResult(taskId, 'err',
                    '<i class="fas fa-exclamation-triangle"></i> Не удалось загрузить эталонные результаты (файл expected.js).');
                return null;
            }

            var expectedTask = expectedTasks[taskId];
            if (!expectedTask) {
                showResult(taskId, 'err', '<i class="fas fa-exclamation-triangle"></i> Для этого задания нет эталонного результата.');
                return null;
            }

            var db = null;
            try {
                db = buildFreshDatabase(SQL);
                var outcome = task.type === 'select'
                    ? checkSelectTask(task, db, expectedTask)
                    : checkDmlTask(task, db, expectedTask);

                if (outcome.ok) {
                    markTaskSolved(taskId);
                    markCardSolved(taskId);
                    showResult(taskId, 'ok', '<i class="fas fa-check-circle"></i> Верно! ' + outcome.message);
                } else {
                    showResult(taskId, 'err', '<i class="fas fa-times-circle"></i> ' + outcome.message);
                }
            } finally {
                if (db) {
                    db.close();
                }
            }
            return null;
        }).catch(function (error) {
            showResult(taskId, 'err', '<i class="fas fa-times-circle"></i> Непредвиденная ошибка проверки: ' + escapeHtml(error.message));
        }).then(function () {
            setTaskBusy(taskId, false);
        });
    }

    // ---------------------------------------------------------------- //
    // Подсказки и решения                                               //
    // ---------------------------------------------------------------- //

    function toggleHint(taskId) {
        var panel = document.getElementById('hint' + taskId);
        if (panel) {
            panel.hidden = !panel.hidden;
        }
    }

    function updateSolutionButtons() {
        var isAuthenticated = window.authSystem && window.authSystem.isAuthenticated();
        document.querySelectorAll('.btn-solution').forEach(function (button) {
            button.classList.toggle('btn-locked', !isAuthenticated);
            button.title = isAuthenticated ? 'Показать эталонное решение' : 'Доступно только преподавателю';
        });
    }

    function hideSolutionPanels() {
        document.querySelectorAll('.solution-panel').forEach(function (panel) {
            panel.hidden = true;
        });
    }

    function showSolution(taskId) {
        var isAuthenticated = window.authSystem && window.authSystem.isAuthenticated();
        if (!isAuthenticated) {
            showResult(taskId, 'info', '<i class="fas fa-lock"></i> Эталонные решения доступны преподавателю после авторизации.');
            return;
        }

        getSolutions().then(function (solutions) {
            var solution = solutions[taskId];
            var panel = document.getElementById('solution' + taskId);
            if (!panel) {
                return;
            }
            if (!solution) {
                showResult(taskId, 'err', '<i class="fas fa-exclamation-triangle"></i> Решение для этого задания не найдено.');
                return;
            }
            document.getElementById('solution-code' + taskId).textContent = solution;
            panel.hidden = !panel.hidden;
        }).catch(function () {
            showResult(taskId, 'err', '<i class="fas fa-exclamation-triangle"></i> Не удалось загрузить решения (файл solutions.js).');
        });
    }

    // ---------------------------------------------------------------- //
    // Инициализация                                                     //
    // ---------------------------------------------------------------- //

    function initSqlTasks() {
        var tasksContainer = document.getElementById('tasks-container');
        var progressContainer = document.getElementById('task-progress');
        if (!tasksContainer || !window.SQL_TASKS) {
            return;
        }

        if (progressContainer) {
            renderProgressBar(progressContainer);
        }

        tasksContainer.innerHTML = '';
        window.SQL_TASKS.forEach(function (task) {
            tasksContainer.appendChild(renderTaskCard(task));
        });

        tasksContainer.addEventListener('click', function (event) {
            var button = event.target.closest('button');
            if (!button) {
                return;
            }
            var taskId = Number(button.getAttribute('data-task'));
            if (button.classList.contains('btn-check')) {
                runCheck(taskId);
            } else if (button.classList.contains('btn-hint')) {
                toggleHint(taskId);
            } else if (button.classList.contains('btn-solution')) {
                showSolution(taskId);
            }
        });

        restoreSolvedMarks();
        updateSolutionButtons();

        // auth.js вызывает этот хук при каждой смене состояния авторизации
        window.onAuthStateChanged = function (isAuthenticated) {
            updateSolutionButtons();
            if (!isAuthenticated) {
                hideSolutionPanels();
            }
        };
    }

    // Экспорт чистых функций для тестов (tools/test-checker.js)
    window.SqlChecker = {
        buildFreshDatabase: buildFreshDatabase,
        selectAllRows: selectAllRows,
        compareRowSets: compareRowSets,
        compareCells: compareCells,
        canonicalCell: canonicalCell,
        containsDml: containsDml,
        stripSqlLiterals: stripSqlLiterals
    };

    window.initSqlTasks = initSqlTasks;

    // Автозапуск: на страницах вариантов DOM уже разобран к моменту,
    // когда initSqlTasks вызывается из инлайнового скрипта страницы.
    if (typeof document !== 'undefined' && document.addEventListener) {
        document.addEventListener('DOMContentLoaded', function () {
            if (window.SQL_TASKS && document.getElementById('tasks-container') &&
                !document.querySelector('.task-item')) {
                initSqlTasks();
            }
        });
    }
})();
