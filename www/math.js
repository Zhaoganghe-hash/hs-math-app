// LaTeX 轻量渲染：从 miniprogram components/math-tex 移植，输出行内样式 HTML
(function () {
    var SYMBOLS = {
        alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε',
        zeta: 'ζ', eta: 'η', theta: 'θ', iota: 'ι', kappa: 'κ', lambda: 'λ',
        mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ',
        upsilon: 'υ', phi: 'φ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
        Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π',
        Sigma: 'Σ', Upsilon: 'Υ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
        times: '×', cdot: '·', div: '÷', pm: '±', mp: '∓',
        le: '≤', leq: '≤', ge: '≥', geq: '≥', ne: '≠', neq: '≠',
        approx: '≈', equiv: '≡', infty: '∞', propto: '∝',
        in: '∈', notin: '∉', subset: '⊂', subseteq: '⊆', supset: '⊃', supseteq: '⊇',
        cup: '∪', cap: '∩', emptyset: '∅', varnothing: '∅',
        forall: '∀', exists: '∃', neg: '¬', land: '∧', lor: '∨',
        Rightarrow: '⇒', Leftarrow: '⇐', Leftrightarrow: '⇔',
        rightarrow: '→', leftarrow: '←', leftrightarrow: '↔', to: '→',
        perp: '⊥', parallel: '∥', angle: '∠', triangle: '△', circ: '∘', degree: '°',
        mid: '|', lvert: '|', rvert: '|', vert: '|',
        sum: '∑', prod: '∏', int: '∫', oint: '∮',
        partial: '∂', nabla: '∇', prime: '′', ast: '∗',
        cdots: '⋯', ldots: '…', dots: '…', quad: '　', qquad: '　　'
    };
    var FUNCS = ['arcsin', 'arccos', 'arctan', 'lim', 'log', 'ln', 'lg', 'sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'max', 'min'];

    function escapeHtml(s) {
        return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function readGroup(s, i) {
        var depth = 0;
        for (var j = i; j < s.length; j++) {
            if (s[j] === '{') depth++;
            else if (s[j] === '}') { depth--; if (depth === 0) return [s.slice(i + 1, j), j + 1]; }
        }
        return [s.slice(i + 1), s.length];
    }

    function readArg(s, i) {
        while (i < s.length && s[i] === ' ') i++;
        if (i >= s.length) return ['', i];
        if (s[i] === '{') { var g = readGroup(s, i); return [render(g[0]), g[1]]; }
        if (s[i] === '\\') return renderToken(s, i);
        return [escapeHtml(s[i]), i + 1];
    }

    function fracHtml(a, b) {
        return '<span class="mx-frac"><span class="mx-frac-a">' + a + '</span><span class="mx-frac-b">' + b + '</span></span>';
    }

    function renderToken(s, i) {
        var j = i + 1, name = '';
        if (/[a-zA-Z]/.test(s[j] || '')) { while (j < s.length && /[a-zA-Z]/.test(s[j])) name += s[j++]; }
        else if (s[j]) { name = s[j++]; }

        if (name === 'frac' || name === 'dfrac' || name === 'tfrac') {
            var a = readArg(s, j); j = a[1];
            var b = readArg(s, j); j = b[1];
            return [fracHtml(a[0], b[0]), j];
        }
        if (name === 'sqrt') {
            var idx = '';
            if (s.slice(j)[0] === '[') {
                var close = s.slice(j).indexOf(']');
                if (close > 0) { idx = render(s.slice(j + 1, j + close)); j = j + close + 1; }
            }
            var r = readArg(s, j); j = r[1];
            var sup = idx ? '<span class="mx-sup">' + idx + '</span>' : '';
            return ['<span class="mx-nowrap">' + sup + '<span class="mx-sqrt">' + r[0] + '</span></span>', j];
        }
        if (name === 'vec') {
            var v = readArg(s, j); j = v[1];
            return ['<span class="mx-nowrap">' + v[0] + '<span class="mx-sup">→</span></span>', j];
        }
        if (name === 'overline' || name === 'bar') {
            var o = readArg(s, j); j = o[1];
            return ['<span class="mx-overline">' + o[0] + '</span>', j];
        }
        if (name === 'text' || name === 'mathrm' || name === 'operatorname' || name === 'mathit') {
            var t = readArg(s, j); j = t[1];
            return [t[0], j];
        }
        if (name === 'mathbf' || name === 'bm' || name === 'boldsymbol') {
            var b2 = readArg(s, j); j = b2[1];
            return ['<strong>' + b2[0] + '</strong>', j];
        }
        if (name === 'left' || name === 'right') {
            var d = s[j] || ''; j++;
            var map = { '{': '{', '}': '}', '(': '(', ')': ')', '[': '[', ']': ']', '|': '|', '.': '' };
            return [escapeHtml(map[d] !== undefined ? map[d] : d), j];
        }
        if (name === '' && s[i + 1] === '\\') return ['<br/>', i + 2];
        if (name === '\\') return ['<br/>', j];
        if (SYMBOLS[name]) return [SYMBOLS[name], j];
        if (FUNCS.indexOf(name) >= 0) return ['<span class="mx-fn">' + name + '</span>', j];
        return [escapeHtml(name), j];
    }

    function render(s) {
        var html = '', i = 0;
        while (i < s.length) {
            var c = s[i];
            if (c === '\\') { var t = renderToken(s, i); html += t[0]; i = t[1]; continue; }
            if (c === '{') { html += '{'; i++; continue; }
            if (c === '^' || c === '_') {
                var a = readArg(s, i + 1); i = a[1];
                html += '<span class="' + (c === '^' ? 'mx-sup' : 'mx-sub') + '">' + a[0] + '</span>';
                continue;
            }
            if (c === '~') { html += ' '; i++; continue; }
            html += escapeHtml(c);
            i++;
        }
        return html;
    }

    window.latexToHtml = function (latex) {
        if (!latex) return '';
        try { return render(String(latex)); } catch (e) { return escapeHtml(String(latex)); }
    };
})();
