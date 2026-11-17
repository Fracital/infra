/* ═══════════════════════════════════════════════════════
   GLOBAL JS — BLOCK SHOOTER
   Handles GPU Volumetric Fog and technical UI interactions.
   ═══════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
    const STEAM_STORE_URL = 'https://store.steampowered.com/app/4475780/Block_Shooter/';
    const SOCIAL_LINKS = [
        {
            label: 'X',
            handle: '@blockshooterfps',
            href: 'https://x.com/blockshooterfps',
            ariaLabel: 'Follow Block Shooter on X',
            icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M5 5l14 14"></path><path d="M19 5L5 19"></path></svg>'
        },
        {
            label: 'YouTube',
            handle: '@red_rebel_future',
            href: 'https://www.youtube.com/@red_rebel_future',
            ariaLabel: 'Watch Block Shooter on YouTube',
            icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12c0 2.6-.3 4.5-.8 5.6-.4.9-1 1.5-1.9 1.9-1.2.5-3.7.8-7.3.8s-6.1-.3-7.3-.8c-.9-.4-1.5-1-1.9-1.9C2.3 16.5 2 14.6 2 12s.3-4.5.8-5.6c.4-.9 1-1.5 1.9-1.9C5.9 4 8.4 3.7 12 3.7s6.1.3 7.3.8c.9.4 1.5 1 1.9 1.9.5 1.1.8 3 .8 5.6Z"></path><path d="M10 8.8l5 3.2-5 3.2V8.8Z" fill="currentColor" stroke="none"></path></svg>'
        }
    ];
    const nav = document.getElementById('nav');
    const syncNavHeight = () => {
        if (!nav) return;
        document.documentElement.style.setProperty('--nav-height', nav.offsetHeight + 'px');
    };
    const normalizeUrl = (url) => url.replace(/\/$/, '');
    const linkExists = (root, href) => !!root && Array.from(root.querySelectorAll('a')).some((link) => normalizeUrl(link.href) === normalizeUrl(href));
    const createSocialLink = ({ href, label, handle, ariaLabel, icon }) => {
        const link = document.createElement('a');
        link.href = href;
        link.className = 'social-link';
        link.target = '_blank';
        link.rel = 'me noopener noreferrer';
        link.setAttribute('aria-label', ariaLabel);
        link.innerHTML = `
            <span class="social-link-icon" aria-hidden="true">${icon}</span>
            <span class="social-link-copy">
                <span class="social-link-label">${label}</span>
                <span class="social-link-handle">${handle}</span>
            </span>
        `;
        return link;
    };
    
    // ── 1. GLOBAL VOLUMETRIC GPU FOG (Stable Version) ──
    (function initFog() {
        const canvas = document.getElementById('bg-canvas');
        if (!canvas) return;
        const gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false });
        if (!gl) return;

        const vsSource = `attribute vec2 a_pos; varying vec2 v_uv; void main() { v_uv = a_pos * 0.5 + 0.5; gl_Position = vec4(a_pos, 0.0, 1.0); }`;
        const fsSource = `
            precision mediump float;
            varying vec2 v_uv;
            uniform float u_time;
            uniform vec2 u_res;

            vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
            vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
            vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
            vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

            float snoise(vec3 v) {
                const vec2 C = vec2(1.0/6.0, 1.0/3.0);
                const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
                vec3 i = floor(v + dot(v, C.yyy));
                vec3 x0 = v - i + dot(i, C.xxx);
                vec3 g = step(x0.yzx, x0.xyz);
                vec3 l = 1.0 - g;
                vec3 i1 = min(g.xyz, l.zxy);
                vec3 i2 = max(g.xyz, l.zxy);
                vec3 x1 = x0 - i1 + C.xxx;
                vec3 x2 = x0 - i2 + C.yyy;
                vec3 x3 = x0 - D.yyy;
                i = mod289(i);
                vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
                vec4 j = p - 49.0 * floor(p * (1.0 / 49.0));
                vec4 x_ = floor(j * (1.0 / 7.0));
                vec4 y_ = floor(j - 7.0 * x_);
                vec4 x = x_ * (2.0 / 7.0) - 0.5;
                vec4 y = y_ * (2.0 / 7.0) - 0.5;
                vec4 h = 1.0 - abs(x) - abs(y);
                vec4 b0 = vec4(x.xy, y.xy); vec4 b1 = vec4(x.zw, y.zw);
                vec4 s0 = floor(b0)*2.0 + 1.0; vec4 s1 = floor(b1)*2.0 + 1.0;
                vec4 sh = -step(h, vec4(0.0));
                vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy; vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
                vec3 p0 = vec3(a0.xy, h.x); vec3 p1 = vec3(a0.zw, h.y); vec3 p2 = vec3(a1.xy, h.z); vec3 p3 = vec3(a1.zw, h.w);
                vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
                p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
                vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
                m = m * m; return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
            }

            void main() {
                vec2 uv = gl_FragCoord.xy / u_res;
                vec2 p = (uv - 0.5) * vec2(u_res.x/u_res.y, 1.0);
                float noise = snoise(vec3(p * 2.5, u_time * 0.1));
                vec3 color = mix(vec3(0.01, 0.02, 0.05), vec3(0.05, 0.2, 0.4), noise * 0.5 + 0.5);
                gl_FragColor = vec4(color, 1.0);
            }
        `;

        function compile(type, src) { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; }
        const vs = compile(gl.VERTEX_SHADER, vsSource); const fs = compile(gl.FRAGMENT_SHADER, fsSource);
        const prog = gl.createProgram(); gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog); gl.useProgram(prog);
        const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
        const aPos = gl.getAttribLocation(prog, 'a_pos'); gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
        const uTime = gl.getUniformLocation(prog, 'u_time'); const uRes = gl.getUniformLocation(prog, 'u_res');
        function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; gl.viewport(0, 0, canvas.width, canvas.height); gl.uniform2f(uRes, canvas.width, canvas.height); }
        window.addEventListener('resize', resize); resize();
        function render(time) { gl.uniform1f(uTime, time * 0.001); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); requestAnimationFrame(render); }
        requestAnimationFrame(render);
    })();

    // ── 2. SCROLL ANIMATIONS ──
    const io = new IntersectionObserver(entries => { 
        entries.forEach(e => { 
            if(e.isIntersecting){ e.target.classList.add('vis'); io.unobserve(e.target); 
                const counters = e.target.querySelectorAll('[data-count]');
                counters.forEach(counter => {
                    const target = parseInt(counter.getAttribute('data-count'));
                    const suffix = counter.getAttribute('data-suffix') || '';
                    const duration = 2000; const startTime = performance.now();
                    function update(currentTime) {
                        const elapsed = currentTime - startTime; const progress = Math.min(elapsed / duration, 1);
                        const ease = 1 - Math.pow(1 - progress, 3); const current = Math.floor(ease * target);
                        counter.innerText = current.toLocaleString() + suffix;
                        if (progress < 1) requestAnimationFrame(update); else counter.innerText = target.toLocaleString() + suffix;
                    }
                    requestAnimationFrame(update);
                });
            }
        }); 
    }, { threshold: .1 });
    document.querySelectorAll('[data-a]').forEach(el => io.observe(el));

    // ── 3. SHARED NAV ──
    (function initNav() {
        if (!nav) return;
        const navInner = nav.querySelector('.nav-inner');
        const navLinks = nav.querySelector('.nav-links');
        if (!navInner || !navLinks) {
            syncNavHeight();
            return;
        }

        if (!linkExists(navLinks, STEAM_STORE_URL)) {
            const storeLink = document.createElement('a');
            storeLink.href = STEAM_STORE_URL;
            storeLink.className = 'btn btn-sm btn-secondary site-store-link';
            storeLink.target = '_blank';
            storeLink.rel = 'noopener';
            storeLink.textContent = 'Open Playtest';
            const discordBtn = Array.from(navLinks.querySelectorAll('a')).find((link) => link.href.includes('discord.blockshooter.io'));
            if (discordBtn) {
                navLinks.insertBefore(storeLink, discordBtn);
            } else {
                navLinks.appendChild(storeLink);
            }
        }

        const linksId = navLinks.id || 'site-nav-links';
        navLinks.id = linksId;

        let menuToggle = nav.querySelector('.nav-menu-toggle');
        if (!menuToggle) {
            menuToggle = document.createElement('button');
            menuToggle.type = 'button';
            menuToggle.className = 'nav-menu-toggle';
            menuToggle.setAttribute('aria-label', 'Toggle site navigation');
            menuToggle.setAttribute('aria-controls', linksId);
            menuToggle.setAttribute('aria-expanded', 'false');
            menuToggle.innerHTML = '<span class="nav-menu-icon" aria-hidden="true"></span><span class="nav-menu-label">Menu</span>';
            navInner.appendChild(menuToggle);
        }

        let overlay = document.querySelector('.nav-overlay');
        if (!overlay) {
            overlay = document.createElement('button');
            overlay.type = 'button';
            overlay.className = 'nav-overlay';
            overlay.setAttribute('aria-label', 'Close site navigation');
            document.body.appendChild(overlay);
        }

        const closeMenu = () => {
            nav.classList.remove('menu-open');
            document.body.classList.remove('nav-menu-open');
            menuToggle.setAttribute('aria-expanded', 'false');
            syncNavHeight();
        };

        const toggleMenu = () => {
            const open = nav.classList.toggle('menu-open');
            document.body.classList.toggle('nav-menu-open', open);
            menuToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
            syncNavHeight();
        };

        menuToggle.addEventListener('click', toggleMenu);
        overlay.addEventListener('click', closeMenu);
        navLinks.querySelectorAll('a').forEach((link) => {
            link.addEventListener('click', closeMenu);
        });

        let navTicking = false;
        const updateNavState = () => {
            nav.classList.toggle('scrolled', window.scrollY > 50 || nav.classList.contains('menu-open'));
            syncNavHeight();
            navTicking = false;
        };

        window.addEventListener('scroll', () => {
            if (!navTicking) {
                requestAnimationFrame(updateNavState);
                navTicking = true;
            }
        }, { passive: true });

        window.addEventListener('resize', () => {
            if (window.innerWidth > 900) closeMenu();
            syncNavHeight();
        });

        updateNavState();
    })();

    (function initFooterLinks() {
        const footerLinks = document.querySelector('.footer-links');
        if (!footerLinks) return;
        if (!linkExists(footerLinks, STEAM_STORE_URL)) {
            const storeLink = document.createElement('a');
            storeLink.href = STEAM_STORE_URL;
            storeLink.target = '_blank';
            storeLink.rel = 'noopener';
            storeLink.textContent = 'Open Playtest';
            footerLinks.appendChild(storeLink);
        }

        const footerContainer = footerLinks.parentElement;
        if (!footerContainer) return;

        let footerSocials = footerContainer.querySelector('.footer-socials');
        if (!footerSocials) {
            footerSocials = document.createElement('div');
            footerSocials.className = 'footer-socials';

            const footerSocialLabel = document.createElement('span');
            footerSocialLabel.className = 'footer-social-label';
            footerSocialLabel.textContent = 'Official Channels';
            footerSocials.appendChild(footerSocialLabel);

            const footerCopy = footerContainer.querySelector('.footer-copy');
            if (footerCopy) {
                footerContainer.insertBefore(footerSocials, footerCopy);
            } else {
                footerContainer.appendChild(footerSocials);
            }
        }

        SOCIAL_LINKS.forEach((socialLink) => {
            if (linkExists(footerSocials, socialLink.href) || linkExists(footerLinks, socialLink.href)) return;
            footerSocials.appendChild(createSocialLink(socialLink));
        });
    })();

    // FAQ Accordion
    document.querySelectorAll('.faq-question').forEach(btn => {
        btn.addEventListener('click', () => {
            const wrap = btn.nextElementSibling;
            const isOpen = btn.classList.toggle('open');
            wrap.style.maxHeight = isOpen ? wrap.scrollHeight + 'px' : '0';
        });
    });
});
