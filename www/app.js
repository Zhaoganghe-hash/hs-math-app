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
        if (view === 'quiz') return renderQuizCenter();
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
                '<div class="task-card task-quiz" data-go="#/quiz">' +
                    '<div class="task-icon">📝</div>' +
                    '<div class="task-body">' +
                        '<div class="task-title">课堂检测</div>' +
                        '<div class="task-desc">每节课 6 道题（选择 + 填空 + 简答），全面检测本节学习效果</div>' +
                        '<div class="task-meta">成绩自动记录 · 老师端可查看</div>' +
                    '</div>' +
                    '<div class="task-go">去检测 ›</div>' +
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
                                '<span class="dot ' + (l.video ? 'dot-ok' : 'dot-wait') + '"></span>' +
                                '<span>' + (l.video ? '视频已就绪' : '视频待上传') + '</span>' +
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
                : '<div class="video-empty"><div class="ve-icon">📹</div><div class="ve-title">本课时视频待上传</div><div class="ve-desc">老师上传后即可观看（课时 ' + esc(l.id) + '）</div></div>') +
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

    /* ---------------- 检测中心 ---------------- */
    function renderQuizCenter() {
        var grades = DATA.grades, g = grade();
        var chapters = DATA.byGrade[g] || [];
        var results = quizResults();
        var all = [];
        chapters.forEach(function (ch) { ch.lessons.forEach(function (l) { all.push(l); }); });
        var done = all.filter(function (l) { return results[l.id]; }).length;
        var pct = all.length ? Math.round(done / all.length * 100) : 0;

        var html = '<div class="screen">' +
            '<div class="page-head"><div><div class="page-title">课堂检测</div>' +
            '<div class="page-sub">' + esc(g) + ' · 已完成 ' + done + '/' + all.length + ' 课时</div></div></div>' +
            '<div class="grade-switch light">' + grades.map(function (x) {
                return '<div class="grade-item' + (x === g ? ' active' : '') + '" data-g="' + esc(x) + '">' + esc(x) + '</div>';
            }).join('') + '</div>' +
            '<div class="progress-card"><div class="progress-top"><span>检测进度</span><span>' + pct + '%</span></div>' +
            '<div class="progress-bar"><div class="progress-fill" style="width:' + pct + '%"></div></div></div>';

        chapters.forEach(function (ch) {
            html += '<div class="chapter"><div class="ch-head"><div><div class="ch-name">' + esc(ch.name) + '</div>' +
                '<div class="ch-sub">' + ch.lessons.length + ' 课时</div></div></div><div class="lessons">';
            ch.lessons.forEach(function (l) {
                var r = results[l.id];
                html += '<div class="lesson" data-go="#/lesson/' + esc(l.id) + '?jump=quiz">' +
                    '<div class="lesson-main"><div class="lesson-name">' + mx(l.name) + '</div>' +
                    '<div class="lesson-meta">' + (r ? '<span class="score">' + r.score + '/' + r.total + ' 分</span><span>·</span><span>' + esc(r.date) + '</span>'
                        : '<span>未检测</span>') + '</div></div>' +
                    '<div class="lesson-go">' + (r ? '重做 ›' : '开始 ›') + '</div></div>';
            });
            html += '</div></div>';
        });

        html += '</div>' + tabbar(1);
        app.innerHTML = html;

        app.querySelectorAll('.grade-item').forEach(function (el) {
            el.addEventListener('click', function () { setGrade(el.getAttribute('data-g')); renderQuizCenter(); });
        });
        app.querySelectorAll('[data-go]').forEach(function (el) {
            el.addEventListener('click', function () {
                var v = el.getAttribute('data-go');
                var m = /^#\/lesson\/([^?]+)\?jump=quiz$/.exec(v);
                if (m) renderLesson(m[1], true); else go(v);
            });
        });
    }

    /* ---------------- 底部 tab ---------------- */
    function tabbar(active) {
        var items = [
            { icon: '🎬', text: '课堂', path: '#/home' },
            { icon: '📝', text: '检测', path: '#/quiz' }
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
