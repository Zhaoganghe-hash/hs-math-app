// H5 运行时验证：jsdom 加载 www，模拟首页 → 列表 → 播放（跳检测）→ 全部作答 → 提交 → 自评全流程
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const WWW = path.join(__dirname, 'www');
const posted = [];

const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div></body></html>', {
    url: 'http://localhost/index.html#/home',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
});
const { window } = dom;

// fetch 桩：记录上报
window.fetch = function (url, opts) {
    posted.push({ url, body: opts ? JSON.parse(opts.body) : null });
    return Promise.resolve({ json: function () { return Promise.resolve({ ok: true }); } });
};
// 其他浏览器 API 桩
window.scrollTo = function () {};
if (!window.Element.prototype.closest) {
    window.Element.prototype.closest = function (sel) {
        let el = this;
        while (el && !el.matches(sel)) el = el.parentElement;
        return el;
    };
}

// 依序执行页面脚本
function run(file) {
    window.eval(fs.readFileSync(path.join(WWW, file), 'utf8'));
}
run('data.bundle.js');
run('math.js');
run('app.js');

function click(el) { el.dispatchEvent(new window.Event('click', { bubbles: true })); }
function input(el, v) {
    el.value = v;
    el.dispatchEvent(new window.Event('input', { bubbles: true }));
}
const $ = (s) => window.document.querySelector(s);
const $$ = (s) => Array.from(window.document.querySelectorAll(s));
let pass = 0, fail = 0;
function check(name, cond) {
    if (cond) { pass++; console.log('  ✓ ' + name); }
    else { fail++; console.log('  ✗ ' + name); }
}

(async () => {
    // 1. 首页
    check('首页：两大任务卡', $('#app').innerHTML.includes('课堂教学') && $('#app').innerHTML.includes('课堂检测'));
    check('首页：年级切换默认高一', $('.grade-item.active') && $('.grade-item.active').textContent === '高一');

    // 2. 进入课堂列表
    window.location.hash = '#/list';
    window.dispatchEvent(new window.HashChangeEvent('hashchange'));
    check('列表：标题', $('#app').innerHTML.includes('课堂教学'));
    const chHead = $('[data-ch]');
    click(chHead);
    check('列表：章节展开出现课时', $$('.lesson').length > 0);
    check('列表：1.1 显示视频已就绪', $('#app').innerHTML.includes('视频已就绪'));

    // 3. 打开 1.1（视频模式）
    const lessonLink = $$('.lesson').find((el) => el.innerHTML.includes('1.1'));
    click(lessonLink);
    // 列表 data-go 处理在 hashchange，直接导航
    window.location.hash = '#/lesson/sy-g1-c1-l1';
    window.dispatchEvent(new window.HashChangeEvent('hashchange'));
    await new Promise((r) => setTimeout(r, 100));
    check('播放页：video 元素存在', !!$('video'));
    check('播放页：计时 30:00', $('#clock') && $('#clock').textContent === '30:00');
    check('播放页：上报"开始"学习记录', posted.some((p) => p.url.includes('/api/app/record') && p.body.qid === 'sy-g1-c1-l1' && p.body.level === '开始'));

    // 4. 提前进检测
    click($('#toQuiz'));
    click($('#start'));
    check('检测页：6 题渲染', $$('.q-card').length === 6);
    check('检测页：2 选择 + 2 填空 + 2 简答', $$('.option').length > 0 && $$('.fill-input').length === 2 && $$('.essay-input').length === 2);

    // 5. 全部作答并提交（选项按 ABCD 依次点第 1 个，填空填 x，简答填文字）
    $$('.q-card').forEach((card) => {
        const opt = card.querySelector('.option');
        const fill = card.querySelector('.fill-input');
        const essay = card.querySelector('.essay-input');
        if (opt) click(opt);
        if (fill) input(fill, 'x');
        if (essay) input(essay, '解：过程略。');
    });
    click($('#submit'));
    check('结果页：得分显示', !!$('.result-score'));
    check('结果页：上报 4 条客观题记录', posted.filter((p) => p.url.includes('/api/app/record') && p.body.source === '课堂检测' && p.body.level !== '简答').length >= 4);
    check('结果页：上报 2 条简答原文', posted.filter((p) => p.body.answer_text).length === 2);
    check('结果页：上报检测成绩', posted.some((p) => p.url.includes('/api/app/quiz-result')));

    // 6. 简答自评（答对一题）
    const okBtn = $('.self-btn.ok');
    click(okBtn);
    check('自评：成绩更新且剩余一题待自评', $('#app').innerHTML.includes('自评正确') && $('#app').innerHTML.includes('待自评'));

    // 7. 检测中心
    window.location.hash = '#/quiz';
    window.dispatchEvent(new window.HashChangeEvent('hashchange'));
    check('检测中心：进度显示已完成 1 课时', $('#app').innerHTML.includes('已完成 1/'));
    check('检测中心：1.1 显示成绩', $('#app').innerHTML.includes('重做 ›'));

    console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
    process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('异常:', e); process.exit(1); });
