// Проверка: инлайновые скрипты страниц синтаксически корректны,
// локальные ссылки ведут на существующие файлы.
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const pages = ['index.html', 'login.html', 'variant1.html', 'variant2.html', 'variant3.html', 'variant4.html'];

let problems = 0;

for (const page of pages) {
    const source = fs.readFileSync(path.join(REPO_ROOT, page), 'utf8');

    // Все <script> без src
    const inlineScripts = [...source.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
        .map(match => match[1]);
    inlineScripts.forEach((code, index) => {
        try {
            new Function(code);
        } catch (error) {
            problems++;
            console.error(`${page} [inline script #${index}]: ${error.message}`);
        }
    });

    // Локальные ссылки src/href
    const refs = [...source.matchAll(/(?:src|href)="([^"]+)"/g)]
        .map(match => match[1])
        .filter(ref => !ref.startsWith('http') && !ref.startsWith('#') && !ref.startsWith('mailto'));
    refs.forEach(ref => {
        if (!fs.existsSync(path.join(REPO_ROOT, ref))) {
            problems++;
            console.error(`${page}: файл не найден — ${ref}`);
        }
    });
}

// В вариантах должен быть подключён sql-checker.js и не должно быть инлайновых ответов
for (const variant of ['variant1', 'variant2', 'variant3', 'variant4']) {
    const source = fs.readFileSync(path.join(REPO_ROOT, `${variant}.html`), 'utf8');
    if (!source.includes('sql-checker.js')) {
        problems++;
        console.error(`${variant}: не подключен sql-checker.js`);
    }
    if (/const defaultQueries|TRUNCATE/i.test(source)) {
        problems++;
        console.error(`${variant}: остались следы старых решений/заданий`);
    }
    ['DB-SCHEMA:START', 'DB-DATA:START', 'SQL-TASKS:START'].forEach(marker => {
        if (!source.includes(marker)) {
            problems++;
            console.error(`${variant}: нет маркера ${marker}`);
        }
    });
}

console.log(problems === 0 ? 'OK: все проверки пройдены' : `Проблем: ${problems}`);
process.exit(problems === 0 ? 0 : 1);
