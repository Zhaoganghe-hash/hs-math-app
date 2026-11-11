// 构建远程课程表：输出 courses.json 到 App 服务端目录
// 用途：App 启动时从 /api/app/courses 拉取，更新课程/视频无需重新编译安装
const fs = require('fs');
const path = require('path');

const MP = path.join(__dirname, '..', 'hs-math-miniprogram');
const { classForGrade, lessonCount } = require(path.join(MP, 'data', 'class.js'));

const GRADES = ['高一', '高二', '高三一轮', '高三二轮'];
const out = { version: Date.now(), grades: GRADES, byGrade: {}, count: {} };

GRADES.forEach((g) => {
  out.byGrade[g] = classForGrade(g);
  out.count[g] = lessonCount(g);
});

const targets = [
  path.join(__dirname, '..', 'hs-math-app-server', 'courses.json'),
  path.join(__dirname, 'www', 'courses.json'),
];

targets.forEach((t) => {
  fs.mkdirSync(path.dirname(t), { recursive: true });
  fs.writeFileSync(t, JSON.stringify(out), 'utf8');
});

const kb = Math.round(fs.statSync(targets[0]).size / 1024);
const lessons = GRADES.reduce((s, g) => s + out.count[g], 0);
const videos = GRADES.reduce((s, g) => s + out.byGrade[g].reduce((n, c) =>
  n + c.lessons.filter((l) => l.video).length, 0), 0);
console.log(`[build-courses] 课时 ${lessons} 节，已配视频 ${videos} 节，${kb}KB`);
targets.forEach((t) => console.log('  ->', t));
