/* 高中数学研习 · 移动端应用（iOS/Android 内嵌 + 浏览器均可运行）
   数据来源：www/data.bundle.js（由小程序 data/class.js 构建）
   答题数据：POST 到学情后台 /api/app/*（后台功能与数据表不变） */
(function () {
    'use strict';

    var REMOTE_BASE = 'https://hs-math-study-97106.app.workbuddy.host';
    var SHARE = 'SAIUBL3ZQI'; // 平台网关要求所有请求带 sharecode
    var IS_NATIVE = location.protocol === 'capacitor:' || location.protocol === 'file:';
    var API_BASE = IS_NATIVE ? REMOTE_BASE : '';

    var LESSON_SECONDS = 30 * 60;
    var DATA = window.HS_DATA;

    /* ---------------- 本地存储 ---------------- */
    var K = { grade: 'hs_grade', name: 'hs_name', device: 'hs_device_id', quiz: 'hs_class_quiz' };
    function lsGet(k, dft) {
        try { var v = localStorage.getItem(k); return v === null ? dft : JSON.parse(v); } catch (e) { return dft; }
    }
    function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

    function deviceId() {
        var id = lsGet(K.device, '');
        if (!id) { id = 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); lsSet(K.device, id); }
        return id;
    }
    function ownerId() { return 'dev:' + deviceId(); }
    function grade() { return lsGet(K.grade, '高一'); }
    function setGrade(g) { lsSet(K.grade, g); }
    function remark() { return lsGet(K.name, ''); }
    function setRemark(n) { lsSet(K.name, n); }
    function quizResults() { return lsGet(K.quiz, {}); }
    function setQuizResult(id, res) { var all = quizResults(); all[id] = res; lsSet(K.quiz, all); }

    /* ---------------- 上报接口 ---------------- */
    function post(path, body) {
        return fetch(API_BASE + path + '?sharecode=' + SHARE, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        }).then(function (r) { return r.json().catch(function () { return {}; }); })
          .catch(function () { return { ok: false, offline: true }; });
    }

    /* ---- 远程课程表：服务器更新课程/视频后，App 重开即生效，无需重装 ---- */
    var COURSE_CACHE = 'hs_courses_v1';

    function applyCourses(json) {
        if (!json || !json.grades || !json.byGrade) return false;
        DATA = json;
        window.HS_DATA = json;
        return true;
    }

    function fetchCourses() {
        return fetch(API_BASE + '/api/app/courses?sharecode=' + SHARE, { method: 'GET' })
            .then(function (r) { return r.ok ? r.json() : null; })
            .catch(function () { return null; });
    }

    function addRecord(rec) {
        var row = {
            source: rec.source,
            module: rec.module || null,
            sub: rec.sub || null,
            qid: rec.qid ? String(rec.qid) : null,
            level: rec.level || null,
            correct: rec.correct === true ? true : (rec.correct === false ? false : null),
            duration: Math.max(0, Math.min(1800, Math.round(rec.duration || 0))),
            grade: grade(),
            owner_name: remark() || null,
            owner_id: ownerId()
        };
        if (rec.answerText) row.answer_text = String(rec.answerText).slice(0, 500);
        return post('/api/app/record', row);
    }
    function reportLearn(lesson, phase) {
        return addRecord({
            source: '课堂学习', module: lesson.chapterName, sub: lesson.name, qid: lesson.id,
            level: phase === 'done' ? '完成' : '开始', duration: phase === 'done' ? 1800 : 0
        });
    }
    function saveQuizResult(rec) {
        return post('/api/app/quiz-result', {
            lesson_id: rec.lessonId, lesson_name: rec.lessonName || null, module: rec.module || null,
            score: Math.max(0, Math.round(rec.score || 0)), total: Math.max(1, Math.round(rec.total || 6)),
            grade: grade(), owner_name: remark() || null, owner_id: ownerId()
        });
    }

    /* ---------------- 工具 ---------------- */
    function esc(s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function mx(s) { return window.latexToHtml ? window.latexToHtml(String(s || '')) : esc(s); }
    function norm(s) { return String(s || '').trim().replace(/\s+/g, '').toLowerCase(); }
    function mmss(sec) { return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'); }

    var toastTimer = null;
    function toast(msg, ms) {
        var old = document.querySelector('.toast');
        if (old) old.remove();
        var el = document.createElement('div');
        el.className = 'toast';
        el.textContent = msg;
        document.body.appendChild(el);
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { el.remove(); }, ms || 1800);
    }

    function findLesson(id) {
        var grades = DATA.grades;
        for (var i = 0; i < grades.length; i++) {
            var chs = DATA.byGrade[grades[i]] || [];
            for (var j = 0; j < chs.length; j++) {
                for (var k = 0; k < chs[j].lessons.length; k++) {
                    if (chs[j].lessons[k].id === id) return chs[j].lessons[k];
                }
            }
        }
        return null;
    }

    /* ---------------- 路由 ---------------- */
    var app = document.getElementById('app');
    var timer = null;
    var state = {};

    function stopTimer() { if (timer) { clearInterval(timer); timer = null; } }

    function route() {
        stopTimer();
        var hash = location.hash.replace(/^#/, '') || '/home';
        var parts = hash.split('/').filter(Boolean);
        var view = parts[0] || 'home';

        if (view === 'home') return renderHome();
        if (view === 'list') return renderList();
        if (view === 'lesson') return renderLesson(parts[1]);
        if (view === 'mock') return parts[1] ? renderMockPaper(parts[1]) : renderMockList();
        return renderHome();
    }

    window.addEventListener('hashchange', route);

    function go(path) { location.hash = path; }

    /* ---------------- 首页 ---------------- */
    function renderHome() {
        var grades = DATA.grades;
        var g = grade();
        var lessons = DATA.count[g] || 0;
        var name = remark() || '同学';
        app.innerHTML =
            '<div class="screen dark">' +
                '<div class="topbar">' +
                    '<div class="brand">高中数学研习</div>' +
                    '<div class="top-btn" id="editName">✎ ' + esc(name) + '</div>' +
                '</div>' +
                '<div class="grade-switch">' + grades.map(function (x) {
                    return '<div class="grade-item' + (x === g ? ' active' : '') + '" data-g="' + esc(x) + '">' + esc(x) + '</div>';
                }).join('') + '</div>' +
                '<div class="task-card task-class" data-go="#/list">' +
                    '<div class="task-icon">🎬</div>' +
                    '<div class="task-body">' +
                        '<div class="task-title">课堂教学</div>' +
                        '<div class="task-desc">分年级 · 分章节 · 分课时视频课，每节 30 分钟</div>' +
                        '<div class="task-meta">当前年级共 ' + lessons + ' 课时 · 学完自动弹出检测</div>' +
                    '</div>' +
                    '<div class="task-go">开始上课 ›</div>' +
                '</div>' +
                '<div class="task-card task-mock" data-go="#/mock">' +
                    '<div class="task-icon">📄</div>' +
                    '<div class="task-body">' +
                        '<div class="task-title">全真模拟</div>' +
                        '<div class="task-desc">老师上传的全真模拟卷，按考试时间限时作答，交卷即可看成绩</div>' +
                        '<div class="task-meta">交卷后全卷自动批阅 · 解答题按答案解析AI评分 · 成绩回传老师</div>' +
                    '</div>' +
                    '<div class="task-go">进入模拟 ›</div>' +
                '</div>' +
            '</div>' + tabbar(0);

        app.querySelectorAll('.grade-item').forEach(function (el) {
            el.addEventListener('click', function () {
                setGrade(el.getAttribute('data-g'));
                renderHome();
            });
        });
        app.querySelectorAll('[data-go]').forEach(function (el) {
            el.addEventListener('click', function () { go(el.getAttribute('data-go')); });
        });
        document.getElementById('editName').addEventListener('click', function () { editNameDialog(); });
    }

    function editNameDialog() {
        var mask = document.createElement('div');
        mask.className = 'mask';
        mask.innerHTML =
            '<div class="dialog">' +
                '<div class="dialog-title">修改备注名</div>' +
                '<input class="dialog-input" id="nameInput" maxlength="20" placeholder="请输入备注名" value="' + esc(remark()) + '">' +
                '<div class="dialog-actions">' +
                    '<div class="dialog-btn cancel" id="cancelName">取消</div>' +
                    '<div class="dialog-btn confirm" id="saveName">保存</div>' +
                '</div>' +
            '</div>';
        document.body.appendChild(mask);
        var input = mask.querySelector('#nameInput');
        setTimeout(function () { input.focus(); }, 60);
        mask.querySelector('#cancelName').addEventListener('click', function () { mask.remove(); });
        mask.querySelector('#saveName').addEventListener('click', function () {
            var v = (input.value || '').trim();
            if (!v) { toast('备注名不能为空'); return; }
            setRemark(v);
            mask.remove();
            renderHome();
            toast('已保存');
        });
        mask.addEventListener('click', function (e) { if (e.target === mask) mask.remove(); });
    }

    /* ---------------- 章节列表 ---------------- */
    function renderList() {
        var grades = DATA.grades;
        var g = grade();
        var chapters = DATA.byGrade[g] || [];
        if (!window.__openCh) window.__openCh = {};
        var results = quizResults();

        var html =
            '<div class="screen">' +
                '<div class="page-head">' +
                    '<div class="back-btn" data-go="#/home">‹</div>' +
                    '<div><div class="page-title">课堂教学</div><div class="page-sub">' + esc(g) + ' · 共 ' + (DATA.count[g] || 0) + ' 课时</div></div>' +
                '</div>' +
                '<div class="grade-switch light">' + grades.map(function (x) {
                    return '<div class="grade-item' + (x === g ? ' active' : '') + '" data-g="' + esc(x) + '">' + esc(x) + '</div>';
                }).join('') + '</div>' +
                '<div class="tip">每节课 30 分钟，学完自动弹出 6 题课堂检测</div>';

        chapters.forEach(function (ch) {
            var open = !!window.__openCh[ch.id];
            html += '<div class="chapter">' +
                '<div class="ch-head" data-ch="' + esc(ch.id) + '">' +
                    '<div><div class="ch-name">' + esc(ch.name) + '</div>' +
                    '<div class="ch-sub">' + esc(ch.book || '') + ' · ' + ch.lessons.length + ' 课时</div></div>' +
                    '<div class="ch-arrow">' + (open ? '▾' : '▸') + '</div>' +
                '</div>';
            if (open) {
                html += '<div class="lessons">' + ch.lessons.map(function (l) {
                    var r = results[l.id];
                    return '<div class="lesson" data-go="#/lesson/' + esc(l.id) + '">' +
                        '<div class="lesson-main">' +
                            '<div class="lesson-name">' + mx(l.name) + '</div>' +
                            '<div class="lesson-meta">' +
                                '<span class="dot ' + (l.video || l.online ? 'dot-ok' : 'dot-wait') + '"></span>' +
                                '<span>' + (l.video ? '视频已就绪' : (l.online ? '免费课程·' + esc(l.online.src || '在线视频') : '视频待上传')) + '</span>' +
                                '<span>·</span><span>' + mmss(l.seconds || LESSON_SECONDS) + '</span>' +
                                (r ? '<span>·</span><span class="score">检测 ' + r.score + '/' + r.total + '</span>' : '') +
                            '</div>' +
                        '</div>' +
                        '<div class="lesson-go">进入课堂 ›</div>' +
                    '</div>';
                }).join('') + '</div>';
            }
            html += '</div>';
        });

        html += '</div>' + tabbar(0);
        app.innerHTML = html;

        app.querySelectorAll('.grade-item').forEach(function (el) {
            el.addEventListener('click', function () { setGrade(el.getAttribute('data-g')); renderList(); });
        });
        app.querySelectorAll('[data-ch]').forEach(function (el) {
            el.addEventListener('click', function () {
                var id = el.getAttribute('data-ch');
                window.__openCh[id] = !window.__openCh[id];
                renderList();
            });
        });
        app.querySelectorAll('[data-go]').forEach(function (el) {
            el.addEventListener('click', function () { go(el.getAttribute('data-go')); });
        });
    }

    /* ---------------- 课时（视频 + 检测） ---------------- */
    function renderLesson(id, jumpQuiz) {
        var lesson = findLesson(id);
        if (!lesson) { app.innerHTML = '<div class="empty">课时不存在</div>'; return; }
        state = { lesson: lesson, mode: jumpQuiz ? 'quiz' : 'video', remain: LESSON_SECONDS, reported: false, answers: {}, quiz: lesson.quiz.map(function (q) { return Object.assign({}, q); }), submitted: false, score: 0 };

        if (state.mode === 'video') {
            renderVideo();
            reportLearn(lesson, 'start');
            startTimer();
        } else {
            renderQuiz();
        }
    }

    function head(lesson) {
        return '<div class="page-head">' +
            '<div class="back-btn" data-go="#/list">‹</div>' +
            '<div><div class="page-title">' + mx(lesson.name) + '</div>' +
            '<div class="page-sub">' + esc(lesson.chapterName) + ' · ' + esc(lesson.book || '') + '</div></div>' +
        '</div>';
    }

    function renderVideo() {
        var l = state.lesson;
        app.innerHTML = '<div class="screen">' + head(l) +
            '<div class="video-box">' + (l.video
                ? '<video id="vd" src="' + esc(l.video) + '" controls playsinline webkit-playsinline preload="metadata"></video>'
                : (l.online
                    ? '<iframe id="vd" src="' + esc(l.online.url) + '" scrolling="no" frameborder="no" allowfullscreen="true" style="width:100%;height:100%;border:0;"></iframe>' +
                      '<div class="ve-src">免费课程：' + esc(l.online.src || 'B站公开课') + '（需联网观看）</div>'
                    : '<div class="video-empty"><div class="ve-icon">📹</div><div class="ve-title">本课时视频待上传</div><div class="ve-desc">老师上传后即可观看（课时 ' + esc(l.id) + '）</div></div>')) +
            '</div>' +
            '<div class="timer-card">' +
                '<div class="timer-label">课堂剩余时间</div>' +
                '<div class="timer-num" id="clock">' + mmss(state.remain) + '</div>' +
                '<div class="timer-note">30 分钟结束后自动弹出 6 题课堂检测</div>' +
            '</div>' +
            '<div class="btn-row">' +
                '<button class="btn ghost" id="restart">重新计时</button>' +
                '<button class="btn primary" id="toQuiz">开始课堂检测</button>' +
            '</div></div>' + tabbar(0);

        app.querySelectorAll('[data-go]').forEach(function (el) {
            el.addEventListener('click', function () { go(el.getAttribute('data-go')); });
        });
        document.getElementById('restart').addEventListener('click', function () {
            stopTimer();
            state.remain = LESSON_SECONDS;
            state.reported = false;
            document.getElementById('clock').textContent = mmss(state.remain);
            startTimer();
        });
        document.getElementById('toQuiz').addEventListener('click', function () { askQuiz(); });
    }

    function startTimer() {
        stopTimer();
        timer = setInterval(function () {
            state.remain -= 1;
            var clock = document.getElementById('clock');
            if (state.remain <= 0) {
                stopTimer();
                state.remain = 0;
                if (clock) clock.textContent = '0:00';
                reportDone();
                toast('课堂时间到，开始检测', 2000);
                state.mode = 'quiz';
                renderQuiz();
                return;
            }
            if (clock) clock.textContent = mmss(state.remain);
        }, 1000);
    }

    function reportDone() {
        if (state.reported) return;
        state.reported = true;
        reportLearn(state.lesson, 'done');
    }

    function askQuiz() {
        var mask = document.createElement('div');
        mask.className = 'mask';
        mask.innerHTML =
            '<div class="dialog light">' +
                '<div class="dialog-title">进入课堂检测</div>' +
                '<div class="dialog-msg">提前检测也可以，但要先认真听完这节课哦。现在开始 6 题检测吗？</div>' +
                '<div class="dialog-actions">' +
                    '<div class="dialog-btn cancel" id="keep">继续上课</div>' +
                    '<div class="dialog-btn confirm" id="start">开始检测</div>' +
                '</div>' +
            '</div>';
        document.body.appendChild(mask);
        mask.querySelector('#keep').addEventListener('click', function () { mask.remove(); });
        mask.querySelector('#start').addEventListener('click', function () {
            mask.remove();
            stopTimer();
            if (state.remain === 0) reportDone();
            state.mode = 'quiz';
            renderQuiz();
        });
    }

    function renderQuiz() {
        var quiz = state.quiz;
        var html = '<div class="screen">' + head(state.lesson) +
            '<div class="tip">课堂检测 · 共 ' + quiz.length + ' 题（2 选择 + 2 填空 + 2 简答）</div>';

        quiz.forEach(function (q, i) {
            var ans = state.answers[q.id];
            html += '<div class="q-card">' +
                '<div class="q-top"><span class="q-no">' + (i + 1) + '</span>' +
                '<span class="q-type">' + (q.type === 'choice' ? '选择题' : q.type === 'fill' ? '填空题' : '简答题') + '</span>' +
                '<span class="q-level">' + esc(q.level || '') + '</span></div>' +
                '<div class="q-stem">' + mx(q.stem) + '</div>';

            if (q.type === 'choice') {
                (q.options || []).forEach(function (opt, idx) {
                    html += '<div class="option' + (ans === idx ? ' active' : '') + '" data-q="' + esc(q.id) + '" data-i="' + idx + '">' +
                        '<span class="opt-key">' + 'ABCD'[idx] + '</span><div class="opt-text">' + mx(opt) + '</div></div>';
                });
            } else if (q.type === 'fill') {
                html += '<input class="fill-input" data-q="' + esc(q.id) + '" placeholder="在此填写答案" value="' + esc(ans || '') + '">';
            } else {
                html += '<textarea class="essay-input" maxlength="500" data-q="' + esc(q.id) + '" placeholder="写出解答过程（含关键步骤）">' + esc(ans || '') + '</textarea>';
            }
            html += '</div>';
        });

        html += '<button class="btn primary big" id="submit">提交检测</button></div>' + tabbar(0);
        app.innerHTML = html;

        app.querySelectorAll('.option').forEach(function (el) {
            el.addEventListener('click', function () {
                state.answers[el.getAttribute('data-q')] = Number(el.getAttribute('data-i'));
                renderQuiz();
            });
        });
        app.querySelectorAll('input[data-q], textarea[data-q]').forEach(function (el) {
            el.addEventListener('input', function () { state.answers[el.getAttribute('data-q')] = el.value; });
        });
        document.getElementById('submit').addEventListener('click', submitQuiz);
    }

    function submitQuiz() {
        var quiz = state.quiz, answers = state.answers, lesson = state.lesson;
        var missing = quiz.some(function (q) { return answers[q.id] === undefined || answers[q.id] === ''; });
        if (missing) { toast('还有题目没作答'); return; }

        var spent = LESSON_SECONDS - state.remain;
        var perQ = Math.round(spent / quiz.length);
        var score = 0;

        var graded = quiz.map(function (q) {
            var ans = answers[q.id];
            var correct = null;
            if (q.type === 'choice') {
                correct = ans === q.answer;
                if (correct) score++;
                addRecord({ source: '课堂检测', module: lesson.chapterName, sub: lesson.name, qid: q.id, level: q.level, correct: correct, duration: perQ });
            } else if (q.type === 'fill') {
                correct = norm(ans) === norm(q.answer);
                if (correct) score++;
                addRecord({ source: '课堂检测', module: lesson.chapterName, sub: lesson.name, qid: q.id, level: q.level, correct: correct, duration: perQ });
            } else {
                addRecord({ source: '课堂检测', module: lesson.chapterName, sub: lesson.name, qid: q.id, level: '简答', correct: null, duration: perQ, answerText: ans });
            }
            return Object.assign({}, q, { correct: correct, myAns: ans });
        });

        state.submitted = true;
        state.score = score;
        state.quiz = graded;
        var today = new Date().toISOString().slice(0, 10);
        setQuizResult(lesson.id, { date: today, score: score, total: quiz.length });
        saveQuizResult({ lessonId: lesson.id, lessonName: lesson.name, module: lesson.chapterName, score: score, total: quiz.length });
        renderResult();
    }

    function renderResult() {
        var lesson = state.lesson, quiz = state.quiz, total = quiz.length, score = state.score;
        var word = score === total ? '满分！本节课掌握得非常好'
            : score >= total * 0.7 ? '掌握良好，错题再巩固一下'
            : '本节课需要重新学习，建议再看一遍视频';

        var html = '<div class="screen">' + head(lesson) +
            '<div class="result-card"><div class="result-score">' + score + '<span class="result-total">/' + total + '</span></div>' +
            '<div class="result-word">' + word + '</div></div>';

        quiz.forEach(function (q, i) {
            var verdict;
            if (q.type === 'essay') {
                verdict = q.selfJudged ? (q.correct ? '✓ 自评正确' : '✗ 自评错误') : '待自评';
                verdict = '<span class="q-verdict ' + (q.selfJudged ? (q.correct ? 'v-ok' : 'v-no') : 'v-wait') + '">' + verdict + '</span>';
            } else {
                verdict = '<span class="q-verdict ' + (q.correct ? 'v-ok' : 'v-no') + '">' + (q.correct ? '✓ 正确' : '✗ 错误') + '</span>';
            }
            html += '<div class="q-card">' +
                '<div class="q-top"><span class="q-no">' + (i + 1) + '</span>' + verdict + '</div>' +
                '<div class="q-stem">' + mx(q.stem) + '</div>';

            if (q.type === 'choice') {
                html += '<div class="r-line">正确答案：<span class="r-strong">' + esc(q.answer) + '</span></div>';
            } else if (q.type === 'fill') {
                html += '<div class="r-line">正确答案：<span class="r-strong">' + mx(q.answer) + '</span></div>';
            } else {
                html += '<div class="r-line">我的作答：<span class="r-strong">' + esc(q.myAns) + '</span></div>' +
                    '<div class="r-line">参考答案：<span class="r-strong">' + mx(q.ref) + '</span></div>';
                if (!q.selfJudged) {
                    html += '<div class="self-row"><div class="self-btn ok" data-q="' + esc(q.id) + '" data-ok="1">对照后：我答对了</div>' +
                        '<div class="self-btn no" data-q="' + esc(q.id) + '" data-ok="0">我答错了</div></div>';
                }
            }
            if (q.analysis && q.type !== 'essay') html += '<div class="r-line r-ana">解析：' + mx(q.analysis) + '</div>';
            html += '</div>';
        });

        html += '<div class="btn-row"><button class="btn ghost" id="redo">重做检测</button>' +
            '<button class="btn primary" id="backClass">返回课堂</button></div></div>' + tabbar(0);
        app.innerHTML = html;

        app.querySelectorAll('.self-btn').forEach(function (el) {
            el.addEventListener('click', function () {
                selfJudge(el.getAttribute('data-q'), el.getAttribute('data-ok') === '1');
            });
        });
        document.getElementById('redo').addEventListener('click', function () {
            state.answers = {};
            state.submitted = false;
            state.remain = LESSON_SECONDS;
            state.reported = false;
            state.quiz = state.lesson.quiz.map(function (q) { return Object.assign({}, q); });
            state.mode = 'video';
            renderVideo();
            startTimer();
        });
        document.getElementById('backClass').addEventListener('click', function () { go('#/list'); });
        app.querySelectorAll('[data-go]').forEach(function (el) {
            el.addEventListener('click', function () { go(el.getAttribute('data-go')); });
        });
    }

    function selfJudge(qid, ok) {
        var lesson = state.lesson;
        state.quiz = state.quiz.map(function (q) {
            if (q.id !== qid || q.type !== 'essay' || q.selfJudged) return q;
            addRecord({ source: '课堂检测', module: lesson.chapterName, sub: lesson.name, qid: q.id, level: '简答', correct: ok, duration: 0 });
            return Object.assign({}, q, { correct: ok, selfJudged: true });
        });
        state.score = state.quiz.filter(function (q) { return q.correct === true; }).length;
        setQuizResult(lesson.id, { date: new Date().toISOString().slice(0, 10), score: state.score, total: state.quiz.length });
        saveQuizResult({ lessonId: lesson.id, lessonName: lesson.name, module: lesson.chapterName, score: state.score, total: state.quiz.length });
        renderResult();
    }

    /* ---------------- 全真模拟 ---------------- */
    var MOCK_BEST = 'hs_mock_best';
    function mockBest() { return lsGet(MOCK_BEST, {}); }
    function setMockBest(id, res) {
        var all = mockBest();
        if (!all[id] || res.score > all[id].score) { all[id] = res; lsSet(MOCK_BEST, all); }
    }

    function apiGet(path) {
        var url = API_BASE + path + (path.indexOf('?') >= 0 ? '&' : '?') + 'sharecode=' + SHARE;
        return fetch(url, { method: 'GET' }).then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        });
    }

    // 题干支持换行与图片：![说明](https://...)
    function rich(s) {
        return String(s == null ? '' : s).split(/(!\[[^\]]*\]\([^)]+\))/g).map(function (t) {
            var m = /^!\[([^\]]*)\]\(([^)]+)\)$/.exec(t);
            if (m) return '<img class="q-img" src="' + esc(m[2]) + '" alt="' + esc(m[1]) + '">';
            return mx(t).replace(/\n/g, '<br>');
        }).join('');
    }

    function clockText(sec) {
        sec = Math.max(0, Math.round(sec));
        var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
        var p = function (n) { return String(n).padStart(2, '0'); };
        return h > 0 ? h + ':' + p(m) + ':' + p(s) : m + ':' + p(s);
    }

    function renderMockList() {
        var g = grade();
        app.innerHTML = '<div class="screen">' +
            '<div class="page-head"><div class="back-btn" data-go="#/home">‹</div>' +
            '<div><div class="page-title">全真模拟</div><div class="page-sub">限时作答 · 交卷即出分 · 成绩回传老师</div></div></div>' +
            '<div class="grade-switch light">' + DATA.grades.map(function (x) {
                return '<div class="grade-item' + (x === g ? ' active' : '') + '" data-g="' + esc(x) + '">' + esc(x) + '</div>';
            }).join('') + '</div>' +
            '<div id="mockList"><div class="empty">正在加载试卷…</div></div></div>' + tabbar(1);

        app.querySelectorAll('.grade-item').forEach(function (el) {
            el.addEventListener('click', function () { setGrade(el.getAttribute('data-g')); renderMockList(); });
        });
        app.querySelectorAll('[data-go]').forEach(function (el) {
            el.addEventListener('click', function () { go(el.getAttribute('data-go')); });
        });

        apiGet('/api/app/mock-papers').then(function (res) {
            var box = document.getElementById('mockList');
            if (!box) return;
            var papers = (res && res.papers) || [];
            if (!papers.length) {
                box.innerHTML = '<div class="empty">老师还没有上传全真模拟卷<br>上传后会显示在这里</div>';
                return;
            }
            var mine = papers.filter(function (p) { return !p.grade || p.grade === g; });
            var others = papers.filter(function (p) { return p.grade && p.grade !== g; });
            var list = mine.length ? mine : papers;
            var best = mockBest();
            box.innerHTML = list.map(function (p) {
                var b = best[p.id];
                return '<div class="mock-item" data-go="#/mock/' + esc(p.id) + '">' +
                    '<div class="mock-title">' + esc(p.title) + '</div>' +
                    '<div class="mock-tags">' +
                        '<span class="mtag">' + esc(p.grade || '通用') + '</span>' +
                        '<span class="mtag">' + p.q_count + ' 题</span>' +
                        '<span class="mtag">' + p.total_score + ' 分</span>' +
                        '<span class="mtag">' + p.duration_min + ' 分钟</span>' +
                    '</div>' +
                    '<div class="mock-foot"><span class="mock-best">' + (b ? '我的最好成绩 ' + b.score + '/' + b.total : '尚未作答') + '</span>' +
                    '<span class="lesson-go">' + (b ? '再练一次 ›' : '开始答题 ›') + '</span></div>' +
                '</div>';
            }).join('') + (mine.length && others.length ? '<div class="tip">其他年级还有 ' + others.length + ' 份试卷，可切换年级查看</div>' : '');
            box.querySelectorAll('[data-go]').forEach(function (el) {
                el.addEventListener('click', function () { go(el.getAttribute('data-go')); });
            });
        }).catch(function () {
            var box = document.getElementById('mockList');
            if (box) box.innerHTML = '<div class="empty">试卷加载失败，请检查网络后重试</div>';
        });
    }

    function renderMockPaper(id) {
        app.innerHTML = '<div class="screen"><div class="empty">正在加载试卷…</div></div>';
        apiGet('/api/app/mock-paper?id=' + encodeURIComponent(id)).then(function (paper) {
            if (!paper || !paper.questions || !paper.questions.length) {
                app.innerHTML = '<div class="screen"><div class="empty">试卷不存在或已下线</div></div>';
                return;
            }
            state = {
                paper: paper,
                answers: {},
                remain: Math.max(1, Number(paper.duration_min) || 120) * 60,
                submitted: false,
                detail: [],
                score: 0
            };
            renderMockQuiz();
            startMockTimer();
        }).catch(function () {
            app.innerHTML = '<div class="screen"><div class="empty">试卷加载失败，请返回重试</div></div>';
        });
    }

    // KaTeX 渲染试卷里的 LaTeX 公式（\(..\) 行内、\[..\] 独立公式）
    function renderMath() {
        try {
            if (window.renderMathInElement) {
                renderMathInElement(document.getElementById('app'), {
                    delimiters: [
                        { left: '\\(', right: '\\)', display: false },
                        { left: '\\[', right: '\\]', display: true },
                    ],
                    throwOnError: false,
                });
            }
        } catch (e) { /* 渲染失败保留原文 */ }
    }

    function mockAnsweredCount() {
        return state.paper.questions.filter(function (q) {
            var a = state.answers[q.id];
            return a !== undefined && String(a).trim() !== '';
        }).length;
    }

    // 把 Word 原卷 HTML 按题号切成每题一段：遍历块级元素，用与解析器同款的题号/大题标题规则切分
    function splitDocHtml(html, qs) {
        var wrap = document.createElement('div');
        wrap.innerHTML = html;
        var blocks = Array.prototype.slice.call(wrap.childNodes);
        var textOf = function (n) { return String(n.textContent || '').replace(/\u3000/g, ' ').trim(); };
        var HEADER_RE = /(单项选择题|多项选择题|单选题|多选题|选择题|填空题|解答题|简答题|计算题|证明题|应用题)/;
        var hasHeaders = blocks.some(function (n) { return HEADER_RE.test(textOf(n)); });
        var headerSeen = false;
        var nos = {};
        qs.forEach(function (q) { nos[Number(q.no) || 0] = true; });
        var pre = [], segs = [], cur = null, pending = [];
        blocks.forEach(function (n) {
            var t = textOf(n);
            // 大题分区标题：只更新「已进入正式题目」的上下文，不切题；
            // 出现在两题之间时挂到下一题前面（pending），不粘在上一题末尾
            var isHeader = false;
            var probe = t.replace(/[。.：:，,）)】\]]+$/, '');
            if (probe.length <= 30 && !/[?？]/.test(probe)) {
                var hm = HEADER_RE.exec(probe);
                if (hm && (/^[（(【\[]?[一二三四五六七八九十\d]/.test(probe) || /^第\s*[一二三四五六七八九十IⅡⅢⅣV]+\s*卷/.test(probe))) isHeader = true;
            }
            if (!isHeader) {
                var hm2 = /^(?:[一二三四五六七八九十]+\s*[、.．]|第\s*[一二三四五六七八九十IⅡⅢⅣV]+\s*卷)\s*(?:单项选择题|多项选择题|单选题|多选题|选择题|填空题|解答题|简答题|计算题|证明题|应用题)/.exec(t);
                if (hm2) isHeader = true;
            }
            if (isHeader) {
                headerSeen = true;
                if (cur) pending.push(n); else pre.push(n);
                return;
            }
            // 题号行且该题号在解析出的题目里：从这里切开
            var qm = /^(\d{1,3})\s*[.、．]\s*(?!\d)/.exec(t);
            if (qm && nos[Number(qm[1])] && (!hasHeaders || headerSeen)) {
                cur = { no: Number(qm[1]), blocks: pending.concat([n]) };
                pending = [];
                segs.push(cur);
                return;
            }
            if (cur) cur.blocks.push(n); else pre.push(n);
        });
        // 收尾仍挂着的大题标题：拼回最后一段
        if (pending.length) {
            if (segs.length) segs[segs.length - 1].blocks = segs[segs.length - 1].blocks.concat(pending);
            else pre = pre.concat(pending);
        }
        return segs.length ? { pre: pre, segs: segs } : null;
    }

    function docBlocksHtml(blocks) {
        return blocks.map(function (n) {
            return n.nodeType === 1 ? n.outerHTML : esc(String(n.nodeValue || ''));
        }).join('');
    }

    // 题目作答控件：选择题字母 chips / 填空输入框 / 解答题文本域
    function answerControls(q, hasDoc) {
        var ans = state.answers[q.id];
        var h = '';
        if (q.type === 'choice') {
            (q.options || []).forEach(function (opt, idx) {
                var letter = 'ABCDEFGH'[idx];
                var active = ans && String(ans).indexOf(letter) >= 0;
                h += '<div class="option' + (active ? ' active' : '') + '" data-q="' + esc(q.id) + '" data-i="' + idx + '">' +
                    '<span class="opt-key">' + letter + '</span>' +
                    (hasDoc ? '' : '<div class="opt-text">' + rich(opt) + '</div>') + '</div>';
            });
        } else if (q.type === 'fill') {
            h += '<input class="fill-input" data-q="' + esc(q.id) + '" placeholder="填写答案" value="' + esc(ans || '') + '">';
        } else {
            h += '<textarea class="essay-input" maxlength="800" data-q="' + esc(q.id) + '" placeholder="写出解答过程">' + esc(ans || '') + '</textarea>';
        }
        return h;
    }

    function qTypeLabel(q) {
        if (q.type !== 'choice') return q.type === 'fill' ? '填空题' : '解答题';
        var std = String(q.answer || '').toUpperCase().replace(/[^A-H]/g, '');
        return std.length > 1 ? '多选题' : '选择题';
    }

    function renderMockQuiz() {
        var p = state.paper, qs = p.questions;
        var hasDoc = !!p.paper_html;
        var doc = hasDoc ? splitDocHtml(p.paper_html, qs) : null;
        var html = '<div class="screen">' +
            '<div class="page-head"><div class="back-btn" id="backMock">‹</div>' +
            '<div><div class="page-title">' + esc(p.title) + '</div>' +
            '<div class="page-sub">' + esc(p.grade || '') + ' · 共 ' + qs.length + ' 题 · 满分 ' + p.total_score + ' 分</div></div></div>' +
            '<div class="exam-bar"><span class="exam-label">剩余时间</span>' +
            '<span class="exam-clock" id="mockClock">' + clockText(state.remain) + '</span>' +
            '<span class="exam-progress">已答 <b id="mockAnswered">' + mockAnsweredCount() + '</b>/' + qs.length + '</span></div>';

        if (hasDoc && doc) {
            // Word 原卷逐题排版：每题内容下方紧跟该题作答区
            if (doc.pre.length) html += '<div class="paper-doc">' + docBlocksHtml(doc.pre) + '</div>';
            var done = {};
            doc.segs.forEach(function (seg) {
                var q = qs.filter(function (x) { return Number(x.no) === seg.no; })[0];
                done[seg.no] = true;
                html += '<div class="paper-doc">' + docBlocksHtml(seg.blocks);
                if (q) {
                    html += '<div class="q-inline"><div class="q-top"><span class="q-no">' + seg.no + '</span>' +
                        '<span class="q-type">' + qTypeLabel(q) + '</span>' +
                        '<span class="q-score">' + q.score + ' 分</span></div>' +
                        answerControls(q, true) + '</div>';
                }
                html += '</div>'; // 闭合 paper-doc，务必保留（否则题卡层层嵌套、宽度越挤越窄）
            });
            // 解析时漏切的题（如纯图形题）兜底补在末尾
            qs.forEach(function (q, i) {
                if (done[Number(q.no)]) return;
                html += '<div class="paper-doc"><div class="q-top"><span class="q-no">' + (q.no || i + 1) + '</span>' +
                    '<span class="q-type">' + qTypeLabel(q) + '</span>' +
                    '<span class="q-score">' + q.score + ' 分</span></div>' +
                    (q.stem ? '<div class="q-stem">' + rich(q.stem) + '</div>' : '') +
                    answerControls(q, false) + '</div>';
            });
        } else {
            // 切题失败时退回旧版：原卷整卷展示 + 底部集中答题卡
            if (hasDoc) html += '<div class="paper-doc">' + p.paper_html + '</div><div class="paper-divider">答题卡</div>';
            qs.forEach(function (q, i) {
                html += '<div class="q-card"><div class="q-top"><span class="q-no">' + (hasDoc ? (q.no || (i + 1)) : (i + 1)) + '</span>' +
                    '<span class="q-type">' + qTypeLabel(q) + '</span>' +
                    '<span class="q-score">' + q.score + ' 分</span></div>';
                if (!hasDoc) html += '<div class="q-stem">' + rich(q.stem) + '</div>';
                html += answerControls(q, hasDoc) + '</div>';
            });
        }

        html += '<button class="btn primary big" id="mockSubmit">交卷</button>' +
            '<div class="exam-note">交卷后自动批阅评分：客观题即时判分，解答题按老师上传的答案解析由 AI 评分</div></div>';
        app.innerHTML = html;

        document.getElementById('backMock').addEventListener('click', confirmLeaveMock);
        // 原卷图片（公式/图形）点击放大查看
        app.querySelectorAll('.paper-doc img').forEach(function (img) {
            img.addEventListener('click', function () {
                var ov = document.createElement('div');
                ov.className = 'img-zoom';
                ov.innerHTML = '<img src="' + img.src + '" alt=""><div class="img-zoom-tip">点击任意位置关闭</div>';
                ov.addEventListener('click', function () { document.body.removeChild(ov); });
                document.body.appendChild(ov);
            });
        });
        renderMath();
        app.querySelectorAll('.option').forEach(function (el) {
            el.addEventListener('click', function () {
                var qid = el.getAttribute('data-q');
                var q = state.paper.questions.filter(function (x) { return x.id === qid; })[0];
                if (!q) return;
                var letter = 'ABCDEFGH'[Number(el.getAttribute('data-i'))];
                var std = String(q.answer || '').toUpperCase().replace(/[^A-H]/g, '');
                if (std.length > 1) {
                    // 多选题：点击切换选中，答案存按序字母串
                    var set = String(state.answers[qid] || '').split('');
                    var pos = set.indexOf(letter);
                    if (pos >= 0) set.splice(pos, 1); else { set.push(letter); set.sort(); }
                    state.answers[qid] = set.join('');
                } else {
                    state.answers[qid] = letter;
                }
                var cur = String(state.answers[qid] || '');
                el.parentNode.querySelectorAll('.option').forEach(function (o) {
                    var L = 'ABCDEFGH'[Number(o.getAttribute('data-i'))];
                    o.classList.toggle('active', cur.indexOf(L) >= 0);
                });
                var cnt = document.getElementById('mockAnswered');
                if (cnt) cnt.textContent = mockAnsweredCount();
            });
        });
        app.querySelectorAll('input[data-q], textarea[data-q]').forEach(function (el) {
            el.addEventListener('input', function () {
                state.answers[el.getAttribute('data-q')] = el.value;
                var cnt = document.getElementById('mockAnswered');
                if (cnt) cnt.textContent = mockAnsweredCount();
            });
        });
        document.getElementById('mockSubmit').addEventListener('click', function () { submitMock(false); });
    }

    function startMockTimer() {
        stopTimer();
        timer = setInterval(function () {
            state.remain -= 1;
            var clock = document.getElementById('mockClock');
            if (state.remain <= 0) {
                state.remain = 0;
                if (clock) clock.textContent = '0:00';
                stopTimer();
                if (!state.submitted) {
                    toast('考试时间到，已自动交卷', 2200);
                    submitMock(true);
                }
                return;
            }
            if (clock) clock.textContent = clockText(state.remain);
        }, 1000);
    }

    function confirmLeaveMock() {
        if (state.submitted) { go('#/mock'); return; }
        if (window.confirm('离开将放弃本次作答，确定离开吗？')) {
            stopTimer();
            go('#/mock');
        }
    }

    function submitMock(auto) {
        if (state.submitted) return;
        var p = state.paper, qs = p.questions;
        var missing = qs.filter(function (q) {
            var a = state.answers[q.id];
            return a === undefined || String(a).trim() === '';
        });
        if (!auto && missing.length && !window.confirm('还有 ' + missing.length + ' 题未作答，确定交卷吗？')) return;

        stopTimer();
        state.submitted = true;
        state.autoSubmitted = !!auto;
        var detail = [];
        qs.forEach(function (q) {
            var ans = state.answers[q.id];
            var item = {
                qid: q.id,
                type: q.type,
                max: q.score,
                score: 0,
                correct: null,
                answer: String(ans == null ? '' : ans).slice(0, 300)
            };
            if (q.type === 'choice') {
                // 单选存单字母，多选存按序字母串；统一按字母集合比较
                var std = String(q.answer || '').toUpperCase().replace(/[^A-H]/g, '').split('').sort().join('');
                var got = String(ans == null ? '' : ans).toUpperCase().replace(/[^A-H]/g, '').split('').sort().join('');
                item.correct = got !== '' && got === std;
                item.score = item.correct ? q.score : 0;
            } else if (q.type === 'fill') {
                item.correct = norm(ans) === norm(q.answer);
                item.score = item.correct ? q.score : 0;
            }
            detail.push(item);
        });
        state.detail = detail;
        saveMockResult();
        renderMockResult();
        // 解答题交给服务端 AI 按上传的答案解析自动批阅；失败则退回对照自评
        var essays = detail.filter(function (d) { return d.type === 'essay'; });
        if (essays.length) gradeEssaysRemote(essays);
    }

    function gradeEssaysRemote(essays) {
        var p = state.paper;
        var items = essays.map(function (d) {
            var q = p.questions.filter(function (x) { return x.id === d.qid; })[0] || {};
            return { qid: d.qid, stem: q.stem || '', ref: q.ref || '', analysis: q.analysis || '',
                answer: d.answer || '', score: d.max };
        });
        post('/api/app/mock-grade', { owner_id: ownerId(), items: items }).then(function (r) {
            if (!r || !r.ok || !r.results) { state.aiGrading = false; renderMockResult(); return; }
            state.detail = state.detail.map(function (d) {
                var g = r.results.filter(function (x) { return x.qid === d.qid; })[0];
                if (d.type !== 'essay' || !g) return d;
                var s = Math.max(0, Math.min(Number(d.max) || 0, Math.round(Number(g.score) || 0)));
                return Object.assign({}, d, { score: s, correct: s >= (Number(d.max) || 0) * 0.6, comment: g.comment || '', graded: true });
            });
            state.aiGrading = false;
            saveMockResult();
            renderMockResult();
        }).catch(function () { state.aiGrading = false; renderMockResult(); });
    }

    function saveMockResult() {
        var p = state.paper;
        var score = state.detail.reduce(function (s, d) { return s + (Number(d.score) || 0); }, 0);
        state.score = score;
        var total = Number(p.total_score) || 1;
        post('/api/app/mock-submit', {
            paper_id: p.id,
            owner_id: ownerId(),
            owner_name: remark() || null,
            grade: grade(),
            score: score,
            total: total,
            detail: state.detail
        }).then(function (r) {
            if (r && r.ok) toast('成绩已提交给老师');
        });
        setMockBest(p.id, { score: score, total: total, date: new Date().toISOString().slice(0, 10) });
    }

    function renderMockResult() {
        var p = state.paper, detail = state.detail;
        var total = Number(p.total_score) || 1;
        var pct = Math.round(state.score / total * 100);
        var word = pct >= 90 ? '接近满分，状态很好' : pct >= 70 ? '达到中上水平，错题及时订正' : pct >= 50 ? '基础题要抓牢，易错点回看课本' : '建议先复习对应章节，再来一次';

        var html = '<div class="screen">' +
            '<div class="page-head"><div class="back-btn" data-go="#/mock">‹</div>' +
            '<div><div class="page-title">' + esc(p.title) + '</div>' +
            '<div class="page-sub">' + (state.autoSubmitted ? '时间到自动交卷 · ' : '') + '得分率 ' + pct + '%</div></div></div>' +
            '<div class="result-card"><div class="result-score">' + state.score + '<span class="result-total">/' + total + '</span></div>' +
            '<div class="result-word">' + word + '</div></div>';

        p.questions.forEach(function (q, i) {
            var d = detail.filter(function (x) { return x.qid === q.id; })[0] || { correct: null, score: 0, answer: '' };
            var verdict;
            if (q.type === 'essay') {
                if (d.graded) {
                    verdict = '<span class="q-verdict ' + (d.correct ? 'v-ok' : 'v-no') + '">AI评分 ' + (d.score || 0) + '/' + q.score + '</span>';
                } else if (state.aiGrading) {
                    verdict = '<span class="q-verdict v-wait">AI批阅中…</span>';
                } else {
                    verdict = d.correct === true ? '✓ 自评正确' : d.correct === false ? '✗ 自评错误' : '待自评';
                    verdict = '<span class="q-verdict ' + (d.correct === true ? 'v-ok' : d.correct === false ? 'v-no' : 'v-wait') + '">' + verdict + '</span>';
                }
            } else {
                verdict = '<span class="q-verdict ' + (d.correct ? 'v-ok' : 'v-no') + '">' + (d.correct ? '✓ +' + d.score : '✗ 0') + '</span>';
            }
            html += '<div class="q-card"><div class="q-top"><span class="q-no">' + (i + 1) + '</span>' + verdict +
                '<span class="q-score">' + q.score + ' 分</span></div>' +
                '<div class="q-stem">' + rich(q.stem) + '</div>';

            if (q.type === 'choice') {
                var myKey = d.answer === '' || d.answer == null ? '未作答' : (isNaN(Number(d.answer)) ? d.answer : 'ABCDEFGH'[Number(d.answer)]);
                html += '<div class="r-line">我的答案：<span class="r-strong">' + esc(myKey) + '</span>' +
                    '　正确答案：<span class="r-strong">' + esc(q.answer) + '</span></div>';
            } else if (q.type === 'fill') {
                html += '<div class="r-line">我的答案：<span class="r-strong">' + esc(d.answer || '未作答') + '</span>' +
                    '　正确答案：<span class="r-strong">' + rich(q.answer) + '</span></div>';
            } else {
                html += '<div class="r-line">我的作答：' + (d.answer ? esc(d.answer) : '未作答') + '</div>' +
                    (d.graded && d.comment ? '<div class="r-line">AI评语：' + esc(d.comment) + '</div>' : '') +
                    '<div class="r-line">参考答案：<span class="r-strong">' + rich(q.ref || q.answer || '') + '</span></div>';
                if (!d.graded && d.correct === null && !state.aiGrading) {
                    html += '<div class="self-row"><div class="self-btn ok" data-mq="' + esc(q.id) + '" data-ok="1">对照后：我答对了（+' + q.score + '）</div>' +
                        '<div class="self-btn no" data-mq="' + esc(q.id) + '" data-ok="0">我答错了</div></div>';
                }
            }
            if (q.analysis) html += '<div class="r-line r-ana">解析：' + rich(q.analysis) + '</div>';
            html += '</div>';
        });

        html += '<div class="btn-row"><button class="btn ghost" id="mockRedo">重做本卷</button>' +
            '<button class="btn primary" id="mockBack">返回模拟列表</button></div></div>' + tabbar(1);
        app.innerHTML = html;

        app.querySelectorAll('[data-mq]').forEach(function (el) {
            el.addEventListener('click', function () {
                mockSelfJudge(el.getAttribute('data-mq'), el.getAttribute('data-ok') === '1');
            });
        });
        renderMath();
        document.getElementById('mockRedo').addEventListener('click', function () {
            state = { paper: p, answers: {}, remain: Math.max(1, Number(p.duration_min) || 120) * 60, submitted: false, detail: [], score: 0 };
            renderMockQuiz();
            startMockTimer();
        });
        document.getElementById('mockBack').addEventListener('click', function () { go('#/mock'); });
        app.querySelectorAll('[data-go]').forEach(function (el) {
            el.addEventListener('click', function () { go(el.getAttribute('data-go')); });
        });
    }

    function mockSelfJudge(qid, ok) {
        state.detail = state.detail.map(function (d) {
            if (d.qid !== qid) return d;
            return Object.assign({}, d, { correct: ok, score: ok ? Number(d.max) || 0 : 0, self: true });
        });
        saveMockResult();
        renderMockResult();
    }

    /* ---------------- 底部 tab ---------------- */
    function tabbar(active) {
        var items = [
            { icon: '🎬', text: '课堂', path: '#/home' },
            { icon: '📄', text: '模拟', path: '#/mock' }
        ];
        return '<div class="tabbar">' + items.map(function (it, i) {
            return '<div class="tab-item' + (i === active ? ' active' : '') + '" data-tab="' + it.path + '">' +
                '<span class="ti-icon">' + it.icon + '</span>' + it.text + '</div>';
        }).join('') + '</div>';
    }
    document.addEventListener('click', function (e) {
        var t = e.target.closest ? e.target.closest('[data-tab]') : null;
        if (t) go(t.getAttribute('data-tab'));
    });

    /* ---------------- 启动 ---------------- */
    if (!DATA) {
        app.innerHTML = '<div class="empty">数据未加载，请先运行 node build-data.js</div>';
        return;
    }

    // 1) 先用上次缓存的远程课程表（离线也最新）
    var cachedCourses = lsGet(COURSE_CACHE, null);
    if (cachedCourses) applyCourses(cachedCourses);

    route();

    // 2) 后台静默拉取最新课程表，有变化则刷新界面（作答中不打断）
    fetchCourses().then(function (json) {
        if (!json || !json.grades) return;
        if (cachedCourses && json.version === cachedCourses.version) return;
        lsSet(COURSE_CACHE, json);
        if (applyCourses(json)) {
            var view = (location.hash.replace(/^#\/?/, '').split('/')[0]) || 'home';
            if (view === 'lesson') return; // 正在上课/答题，下次进入生效
            route();
            if (cachedCourses) toast('课程内容已更新');
        }
    });
})();
