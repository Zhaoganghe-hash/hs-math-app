// 构建脚本：把小程序 data/class.js 的课程数据导出为浏览器可直接用的 data.bundle.js
// 数据源仍是 hs-math-miniprogram/data（单一事实来源，改课程不用改这里）
const fs = require('fs');
const path = require('path');

const MP = path.join(__dirname, '..', 'hs-math-miniprogram');
const { classForGrade, lessonCount } = require(path.join(MP, 'data', 'class.js'));

const GRADES = ['高一', '高二', '高三一轮', '高三二轮'];
const out = { grades: GRADES, byGrade: {}, count: {}, builtAt: '' };

GRADES.forEach((g) => {
    out.byGrade[g] = classForGrade(g);
    out.count[g] = lessonCount(g);
});
out.builtAt = new Date().toISOString();

const target = path.join(__dirname, 'www', 'data.bundle.js');
fs.writeFileSync(target, 'window.HS_DATA=' + JSON.stringify(out) + ';\n', 'utf8');

const kb = Math.round(fs.statSync(target).size / 1024);
const lessons = GRADES.reduce((s, g) => s + out.count[g], 0);
console.log(`[build-data] 年级 ${GRADES.length} 个，课时 ${lessons} 节，输出 ${kb}KB -> ${target}`);
