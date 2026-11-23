// test-checker.js - Тесты движка автопроверки и консистентности эталонов.
//
// Запуск:  cd tools && npm install && node test-checker.js
//
// Проверяется:
//  1. Чистые функции сравнения (compareRowSets, containsDml, canonicalCell).
//  2. Каждое эталонное решение проходит собственную проверку на том же
//     движке (sql.js), что и в браузере: решения <-> expected.js <-> данные.
//  3. Негативные сценарии: неверные запросы не должны засчитываться,
//     а альтернативные формулировки верных запросов - должны.

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const initSqlJs = require('sql.js');

const REPO_ROOT = path.resolve(__dirname, '..');
const VARIANTS = ['variant1', 'variant2', 'variant3', 'variant4'];

let passed = 0;
let failed = 0;

function assert(condition, message) {
    if (condition) {
        passed++;
    } else {
        failed++;
        console.error('  FAIL: ' + message);
    }
}

function loadCheckerSandbox() {
    const sandbox = {
        window: {},
        localStorage: {
            getItem: () => null,
            setItem: () => {},
            removeItem: () => {}
        },
        console: console
    };
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(REPO_ROOT, 'sql-checker.js'), 'utf8'), sandbox);
    return { checker: sandbox.window.SqlChecker, sandboxWindow: sandbox.window };
}

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
    new Function('window', code)(sandboxWindow);
    return sandboxWindow;
}

function loadVariantPage(variantName) {
    const source = fs.readFileSync(path.join(REPO_ROOT, `${variantName}.html`), 'utf8');
    const schemaBlock = evalBlock(extractBlock(source, 'DB-SCHEMA'));
    const dataBlock = evalBlock(extractBlock(source, 'DB-DATA'));
    const tasksBlock = evalBlock(extractBlock(source, 'SQL-TASKS'));
    return {
        schema: schemaBlock.SQL_DB_SCHEMA,
        data: dataBlock.SQL_DB_DATA,
        tasks: tasksBlock.SQL_TASKS,
        variant: schemaBlock.SQL_VARIANT
    };
}

function loadScriptObject(fileName, globalName) {
    const source = fs.readFileSync(path.join(REPO_ROOT, fileName), 'utf8');
    return evalBlock(source)[globalName];
}

function testCompareFunctions(checker) {
    console.log('1. Чистые функции сравнения');

    assert(checker.compareRowSets([[1, 'a'], [2, 'b']], [[2, 'b'], [1, 'a']]).ok,
        'порядок строк не важен');

    assert(checker.compareRowSets([[19990.000001]], [[19990.000004]]).ok,
        'допуск для дробных чисел (0.01)');

    assert(!checker.compareRowSets([[19990]], [[19990.02]]).ok,
        'разница больше допуска фиксируется');

    assert(checker.compareRowSets([[null, 1]], [[null, 1]]).ok, 'NULL равен NULL');
    assert(!checker.compareRowSets([[null, 1]], [[0, 1]]).ok, 'NULL не равен 0');

    assert(checker.compareRowSets([['5']], [[5]]).ok, 'число против числовой строки');

    assert(!checker.compareRowSets([[1, 2]], [[1, 2, 3]]).ok, 'лишний столбец фиксируется');
    assert(!checker.compareRowSets([[1]], [[1], [2]]).ok, 'лишняя строка фиксируется');
    assert(!checker.compareRowSets([['Обувь']], [['обувь']]).ok, 'регистр строк важен');

    assert(checker.compareRowSets([[1.5, 'x']], [[1.5004, 'x']]).ok, 'внутри допуска');
    assert(!checker.compareRowSets([[1.5, 'x']], [[1.511, 'x']]).ok, 'за границей допуска');

    assert(!checker.containsDml('SELECT * FROM goods WHERE name = \'UPDATE\''),
        'DML внутри строкового литерала игнорируется');
    assert(!checker.containsDml('SELECT * FROM goods -- UPDATE test'),
        'DML внутри комментария игнорируется');
    assert(!checker.containsDml('WITH stats AS (SELECT 1) SELECT * FROM stats'), 'CTE разрешен');
    assert(!checker.containsDml('SELECT created_at, deleted_at FROM t'),
        'имена столбцов не триггерят');
    assert(checker.containsDml('DELETE FROM stock WHERE quantity = 0'), 'DELETE определяется');
    assert(checker.containsDml('update goods set price = 1'), 'регистр не важен');
    assert(checker.containsDml('INSERT INTO warehouses VALUES (1)'), 'INSERT определяется');

    assert(checker.canonicalCell(null) === null, 'canonicalCell(null)');
    assert(checker.canonicalCell('  x  ') === 'x', 'canonicalCell обрезает пробелы');
}

function runSelectSolution(checker, db, solution, expectedTask) {
    const results = db.exec(solution);
    if (results.length !== 1) {
        return { ok: false, reason: `решение вернуло ${results.length} наборов строк вместо 1` };
    }
    return checker.compareRowSets(results[0].values, expectedTask.rows);
}

function runDmlSolution(checker, db, solution, expectedTask, database) {
    db.exec(solution);
    for (const [tableName, expectedTable] of Object.entries(expectedTask.tables)) {
        const columns = Object.keys(database[tableName][0]);
        const gotRows = checker.selectAllRows(db, tableName, columns);
        const comparison = checker.compareRowSets(gotRows, expectedTable.rows);
        if (!comparison.ok) {
            return { ok: false, reason: `таблица ${tableName}: ${comparison.code}` };
        }
    }
    return { ok: true };
}

async function main() {
    console.log('Загрузка sql.js...');
    const SQL = await initSqlJs();
    const { checker, sandboxWindow } = loadCheckerSandbox();

    testCompareFunctions(checker);

    console.log('2. Конфигурация страниц вариантов');
    const pages = {};
    for (const variantName of VARIANTS) {
        const page = loadVariantPage(variantName);
        pages[variantName] = page;
        assert(page.variant === variantName, `${variantName}: SQL_VARIANT`);
        assert(page.tasks.length === 10, `${variantName}: 10 заданий`);
        assert(new Set(page.tasks.map(t => t.id)).size === 10, `${variantName}: уникальные id`);

        page.tasks.forEach(task => {
            assert([1, 2, 3].includes(task.difficulty), `${variantName}/${task.id}: сложность 1..3`);
            assert(['select', 'dml', 'transaction'].includes(task.type), `${variantName}/${task.id}: тип`);
            assert(typeof task.hint === 'string' && task.hint.length > 10, `${variantName}/${task.id}: подсказка`);
            assert(typeof task.text === 'string' && task.text.length > 10, `${variantName}/${task.id}: текст`);
            if (task.type !== 'select') {
                assert(Array.isArray(task.checkTables) && task.checkTables.length > 0,
                    `${variantName}/${task.id}: checkTables`);
                task.checkTables.forEach(tableName => {
                    assert(page.data[tableName] && page.data[tableName].length > 0,
                        `${variantName}/${task.id}: таблица ${tableName} существует`);
                });
            }
        });

        const totalRows = Object.values(page.data).reduce((sum, rows) => sum + rows.length, 0);
        assert(totalRows >= 45, `${variantName}: данных не меньше 45 строк (сейчас ${totalRows})`);
    }

    console.log('3. Эталонные решения проходят собственную проверку');
    const solutions = loadScriptObject('solutions.js', 'SQLTEST_SOLUTIONS');
    const expectedAll = loadScriptObject('expected.js', 'SQLTEST_EXPECTED');

    for (const variantName of VARIANTS) {
        const page = pages[variantName];
        const variantSolutions = solutions[variantName];
        const variantExpected = expectedAll[variantName];

        assert(variantSolutions && variantExpected, `${variantName}: есть решения и эталоны`);

        for (const task of page.tasks) {
            const solution = variantSolutions[task.id];
            const expectedTask = variantExpected[task.id];
            assert(solution && expectedTask, `${variantName}/${task.id}: решение и эталон существуют`);
            if (!solution || !expectedTask) {
                continue;
            }

            assert(expectedTask.mode === task.type, `${variantName}/${task.id}: режим эталона совпадает`);

            sandboxWindow.SQL_DB_SCHEMA = page.schema;
            sandboxWindow.SQL_DB_DATA = page.data;
            const db = checker.buildFreshDatabase(SQL);

            let result;
            if (task.type === 'select') {
                result = runSelectSolution(checker, db, solution, expectedTask);
            } else {
                result = runDmlSolution(checker, db, solution, expectedTask, page.data);
            }
            assert(result.ok, `${variantName}/${task.id}: эталонное решение проходит проверку${result.reason ? ' (' + result.reason + ')' : ''}`);
            db.close();
        }
    }

    console.log('4. Негативные и альтернативные сценарии');

    function buildDatabase(page) {
        sandboxWindow.SQL_DB_SCHEMA = page.schema;
        sandboxWindow.SQL_DB_DATA = page.data;
        return checker.buildFreshDatabase(SQL);
    }

    {
        // variant1: неверный порог в HAVING дает другой результат
        let db = buildDatabase(pages.variant1);
        let wrong = db.exec('SELECT t.name, SUM(s.quantity) FROM types t JOIN goods g ON g.type_id = t.id JOIN stock s ON s.goods_id = g.id GROUP BY t.id HAVING SUM(s.quantity) > 15;');
        assert(!checker.compareRowSets(wrong[0].values, expectedAll.variant1[2].rows).ok,
            'variant1: неверный HAVING не проходит');
        db.close();

        // variant1: DELETE не по тем строкам
        db = buildDatabase(pages.variant1);
        db.exec('DELETE FROM stock WHERE quantity = 5;');
        let gotStock = checker.selectAllRows(db, 'stock', Object.keys(pages.variant1.data.stock[0]));
        assert(!checker.compareRowSets(gotStock, expectedAll.variant1[9].tables.stock.rows).ok,
            'variant1: неверный DELETE не проходит');
        db.close();

        // variant1: альтернативная формулировка корректного решения (NOT IN вместо NOT EXISTS)
        db = buildDatabase(pages.variant1);
        const alternative = db.exec('SELECT name, brand FROM goods WHERE id NOT IN (SELECT goods_id FROM stock);');
        assert(checker.compareRowSets(alternative[0].values, expectedAll.variant1[3].rows).ok,
            'variant1: альтернативная формулировка (NOT IN) проходит проверку');
        db.close();

        // variant1: другой порядок столбцов в SELECT фиксируется
        db = buildDatabase(pages.variant1);
        const reordered = db.exec("SELECT g.brand, g.name, g.price FROM goods g JOIN types t ON t.id = g.type_id WHERE t.name = 'Обувь' ORDER BY g.price DESC;");
        assert(!checker.compareRowSets(reordered[0].values, expectedAll.variant1[1].rows).ok,
            'variant1: другой порядок столбцов фиксируется');
        db.close();

        // variant1: псевдонимы столбцов не влияют на проверку
        db = buildDatabase(pages.variant1);
        const aliased = db.exec("SELECT g.name AS n, g.brand AS b, g.price AS p FROM goods g JOIN types t ON t.id = g.type_id WHERE t.name = 'Обувь' ORDER BY g.price DESC;");
        assert(checker.compareRowSets(aliased[0].values, expectedAll.variant1[1].rows).ok,
            'variant1: псевдонимы столбцов не влияют на проверку');
        db.close();

        // variant2: слишком широкое условие UPDATE меняет лишних сотрудников
        db = buildDatabase(pages.variant2);
        db.exec('UPDATE employees SET salary = salary * 1.15 WHERE id IN (SELECT employee_id FROM employee_projects GROUP BY employee_id HAVING SUM(hours_worked) >= 60);');
        let gotEmployees = checker.selectAllRows(db, 'employees', Object.keys(pages.variant2.data.employees[0]));
        assert(!checker.compareRowSets(gotEmployees, expectedAll.variant2[8].tables.employees.rows).ok,
            'variant2: слишком широкое условие UPDATE не проходит');
        db.close();

        // variant3: решение одного задания не совпадает с эталоном другого
        db = buildDatabase(pages.variant3);
        const wrongTask = db.exec(solutions.variant3[1]);
        assert(!checker.compareRowSets(wrongTask[0].values, expectedAll.variant3[2].rows).ok,
            'variant3: решение задания 1 не совпадает с эталоном задания 2');
        db.close();

        // variant4: сегменты без клиентов без заказов (JOIN вместо LEFT JOIN) не проходят
        db = buildDatabase(pages.variant4);
        const wrongSegments = db.exec("SELECT CASE WHEN SUM(o.total_amount) > 100000 THEN 'VIP' WHEN SUM(o.total_amount) >= 30000 THEN 'Постоянный' WHEN SUM(o.total_amount) > 0 THEN 'Новый' ELSE 'Без заказов' END, COUNT(*) FROM customers c JOIN orders o ON o.customer_id = c.id GROUP BY c.id ORDER BY COUNT(*) DESC;");
        assert(!checker.compareRowSets(wrongSegments[0].values, expectedAll.variant4[7].rows).ok,
            'variant4: JOIN вместо LEFT JOIN теряет сегмент «Без заказов»');
        db.close();
    }

    console.log('');
    console.log(`Пройдено проверок: ${passed}, провалено: ${failed}`);
    if (failed > 0) {
        process.exit(1);
    }
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
