// solutions.js - Эталонные решения заданий
// Файл загружается лениво (только по запросу) и используется:
//  - для показа решения преподавателю (после авторизации);
//  - генератором tools/generate-expected.js для расчёта эталонных результатов.
//
// ВАЖНО: это статический сайт, поэтому от технически подкованного студента
// клиентские файлы защитить нельзя. Автопроверка убирает саму необходимость
// смотреть решения. Для настоящей защиты нужен серверный бэкенд.

(function () {
    'use strict';

    window.SQLTEST_SOLUTIONS = {
        variant1: {
            1: `SELECT g.name AS имя_товара, g.brand AS бренд, g.price AS цена
FROM goods g
JOIN types t ON t.id = g.type_id
WHERE t.name = 'Обувь'
ORDER BY g.price DESC;`,
            2: `SELECT t.name AS тип_товара, SUM(s.quantity) AS суммарный_остаток
FROM types t
JOIN goods g ON g.type_id = t.id
JOIN stock s ON s.goods_id = g.id
GROUP BY t.id, t.name
HAVING SUM(s.quantity) > 10;`,
            3: `SELECT g.name AS имя_товара, g.brand AS бренд
FROM goods g
WHERE NOT EXISTS (
    SELECT 1
    FROM stock s
    WHERE s.goods_id = g.id
);`,
            4: `SELECT w.name AS склад, SUM(s.quantity) AS суммарный_запас
FROM warehouses w
JOIN stock s ON s.warehouse_id = w.id
GROUP BY w.id, w.name
HAVING SUM(s.quantity) > (
    SELECT AVG(total_qty)
    FROM (
        SELECT SUM(quantity) AS total_qty
        FROM stock
        GROUP BY warehouse_id
    )
);`,
            5: `SELECT t.name AS тип_товара, SUM(s.quantity) AS суммарный_остаток,
       RANK() OVER (ORDER BY SUM(s.quantity) DESC) AS ранг
FROM types t
JOIN goods g ON g.type_id = t.id
JOIN stock s ON s.goods_id = g.id
GROUP BY t.id, t.name;`,
            6: `SELECT бренд, имя_товара, цена, номер_в_рейтинге
FROM (
    SELECT brand AS бренд, name AS имя_товара, price AS цена,
           ROW_NUMBER() OVER (PARTITION BY brand ORDER BY price DESC, id) AS номер_в_рейтинге
    FROM goods
)
WHERE номер_в_рейтинге <= 3;`,
            7: `SELECT CASE
           WHEN price < 5000 THEN 'до 5000'
           WHEN price < 20000 THEN '5000-19999'
           WHEN price < 50000 THEN '20000-49999'
           ELSE '50000 и выше'
       END AS сегмент,
       COUNT(*) AS количество_товаров,
       AVG(price) AS средняя_цена
FROM goods
GROUP BY сегмент
ORDER BY MIN(price);`,
            8: `-- Проверяется итоговое состояние таблицы goods
UPDATE goods
SET price = price * 1.1
WHERE brand = 'Xiaomi'
  AND id IN (
      SELECT g.id
      FROM goods g
      JOIN stock s ON s.goods_id = g.id
      WHERE g.brand = 'Xiaomi'
      GROUP BY g.id
      HAVING SUM(s.quantity) < 5
  );`,
            9: `-- Проверяется итоговое состояние таблицы stock
DELETE FROM stock
WHERE quantity = 0;`,
            10: `-- Проверяются таблицы warehouses и stock
BEGIN TRANSACTION;

INSERT INTO warehouses (id, name, address)
VALUES (1402, 'Люблино', 'Люблинская улица, 40');

UPDATE stock
SET warehouse_id = (SELECT id FROM warehouses WHERE name = 'Люблино')
WHERE goods_id = (SELECT id FROM goods WHERE name = 'Кроссовки Adidas Duramo')
  AND warehouse_id = (SELECT id FROM warehouses WHERE name = 'Варшавка');

COMMIT;`
        },

        variant2: {
            1: `SELECT d.name AS отдел, AVG(e.salary) AS средняя_зарплата
FROM departments d
JOIN employees e ON e.department_id = d.id
GROUP BY d.id, d.name
HAVING AVG(e.salary) > (SELECT AVG(salary) FROM employees);`,
            2: `SELECT e.full_name AS ФИО, e.position AS должность, e.salary AS зарплата
FROM employees e
WHERE e.salary > (
    SELECT AVG(e2.salary)
    FROM employees e2
    WHERE e2.department_id = e.department_id
);`,
            3: `SELECT p.name AS название_проекта, p.client AS клиент
FROM projects p
WHERE NOT EXISTS (
    SELECT 1
    FROM employee_projects ep
    WHERE ep.project_id = p.id
      AND ep.role = 'Тестировщик'
);`,
            4: `SELECT e.full_name AS ФИО, d.name AS отдел, e.salary AS зарплата,
       RANK() OVER (PARTITION BY e.department_id ORDER BY e.salary DESC) AS ранг
FROM employees e
JOIN departments d ON d.id = e.department_id;`,
            5: `SELECT клиент, проект, бюджет, номер_в_рейтинге
FROM (
    SELECT client AS клиент, name AS проект, budget AS бюджет,
           ROW_NUMBER() OVER (PARTITION BY client ORDER BY budget DESC, id) AS номер_в_рейтинге
    FROM projects
)
WHERE номер_в_рейтинге <= 2;`,
            6: `SELECT e.full_name AS ФИО_сотрудника, e.salary AS зарплата_сотрудника,
       m.full_name AS ФИО_руководителя, m.salary AS зарплата_руководителя
FROM employees e
JOIN departments d ON d.id = e.department_id
JOIN employees m ON m.id = d.manager_id
WHERE e.salary > m.salary;`,
            7: `SELECT CASE
           WHEN salary < 70000 THEN 'junior'
           WHEN salary <= 90000 THEN 'middle'
           ELSE 'senior'
       END AS грейд,
       COUNT(*) AS количество_сотрудников,
       SUM(salary) AS суммарный_фонд_оплаты
FROM employees
GROUP BY грейд
ORDER BY MIN(salary);`,
            8: `-- Проверяется итоговое состояние таблицы employees
UPDATE employees
SET salary = salary * 1.15
WHERE id IN (
    SELECT employee_id
    FROM employee_projects
    GROUP BY employee_id
    HAVING SUM(hours_worked) > 100
);`,
            9: `-- Проверяется итоговое состояние таблицы employee_projects
DELETE FROM employee_projects
WHERE hours_worked = 0;`,
            10: `-- Проверяются таблицы projects и employee_projects
BEGIN TRANSACTION;

INSERT INTO projects (id, name, client, budget, status)
VALUES (5009, 'Портал обучения', 'ООО Мебельстрой', 450000.00, 'planning');

INSERT INTO employee_projects (employee_id, project_id, role, hours_worked)
VALUES (102, 5009, 'Ведущий разработчик', 80);

INSERT INTO employee_projects (employee_id, project_id, role, hours_worked)
VALUES (105, 5009, 'Тестировщик', 50);

COMMIT;`
        },

        variant3: {
            1: `SELECT s.full_name AS ФИО, AVG(g.grade) AS средний_балл
FROM students s
JOIN grades g ON g.student_id = s.id
GROUP BY s.id, s.full_name
HAVING AVG(g.grade) >= 4.5;`,
            2: `SELECT c.course_name AS курс, AVG(g.grade) AS средняя_оценка
FROM courses c
JOIN grades g ON g.course_id = c.id
GROUP BY c.id, c.course_name
HAVING AVG(g.grade) > (SELECT AVG(grade) FROM grades);`,
            3: `SELECT s.full_name AS ФИО, s.faculty AS факультет
FROM students s
WHERE NOT EXISTS (
    SELECT 1
    FROM grades g
    JOIN courses c ON c.id = g.course_id
    WHERE g.student_id = s.id
      AND c.semester = 2
);`,
            4: `SELECT факультет, ФИО, средний_балл
FROM (
    SELECT s.faculty AS факультет, s.full_name AS ФИО,
           AVG(g.grade) AS средний_балл,
           ROW_NUMBER() OVER (PARTITION BY s.faculty ORDER BY AVG(g.grade) DESC, s.id) AS номер_в_рейтинге
    FROM students s
    JOIN grades g ON g.student_id = s.id
    GROUP BY s.id, s.full_name, s.faculty
)
WHERE номер_в_рейтинге = 1;`,
            5: `SELECT CASE grade
           WHEN 5 THEN 'отлично'
           WHEN 4 THEN 'хорошо'
           WHEN 3 THEN 'удовлетворительно'
           WHEN 2 THEN 'неудовлетворительно'
           ELSE 'другое'
       END AS категория,
       COUNT(*) AS количество_оценок
FROM grades
GROUP BY категория
ORDER BY MIN(grade) DESC;`,
            6: `SELECT s.full_name AS ФИО_студента, g.grade AS оценка, t.full_name AS ФИО_преподавателя
FROM grades g
JOIN students s ON s.id = g.student_id
JOIN courses c ON c.id = g.course_id
JOIN teachers t ON t.id = c.teacher_id
WHERE c.course_name = 'Базы данных';`,
            7: `SELECT strftime('%m', exam_date) AS месяц, COUNT(*) AS количество_экзаменов
FROM grades
GROUP BY strftime('%m', exam_date)
ORDER BY месяц;`,
            8: `-- Проверяется итоговое состояние таблицы students
UPDATE students
SET scholarship = scholarship + 300
WHERE NOT EXISTS (
    SELECT 1
    FROM grades g
    WHERE g.student_id = students.id
      AND g.grade < 4
);`,
            9: `-- Проверяется итоговое состояние таблицы grades
DELETE FROM grades
WHERE grade < 3;`,
            10: `-- Проверяются таблицы teachers, courses и grades
BEGIN TRANSACTION;

INSERT INTO teachers (id, full_name, department, position, experience_years)
VALUES (307, 'Смирнова Наталья Викторовна', 'Программная инженерия', 'Доцент', 9);

INSERT INTO courses (id, course_name, teacher_id, credits, semester)
VALUES (209, 'Компьютерные сети', 307, 4, 2);

INSERT INTO grades (student_id, course_id, grade, exam_date)
VALUES (1009, 209, 5, '2023-06-28');

COMMIT;`
        },

        variant4: {
            1: `SELECT c.full_name AS клиент, SUM(o.total_amount) AS сумма_заказов
FROM customers c
JOIN orders o ON o.customer_id = c.id
GROUP BY c.id, c.full_name
HAVING SUM(o.total_amount) > 100000;`,
            2: `SELECT p.product_name AS товар, p.price AS цена
FROM products p
WHERE p.price > (
    SELECT AVG(p2.price)
    FROM products p2
    WHERE p2.category_id = p.category_id
);`,
            3: `SELECT child.category_name AS категория, parent.category_name AS родительская_категория
FROM categories child
LEFT JOIN categories parent ON parent.id = child.parent_category_id;`,
            4: `SELECT клиент, сумма_заказов, ранг
FROM (
    SELECT c.full_name AS клиент,
           COALESCE(SUM(o.total_amount), 0) AS сумма_заказов,
           RANK() OVER (ORDER BY COALESCE(SUM(o.total_amount), 0) DESC) AS ранг
    FROM customers c
    LEFT JOIN orders o ON o.customer_id = c.id
    GROUP BY c.id, c.full_name
);`,
            5: `SELECT товар, выручка
FROM (
    SELECT p.product_name AS товар,
           SUM(oi.quantity * oi.price) AS выручка,
           ROW_NUMBER() OVER (ORDER BY SUM(oi.quantity * oi.price) DESC, p.id) AS номер_в_рейтинге
    FROM order_items oi
    JOIN products p ON p.id = oi.product_id
    GROUP BY p.id, p.product_name
)
WHERE номер_в_рейтинге <= 3;`,
            6: `SELECT p.product_name AS товар, p.price AS цена
FROM products p
WHERE NOT EXISTS (
    SELECT 1
    FROM order_items oi
    WHERE oi.product_id = p.id
);`,
            7: `SELECT CASE
           WHEN сумма_заказов > 100000 THEN 'VIP'
           WHEN сумма_заказов >= 30000 THEN 'Постоянный'
           WHEN сумма_заказов > 0 THEN 'Новый'
           ELSE 'Без заказов'
       END AS сегмент,
       COUNT(*) AS количество_клиентов
FROM (
    SELECT c.id, COALESCE(SUM(o.total_amount), 0) AS сумма_заказов
    FROM customers c
    LEFT JOIN orders o ON o.customer_id = c.id
    GROUP BY c.id
)
GROUP BY сегмент
ORDER BY MIN(сумма_заказов) DESC;`,
            8: `-- Проверяется итоговое состояние таблицы orders
UPDATE orders
SET total_amount = total_amount * 0.9
WHERE status = 'обработка'
  AND total_amount > 30000;`,
            9: `-- Проверяется итоговое состояние таблицы products
DELETE FROM products
WHERE stock_quantity = 0
  AND NOT EXISTS (
      SELECT 1
      FROM order_items oi
      WHERE oi.product_id = products.id
  );`,
            10: `-- Проверяются таблицы orders, order_items и products
BEGIN TRANSACTION;

INSERT INTO orders (id, customer_id, order_date, total_amount, status)
VALUES (1015, 8, '2023-10-15', 43589.00, 'новый');

INSERT INTO order_items (order_id, product_id, quantity, price)
VALUES (1015, 105, 1, 38990.00);

INSERT INTO order_items (order_id, product_id, quantity, price)
VALUES (1015, 111, 1, 4599.00);

UPDATE products SET stock_quantity = stock_quantity - 1 WHERE id = 105;
UPDATE products SET stock_quantity = stock_quantity - 1 WHERE id = 111;

COMMIT;`
        }
    };
})();
