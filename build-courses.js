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

// 免费在线视频（B站公开课程，按课时匹配分P）
// 优先级：老师本地上传视频(l.video) > 在线免费课程(l.online)
const BILI = 'https://player.bilibili.com/player.html?bvid=';
const ONLINE_VIDEOS = {
  // ===== 必修第一册：泽哥《高一数学必修一同步全集 人教A版》BV1ct4y1t7pv =====
  'sy-g1-c1-l1': { bvid: 'BV1ct4y1t7pv', page: 2,  src: '泽哥·人教A版同步课' },
  'sy-g1-c1-l2': { bvid: 'BV1ct4y1t7pv', page: 5,  src: '泽哥·人教A版同步课' },
  'sy-g1-c1-l3': { bvid: 'BV1ct4y1t7pv', page: 9,  src: '泽哥·人教A版同步课' },
  'sy-g1-c2-l1': { bvid: 'BV1ct4y1t7pv', page: 12, src: '泽哥·人教A版同步课' },
  'sy-g1-c2-l2': { bvid: 'BV1ct4y1t7pv', page: 20, src: '泽哥·人教A版同步课' },
  'sy-g1-c2-l3': { bvid: 'BV1ct4y1t7pv', page: 15, src: '泽哥·人教A版同步课' },
  'sy-g1-c3-l1': { bvid: 'BV1ct4y1t7pv', page: 25, src: '泽哥·人教A版同步课' },
  'sy-g1-c3-l2': { bvid: 'BV1ct4y1t7pv', page: 31, src: '泽哥·人教A版同步课' },
  'sy-g1-c3-l3': { bvid: 'BV1ct4y1t7pv', page: 37, src: '泽哥·人教A版同步课' },
  'sy-g1-c4-l1': { bvid: 'BV1ct4y1t7pv', page: 46, src: '泽哥·人教A版同步课' },
  'sy-g1-c4-l2': { bvid: 'BV1ct4y1t7pv', page: 49, src: '泽哥·人教A版同步课' },
  'sy-g1-c4-l3': { bvid: 'BV1ct4y1t7pv', page: 55, src: '泽哥·人教A版同步课' },
  'sy-g1-c5-l1': { bvid: 'BV1ct4y1t7pv', page: 58, src: '泽哥·人教A版同步课' },
  'sy-g1-c5-l2': { bvid: 'BV1ct4y1t7pv', page: 59, src: '泽哥·人教A版同步课' },
  'sy-g1-c5-l3': { bvid: 'BV1ct4y1t7pv', page: 64, src: '泽哥·人教A版同步课' },
  'sy-g1-c5-l4': { bvid: 'BV1ct4y1t7pv', page: 68, src: '泽哥·人教A版同步课' },
  // ===== 必修第二册：泽哥《高一数学必修二 人教A版》BV1cK411S7N4 =====
  'sy-g1-c6-l1': { bvid: 'BV1cK411S7N4', page: 3,  src: '泽哥·人教A版同步课' },
  'sy-g1-c6-l2': { bvid: 'BV1cK411S7N4', page: 4,  src: '泽哥·人教A版同步课' },
  'sy-g1-c6-l3': { bvid: 'BV1cK411S7N4', page: 15, src: '泽哥·人教A版同步课' },
  'sy-g1-c7-l1': { bvid: 'BV1cK411S7N4', page: 22, src: '泽哥·人教A版同步课' },
  'sy-g1-c7-l2': { bvid: 'BV1cK411S7N4', page: 24, src: '泽哥·人教A版同步课' },
  'sy-g1-c8-l1': { bvid: 'BV1cK411S7N4', page: 26, src: '泽哥·人教A版同步课' },
  'sy-g1-c8-l2': { bvid: 'BV1cK411S7N4', page: 32, src: '泽哥·人教A版同步课' },
  'sy-g1-c8-l3': { bvid: 'BV1cK411S7N4', page: 35, src: '泽哥·人教A版同步课' },
  'sy-g1-c9-l1': { bvid: 'BV1cK411S7N4', page: 39, src: '泽哥·人教A版同步课' },
  'sy-g1-c9-l2': { bvid: 'BV1cK411S7N4', page: 47, src: '泽哥·人教A版同步课' },
  'sy-g1-c9-l3': { bvid: 'BV1cK411S7N4', page: 45, src: '泽哥·人教A版同步课' },
  // ===== 选择性必修第一册：泽哥《高二数学选必一 人教A版》BV1nR4y1X7wH =====
  'sy-g2-c1-l1': { bvid: 'BV1nR4y1X7wH', page: 2,  src: '泽哥·人教A版同步课' },
  'sy-g2-c1-l2': { bvid: 'BV1nR4y1X7wH', page: 14, src: '泽哥·人教A版同步课' },
  'sy-g2-c2-l1': { bvid: 'BV1nR4y1X7wH', page: 23, src: '泽哥·人教A版同步课' },
  'sy-g2-c2-l2': { bvid: 'BV1nR4y1X7wH', page: 34, src: '泽哥·人教A版同步课' },
  'sy-g2-c2-l3': { bvid: 'BV1nR4y1X7wH', page: 40, src: '泽哥·人教A版同步课' },
  'sy-g2-c3-l1': { bvid: 'BV1nR4y1X7wH', page: 54, src: '泽哥·人教A版同步课' },
  'sy-g2-c3-l2': { bvid: 'BV1nR4y1X7wH', page: 67, src: '泽哥·人教A版同步课' },
  'sy-g2-c3-l3': { bvid: 'BV1nR4y1X7wH', page: 81, src: '泽哥·人教A版同步课' },
  // ===== 选择性必修第二册：泽哥《高二数学选必二 人教A版》BV1uP411g7dU =====
  'sy-g2-c4-l1': { bvid: 'BV1uP411g7dU', page: 3,  src: '泽哥·人教A版同步课' },
  'sy-g2-c4-l2': { bvid: 'BV1uP411g7dU', page: 6,  src: '泽哥·人教A版同步课' },
  'sy-g2-c4-l3': { bvid: 'BV1uP411g7dU', page: 11, src: '泽哥·人教A版同步课' },
  'sy-g2-c5-l1': { bvid: 'BV1uP411g7dU', page: 21, src: '泽哥·人教A版同步课' },
  'sy-g2-c5-l2': { bvid: 'BV1uP411g7dU', page: 24, src: '泽哥·人教A版同步课' },
  'sy-g2-c5-l3': { bvid: 'BV1uP411g7dU', page: 25, src: '泽哥·人教A版同步课' },
  // ===== 选择性必修第三册：人教版空中课堂同步课 BV1YmCuBWExP =====
  'sy-g2-c6-l1': { bvid: 'BV1YmCuBWExP', page: 1,  src: '人教版空中课堂' },
  'sy-g2-c6-l2': { bvid: 'BV1YmCuBWExP', page: 15, src: '人教版空中课堂' },
  'sy-g2-c7-l1': { bvid: 'BV1YmCuBWExP', page: 24, src: '人教版空中课堂' },
  'sy-g2-c7-l2': { bvid: 'BV1YmCuBWExP', page: 33, src: '人教版空中课堂' },
  'sy-g2-c7-l3': { bvid: 'BV1YmCuBWExP', page: 36, src: '人教版空中课堂' },
  'sy-g2-c8-l1': { bvid: 'BV1YmCuBWExP', page: 40, src: '人教版空中课堂' },
  'sy-g2-c8-l2': { bvid: 'BV1YmCuBWExP', page: 42, src: '人教版空中课堂' },
};

// 把在线视频挂到没有本地上传视频的课时上（本地视频优先，不覆盖）
let onlineCount = 0;
GRADES.forEach((g) => {
  out.byGrade[g].forEach((ch) => {
    ch.lessons.forEach((l) => {
      if (!l.video && ONLINE_VIDEOS[l.id]) {
        const v = ONLINE_VIDEOS[l.id];
        l.online = { bvid: v.bvid, page: v.page, src: v.src,
          url: BILI + v.bvid + '&page=' + v.page + '&autoplay=0&danmaku=0' };
        onlineCount++;
      }
    });
  });
});

// 输出目标：App 服务端（线上 /api/app/courses 数据源）+ App 内置兜底
const targets = [
  path.join(__dirname, '..', 'hs-math-study-web', 'courses.json'),
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
console.log(`[build-courses] 课时 ${lessons} 节，本地上传视频 ${videos} 节，免费在线课程 ${onlineCount} 节，${kb}KB`);
targets.forEach((t) => console.log('  ->', t));
