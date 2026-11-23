// generate-expected.js - Генератор эталонных результатов заданий.
//
// Читает из страниц вариантов схемы, данные и конфигурацию заданий,
// выполняет эталонные решения из solutions.js на движке sql.js (тот же,
// что и в браузере) и записывает expected.js с эталонными строками.
//
// Запуск:  cd tools && npm install && node generate-expected.js
// Запускать после любого изменения данных или решений на страницах вариантов.

const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

const REPO_ROOT = path.resolve(__dirname, '..');
const VARIANTS = ['variant1', 'variant2', 'variant3', 'variant4'];

function extractBlock(source, marker) {
    const start = source.indexOf(`/* ${marker}:START */`);
    const end = source.indexOf(`/* ${marker}:END */`);
    if (start === -1 || end === -1) {
        throw new Error(`Маркер ${marker} не найден`);
    }
    return source.slice(start + `/* ${marker}:START */`.length, end);
}

function evalBlock(code) {
    const sandboxWindow = {};
    const factory = new Function('window', code);
    factory(sandboxWindow);
    return sandboxWindow;
}

function loadVariantPage(variantName) {
    const source = fs.readFileSync(path.join(REPO_ROOT, `${variantName}.html`), 'utf8');
    const schemaBlock = evalBlock(extractBlock(source, 'DB-SCHEMA'));
    const dataBlock = evalBlock(extractBlock(source, 'DB-DATA'));
    const tasksBlock = evalBlock(extractBlock(source, 'SQL-TASKS'));

    const variant = schemaBlock.SQL_VARIANT;
    if (variant !== variantName) {
        throw new Error(`${variantName}: SQL_VARIANT = ${variant}`);
    }

    return {
        schema: schemaBlock.SQL_DB_SCHEMA,
        data: dataBlock.SQL_DB_DATA,
        tasks: tasksBlock.SQL_TASKS
    };
}

function loadSolutions() {
    const source = fs.readFileSync(path.join(REPO_ROOT, 'solutions.js'), 'utf8');
    const sandbox = evalBlock(source);
    return sandbox.SQLTEST_SOLUTIONS;
}

function selectFirstResultSet(db, sql, taskLabel) {
    const results = db.exec(sql);
    if (results.length === 0) {
        throw new Error(`${taskLabel}: эталонный SELECT не вернул строк`);
    }
    if (results.length > 1) {
        throw new Error(`${taskLabel}: эталонный SELECT вернул несколько наборов строк`);
    }
    return results[0].values;
}

function snapshotTables(db, tableNames, database) {
    const snapshot = {};
    tableNames.forEach(tableName => {
        const columns = Object.keys(database[tableName][0]);
        const columnList = columns.map(c => `"${c}"`).join(', ');
        const result = db.exec(`SELECT ${columnList} FROM "${tableName}";`);
        snapshot[tableName] = {
            columns: columns,
            rows: result.length > 0 ? result[0].values : []
        };
    });
    return snapshot;
}

function tableStateEquals(left, right) {
    if (left.rows.length !== right.rows.length) {
        return false;
    }
    const serialize = rows => rows
        .map(row => row.map(cell => (cell === null ? '\u0000' : String(cell))).join('\u0001'))
        .sort()
        .join('\u0002');
    return serialize(left.rows) === serialize(right.rows);
}

async function main() {
    const SQL = await initSqlJs();
    const solutions = loadSolutions();
    const output = {};

    for (const variantName of VARIANTS) {
        const page = loadVariantPage(variantName);
        const variantSolutions = solutions[variantName];
        if (!variantSolutions) {
            throw new Error(`${variantName}: нет решений в solutions.js`);
        }

        output[variantName] = {};
        const summary = [];

        for (const task of page.tasks) {
            const taskLabel = `${variantName} задание ${task.id}`;
            const solution = variantSolutions[task.id];
            if (!solution) {
                throw new Error(`${taskLabel}: нет эталонного решения`);
            }
            if (task.hint === undefined || task.hint === '') {
                throw new Error(`${taskLabel}: нет подсказки`);
            }

            const db = new SQL.Database();
            db.exec(page.schema);
            for (const [tableName, rows] of Object.entries(page.data)) {
                if (rows.length === 0) {
                    continue;
                }
                const columns = Object.keys(rows[0]);
                const columnList = columns.map(c => `"${c}"`).join(', ');
                rows.forEach(row => {
                    const values = columns.map(column => {
                        const value = row[column];
                        if (value === null || value === undefined) return 'NULL';
                        if (typeof value === 'number') return String(value);
                        return `'${String(value).replace(/'/g, "''")}'`;
                    }).join(', ');
                    db.exec(`INSERT INTO "${tableName}" (${columnList}) VALUES (${values});`);
                });
            }

            if (task.type === 'select') {
                if (/INSERT|UPDATE|DELETE|DROP|ALTER|CREATE/i.test(solution.replace(/'[^']*'/g, "''").replace(/--[^\n]*/g, ' '))) {
                    throw new Error(`${taskLabel}: в SELECT-решении обнаружен DML`);
                }
                const rows = selectFirstResultSet(db, solution, taskLabel);
                output[variantName][task.id] = { mode: 'select', rows: rows };
                summary.push(`  ${task.id} select: ${rows.length} строк, ${rows[0].length} столбцов`);
            } else {
                const before = snapshotTables(db, task.checkTables, page.data);
                db.exec(solution);
                const after = snapshotTables(db, task.checkTables, page.data);

                const changed = task.checkTables.some(tableName => !tableStateEquals(before[tableName], after[tableName]));
                if (!changed) {
                    throw new Error(`${taskLabel}: эталонное решение не изменило данные`);
                }

                output[variantName][task.id] = { mode: task.type, tables: after };
                const changeParts = task.checkTables.map(tableName => {
                    const delta = after[tableName].rows.length - before[tableName].rows.length;
                    return `${tableName}: ${before[tableName].rows.length} -> ${after[tableName].rows.length} строк`;
                });
                summary.push(`  ${task.id} ${task.type}: ${changeParts.join(', ')}`);
            }

            db.close();
        }

        console.log(`${variantName}:`);
        summary.forEach(line => console.log(line));
    }

    const header = [
        '// expected.js - ЭТАЛОННЫЕ результаты заданий (генерируется автоматически).',
        '// НЕ редактировать вручную: после изменения данных, схем или решений',
        '// запустите tools/generate-expected.js.',
        '',
        '(function () {',
        "    'use strict';",
        ''
    ].join('\n');

    const footer = ['})();', ''].join('\n');
    // Компактный JSON: файл машинный, отступы только увеличивают его размер
    const body = 'window.SQLTEST_EXPECTED = ' + JSON.stringify(output) + ';';
    fs.writeFileSync(path.join(REPO_ROOT, 'expected.js'), header + '\n' + body + '\n' + footer, 'utf8');
    console.log('\nexpected.js записан: ' + path.join(REPO_ROOT, 'expected.js'));
}

main().catch(error => {
    console.error(error.message);
    process.exit(1);
});
