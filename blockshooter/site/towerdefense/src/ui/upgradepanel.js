// Selected-tower upgrade panel. Browser-only. Sits on the LEFT so it never
// covers the shop on the right.
//
// Renders the tower's three upgrade paths (BTD6 crosspath law honoured via
// tower.canUpgrade), a live stat block, targeting-mode cycler, and sell button.
// Heroes swap the path columns for an XP/level block. A full re-render happens on
// structural changes (upgrade bought, hero level); the far more frequent 'cash'
// event only re-prices the buy buttons so hover state and tooltips survive.

import { PATH_COLORS, TARGET_MODES } from '../core/constants.js';
import { formatCash } from '../core/mathutil.js';
import { TowerSprites } from '../gfx/towersprites.js';
import { SFX } from '../audio/sfx.js';
import { Tooltip } from './tooltips.js';

const MODE_LABEL = { first: 'First', last: 'Last', strong: 'Strong', weak: 'Weak', close: 'Close' };
const SELL_ARM_MS = 1500;

function _esc(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function _spriteCanvas(src, w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h || w;
    if (src) {
        const cx = c.getContext('2d');
        cx.imageSmoothingEnabled = false;
        cx.drawImage(src, 0, 0, w, h || w);
    }
    return c;
}

// Coarse DPS/stat readout from a tower's effective stats -- robust across every
// attack kind (support/income towers report a dash instead of a number).
function _statLine(tower) {
    const s = tower.stats || {};
    const dmgMul = s.damageMul || 1;
    const spdMul = s.attackSpeedMul || 1;
    const rngMul = s.rangeMul || 1;
    const pierceAdd = s.pierceAdd || 0;
    const attacks = Array.isArray(s.attacks) ? s.attacks : [];

    let dps = 0;
    let maxPierce = 0;
    let best = null;
    let bestWeight = -1;
    for (let i = 0; i < attacks.length; i++) {
        const a = attacks[i];
        if (!a) continue;
        const count = a.count || 1;
        const dmg = (a.damage || 0) * dmgMul;
        const cd = a.cooldown || 0;
        const eff = cd > 0 ? cd / spdMul : 0;
        if (a.damage && eff > 0) dps += (dmg * count) / eff;
        const pc = (a.pierce || 0) + pierceAdd;
        if (pc > maxPierce) maxPierce = pc;
        const w = (a.damage || 0) * count;
        if (a.damage && w > bestWeight) { bestWeight = w; best = a; }
    }

    const range = Math.round((s.range || 0) * rngMul);
    const dmg = best ? Math.round((best.damage || 0) * dmgMul * 10) / 10 : 0;
    const rate = best && best.cooldown > 0 ? (spdMul / best.cooldown) : 0;

    return {
        damage: best ? String(dmg) : '--',
        rate: best ? rate.toFixed(1) + '/s' : '--',
        dps: dps > 0 ? String(Math.round(dps)) : '--',
        range: String(range),
        pierce: best ? String(maxPierce) : '--',
        flags: {
            camo: !!s.camoDetect,
            ap: !!s.armorPiercing,
            air: !!s.hitsFlying,
        },
    };
}

export const UpgradePanel = {
    mount(rootEl, game, gate) {
        // Idempotent: tear down any prior instance first. Without this a second
        // mount (e.g. an MP resync re-wiring the sub-modules against the swapped
        // game) orphaned the old root in the DOM -- a frozen, non-interactive
        // upgrade panel bound to the now-dead game's bus, stuck on top forever.
        this.unmount();

        this.game = game;
        // Mutations (upgrade / sell / target / hero level) route through the gate;
        // game stays the read source for pricing, stats and crosspath checks.
        this.gate = gate || null;
        this.root = document.createElement('div');
        this.root.className = 'up-panel mc-panel hidden';
        rootEl.appendChild(this.root);

        this._tower = null;
        this._buyBtns = [null, null, null];
        this._heroBuy = null;
        this._heroXpFill = null;
        this._heroXpText = null;
        this._sellBtn = null;
        this._sellArmed = false;
        this._sellTimer = 0;

        // Structural refreshes.
        this._unsub = [
            game.bus.on('tower:upgrade', (p) => this._onUpgrade(p)),
            game.bus.on('hero:level', (p) => { if (p && p.tower === this._tower) this._render(); }),
            game.bus.on('cash', () => this._reprice()),
            // Self-drive selection so the panel stays correct even if the host
            // never calls show()/hide() explicitly.
            game.bus.on('tower:select', (p) => { if (p && p.tower) this.show(p.tower); else this.hide(); }),
            game.bus.on('tower:sell', (p) => { if (p && p.tower === this._tower) this.hide(); }),
        ];
    },

    show(tower) {
        if (!tower) { this.hide(); return; }
        this._tower = tower;
        this._sellArmed = false;
        this.root.classList.remove('hidden');
        this._render();
    },

    hide() {
        this._tower = null;
        this._sellArmed = false;
        if (this._sellTimer) { clearTimeout(this._sellTimer); this._sellTimer = 0; }
        this.root.classList.add('hidden');
        Tooltip.hideAll();
    },

    // Full teardown: drop bus subscriptions and remove the root from the DOM.
    // Called by the gamescreen's module-swap loop (resync) and by mount() to be
    // idempotent. Safe to call when never mounted.
    unmount() {
        if (this._unsub) {
            for (const u of this._unsub) { try { u(); } catch (e) { /* ignore */ } }
            this._unsub = null;
        }
        if (this._sellTimer) { clearTimeout(this._sellTimer); this._sellTimer = 0; }
        if (this.root && this.root.parentNode) this.root.parentNode.removeChild(this.root);
        this.root = null;
        this._tower = null;
        this._buyBtns = [null, null, null];
        this._heroBuy = null;
        try { Tooltip.hideAll(); } catch (e) { /* ignore */ }
    },

    refresh() { if (this._tower) this._render(); },

    // ---------------- rendering ----------------

    _render() {
        const tower = this._tower;
        if (!tower) return;
        Tooltip.hideAll();
        this.root.textContent = '';
        this._buyBtns = [null, null, null];
        this._heroBuy = null;

        this.root.appendChild(this._head(tower));
        this.root.appendChild(this._stats(tower));
        this.root.appendChild(this._targeting(tower));

        if (tower.isHero) this.root.appendChild(this._heroBlock(tower));
        else this.root.appendChild(this._paths(tower));

        this.root.appendChild(this._foot(tower));
        this._reprice();
    },

    _head(tower) {
        const def = tower.def;
        const head = document.createElement('div');
        head.className = 'up-head';

        const src = tower.isHero
            ? TowerSprites.heroSprite(def.id, 0)
            : (TowerSprites.sprite(def.id, tower.tiers, 0) || TowerSprites.icon(def.id));
        const icon = _spriteCanvas(src, 52);
        icon.className = 'up-icon';
        head.appendChild(icon);

        const tt = document.createElement('div');
        tt.className = 'up-title';
        const nm = document.createElement('div');
        nm.className = 'up-name';
        nm.textContent = def.name || def.id;
        const cat = document.createElement('div');
        cat.className = 'up-cat';
        cat.textContent = tower.isHero ? 'Hero' : (def.category || '');
        tt.appendChild(nm);
        tt.appendChild(cat);
        head.appendChild(tt);
        return head;
    },

    _stats(tower) {
        const st = _statLine(tower);
        const box = document.createElement('div');
        box.className = 'up-stats';
        const cells = [
            ['DMG', st.damage], ['RATE', st.rate], ['DPS', st.dps],
            ['RANGE', st.range], ['PIERCE', st.pierce],
        ];
        for (const [label, val] of cells) {
            const c = document.createElement('div');
            c.className = 'up-stat';
            c.innerHTML = '<span class="up-stat-v">' + _esc(val) + '</span>' +
                '<span class="up-stat-l">' + label + '</span>';
            box.appendChild(c);
        }
        const badges = [];
        if (st.flags.camo) badges.push(['Camo', 'up-badge-camo']);
        if (st.flags.ap) badges.push(['AP', 'up-badge-ap']);
        if (st.flags.air) badges.push(['Air', 'up-badge-air']);
        if (badges.length) {
            const row = document.createElement('div');
            row.className = 'up-badges';
            for (const [t, cls] of badges) {
                const b = document.createElement('span');
                b.className = 'up-badge ' + cls;
                b.textContent = t;
                row.appendChild(b);
            }
            box.appendChild(row);
        }
        return box;
    },

    _targeting(tower) {
        const wrap = document.createElement('div');
        wrap.className = 'up-target';
        const label = document.createElement('span');
        label.className = 'up-target-label';
        label.textContent = 'Targeting';
        const btn = document.createElement('button');
        btn.className = 'up-target-btn mc-btn mc-btn-small';
        btn.type = 'button';
        // MP: an in-flight mode change has not round-tripped yet -- cycling
        // must start from the PENDING mode or fast clicks resend the same
        // transition and the mode only advances once.
        const effectiveMode = () => {
            const pend = this.game._pending;
            if (pend) {
                for (let i = pend.length - 1; i >= 0; i--) {
                    if (pend[i].kind === 'target' && pend[i].uid === tower.uid) return pend[i].mode;
                }
            }
            return tower.targetMode;
        };
        btn.textContent = MODE_LABEL[effectiveMode()] || 'First';
        const cycle = (dir) => {
            const modes = TARGET_MODES;
            let idx = modes.indexOf(effectiveMode());
            if (idx < 0) idx = 0;
            idx = (idx + dir + modes.length) % modes.length;
            if (this.gate) this.gate.target(tower.uid, modes[idx]);
            else this.game.setTargetMode(tower, modes[idx]);
            btn.textContent = MODE_LABEL[effectiveMode()] || 'First';
            SFX.play('ui_click', { vol: 0.5 });
        };
        btn.addEventListener('click', () => cycle(1));
        btn.addEventListener('contextmenu', (e) => { e.preventDefault(); cycle(-1); });
        Tooltip.attach(btn, 'Cycle which mob this tower prefers: First / Last / Strong / Weak / Close. Right-click reverses.');
        wrap.appendChild(label);
        wrap.appendChild(btn);
        return wrap;
    },

    _paths(tower) {
        const wrap = document.createElement('div');
        wrap.className = 'up-paths';
        const paths = tower.def.paths || [];
        for (let p = 0; p < paths.length; p++) {
            wrap.appendChild(this._pathCol(tower, p, paths[p]));
        }
        return wrap;
    },

    _pathCol(tower, p, pathDef) {
        const col = document.createElement('div');
        col.className = 'up-path';
        col.style.setProperty('--path-c', PATH_COLORS[p] || '#888');

        const name = document.createElement('div');
        name.className = 'up-path-name';
        name.textContent = pathDef.name || ('Path ' + (p + 1));
        col.appendChild(name);

        const can = tower.canUpgrade(p);
        const pending = this._pendingUp(tower, p);
        const cur = tower.tiers[p] + (pending ? 1 : 0);   // effective (predicted) tier
        const tiersWrap = document.createElement('div');
        tiersWrap.className = 'up-tiers';
        const ups = pathDef.upgrades || [];

        for (let i = 0; i < 5; i++) {
            const up = ups[i] || { name: '???', desc: '', cost: 0 };
            const box = document.createElement('div');
            box.className = 'up-tier';
            box.dataset.path = String(p);
            box.dataset.tier = String(i);

            let state;
            if (i < cur) state = 'owned';
            else if (i === cur && can.ok && !pending) state = 'next';
            else state = 'locked';
            box.classList.add('up-tier-' + state);
            if (pending && i === cur - 1) box.classList.add('up-tier-pending');

            const pip = document.createElement('span');
            pip.className = 'up-tier-pip';
            pip.textContent = String(i + 1);
            const nm = document.createElement('span');
            nm.className = 'up-tier-name';
            nm.textContent = up.name;
            box.appendChild(pip);
            box.appendChild(nm);

            Tooltip.attach(box, () => {
                const owned = i < tower.tiers[p];
                const price = this.game.priceFor(up.cost, tower.x, tower.y);
                const foot = owned
                    ? '<div class="tt-owned">Owned</div>'
                    : '<div class="tt-cost">$' + formatCash(price) + '</div>';
                return '<div class="tt-title" style="color:' + (PATH_COLORS[p] || '#fff') + '">' +
                    _esc(up.name) + '</div><div>' + _esc(up.desc) + '</div>' + foot;
            });
            tiersWrap.appendChild(box);
        }
        col.appendChild(tiersWrap);

        const buy = document.createElement('button');
        buy.className = 'up-buy';
        buy.type = 'button';
        // pointerdown, not click: fires before any DOM churn from combat
        // events can replace nodes under the cursor (and feels snappier)
        buy.addEventListener('pointerdown', (e) => { if (e.button === 0) this._buy(p); });
        this._buyBtns[p] = buy;
        col.appendChild(buy);
        return col;
    },

    _heroBlock(tower) {
        const wrap = document.createElement('div');
        wrap.className = 'up-hero';

        const lvRow = document.createElement('div');
        lvRow.className = 'up-hero-lvrow';
        const badge = document.createElement('span');
        badge.className = 'up-hero-badge';
        const heroPend = this._pendingHero(tower);
        badge.textContent = 'Lv ' + tower.level + (heroPend ? ' +' + heroPend + '...' : '');
        const of = document.createElement('span');
        of.className = 'up-hero-of';
        of.textContent = '/ 20';
        lvRow.appendChild(badge);
        lvRow.appendChild(of);
        wrap.appendChild(lvRow);

        const bar = document.createElement('div');
        bar.className = 'up-xp';
        const fill = document.createElement('div');
        fill.className = 'up-xp-fill';
        const txt = document.createElement('span');
        txt.className = 'up-xp-text';
        bar.appendChild(fill);
        bar.appendChild(txt);
        wrap.appendChild(bar);
        this._heroXpFill = fill;
        this._heroXpText = txt;

        const levels = tower.def.levels || [];
        const nextDef = tower.level < 20 ? levels[tower.level - 1] : null;
        const next = document.createElement('div');
        next.className = 'up-hero-next';
        next.innerHTML = nextDef
            ? '<span class="up-hero-next-l">Next Lv ' + (tower.level + 1) + ':</span> ' + _esc(nextDef.desc || '')
            : '<span class="up-hero-next-l">Maxed</span> All levels unlocked.';
        wrap.appendChild(next);

        const buy = document.createElement('button');
        buy.className = 'up-buy up-hero-buy';
        buy.type = 'button';
        buy.addEventListener('pointerdown', (e) => {
            if (e.button !== 0 || buy.disabled) return;
            const ok = this.gate ? this.gate.heroLvl(tower.uid).ok : this.game.buyHeroLevel(tower);
            if (ok) {
                this._render();
            } else {
                SFX.play('ui_error', { vol: 0.5 });
            }
        });
        this._heroBuy = buy;
        wrap.appendChild(buy);
        this._updateHeroXp();
        return wrap;
    },

    _foot(tower) {
        const foot = document.createElement('div');
        foot.className = 'up-foot';

        const sell = document.createElement('button');
        sell.className = 'up-sell mc-btn mc-btn-red mc-btn-small';
        sell.type = 'button';
        sell.addEventListener('click', () => this._sell());
        this._sellBtn = sell;
        this._resetSell();

        const kd = document.createElement('div');
        kd.className = 'up-kd';
        kd.innerHTML = '<span>Kills <b>' + (tower.kills || 0) + '</b></span>' +
            '<span>Dmg <b>' + Math.round(tower.damageDealt || 0) + '</b></span>';

        foot.appendChild(kd);
        foot.appendChild(sell);
        return foot;
    },

    // ---------------- money / dynamic state ----------------

    _reprice() {
        const tower = this._tower;
        if (!tower) return;
        if (!tower.isHero) {
            for (let p = 0; p < 3; p++) this._setBuyState(p);
        } else {
            this._updateHeroBuy();
            this._updateHeroXp();
        }
    },

    // MP prediction: an in-flight upgrade/level for this tower (cleared when
    // the confirmed command lands or the pending entry expires).
    _pendingUp(tower, path) {
        const pend = this.game._pending;
        if (!pend) return false;
        for (let i = 0; i < pend.length; i++) {
            const en = pend[i];
            if (en.kind === 'upgrade' && en.uid === tower.uid && en.path === path) return true;
        }
        return false;
    },

    _pendingHero(tower) {
        const pend = this.game._pending;
        if (!pend) return 0;
        let n = 0;
        for (let i = 0; i < pend.length; i++) {
            if (pend[i].kind === 'herolvl' && pend[i].uid === tower.uid) n++;
        }
        return n;
    },

    _setBuyState(p) {
        const btn = this._buyBtns[p];
        const tower = this._tower;
        if (!btn || !tower) return;

        const can = tower.canUpgrade(p);
        const pending = this._pendingUp(tower, p);
        const mode = pending ? 'pending' : (can.reason === 'maxed' ? 'maxed' : (can.reason === 'locked' ? 'locked' : 'buy'));
        const nextTier = tower.tiers[p] + 1;

        // Rebuild children ONLY when the state shape changes. This runs on
        // every 'cash' event (every kill in combat) -- replacing the child
        // node under the cursor between mousedown and mouseup makes the
        // browser drop the click entirely, i.e. "can't upgrade in combat".
        if (btn._mode !== mode || (mode === 'buy' && btn._icTier !== nextTier)) {
            btn._mode = mode;
            btn._icTier = nextTier;
            btn._lbl = null;
            btn.textContent = '';
            btn.className = 'up-buy';
            btn.disabled = mode !== 'buy';
            if (mode === 'pending') {
                btn.classList.add('up-buy-pending');
                btn.textContent = 'UPGRADING...';
            } else if (mode === 'maxed') {
                btn.classList.add('up-buy-maxed');
                btn.textContent = 'MAXED';
            } else if (mode === 'locked') {
                btn.classList.add('up-buy-locked');
                const lock = document.createElement('span');
                lock.className = 'up-lock';
                lock.textContent = '\u{1F512}';
                const msg = document.createElement('span');
                msg.className = 'up-lock-msg';
                msg.textContent = this._lockMsg(p);
                btn.appendChild(lock);
                btn.appendChild(msg);
            } else {
                const ic = _spriteCanvas(TowerSprites.upgradeIcon(tower.def.id, p, nextTier), 24);
                ic.className = 'up-buy-icon';
                btn.appendChild(ic);
                const lbl = document.createElement('span');
                lbl.className = 'up-buy-lbl';
                btn.appendChild(lbl);
                btn._lbl = lbl;
            }
        }
        if (mode === 'buy') {
            const price = this.game.priceFor(can.cost, tower.x, tower.y);
            btn.classList.toggle('up-buy-poor', (this.game.state.cash + (this.game._pendingCashDelta || 0)) < price);
            if (btn._lbl) btn._lbl.textContent = 'BUY  $' + formatCash(price);
        }
    },

    // Both crosspath violations report reason 'locked'; distinguish for the label.
    _lockMsg(p) {
        const t = this._tower.tiers;
        let active = 0;
        for (let i = 0; i < 3; i++) if (t[i] > 0) active++;
        if (t[p] === 0 && active >= 2) return 'Path Locked';
        return 'Max 1 path past tier 2';
    },

    _updateHeroBuy() {
        const btn = this._heroBuy;
        const tower = this._tower;
        if (!btn || !tower) return;
        btn.textContent = '';
        btn.className = 'up-buy up-hero-buy';
        if (tower.level >= 20) {
            btn.classList.add('up-buy-maxed');
            btn.textContent = 'MAX LEVEL';
            btn.disabled = true;
            return;
        }
        btn.disabled = false;
        const cost = Math.floor(150 * Math.pow(tower.level, 1.5));
        const poor = (this.game.state.cash + (this.game._pendingCashDelta || 0)) < cost;
        btn.classList.toggle('up-buy-poor', poor);
        btn.textContent = 'LEVEL UP  $' + formatCash(cost);
    },

    _updateHeroXp() {
        const tower = this._tower;
        if (!tower || !tower.isHero || !this._heroXpFill) return;
        if (tower.level >= 20) {
            this._heroXpFill.style.width = '100%';
            if (this._heroXpText) this._heroXpText.textContent = 'MAX';
            return;
        }
        const need = tower.xpToNext ? tower.xpToNext() : 1;
        const have = tower.xp || 0;
        const frac = Math.max(0, Math.min(1, need > 0 ? have / need : 0));
        this._heroXpFill.style.width = (frac * 100).toFixed(1) + '%';
        if (this._heroXpText) this._heroXpText.textContent = Math.floor(have) + ' / ' + need + ' XP';
    },

    // ---------------- actions ----------------

    _buy(p) {
        const tower = this._tower;
        if (!tower) return;
        const can = tower.canUpgrade(p);
        if (!can.ok) { SFX.play('ui_error', { vol: 0.5 }); return; }
        const price = this.game.priceFor(can.cost, tower.x, tower.y);
        if ((this.game.state.cash + (this.game._pendingCashDelta || 0)) < price) { SFX.play('ui_error', { vol: 0.6 }); return; }
        // The gate emits 'tower:upgrade' (via game.buyUpgrade) -> _onUpgrade
        // re-renders + flashes, exactly as the direct call did in solo.
        const ok = this.gate ? this.gate.upgrade(tower.uid, p).ok : this.game.buyUpgrade(tower, p);
        if (!ok) SFX.play('ui_error', { vol: 0.5 });
    },

    _onUpgrade(payload) {
        if (!payload || payload.tower !== this._tower) return;
        const p = payload.path;
        const tier = payload.tier;   // 1-based resulting tier
        this._render();
        // Flash the box that was just purchased (0-based index tier-1).
        const box = this.root.querySelector('.up-tier[data-path="' + p + '"][data-tier="' + (tier - 1) + '"]');
        if (box) {
            box.classList.add('up-flash');
            setTimeout(() => box.classList.remove('up-flash'), 620);
        }
    },

    _sell() {
        const tower = this._tower;
        if (!tower) return;
        if (!this._sellArmed) {
            this._sellArmed = true;
            this._sellBtn.classList.add('armed');
            this._sellBtn.textContent = 'Confirm  $' + formatCash(tower.sellValue());
            if (this._sellTimer) clearTimeout(this._sellTimer);
            this._sellTimer = setTimeout(() => this._resetSell(), SELL_ARM_MS);
            SFX.play('ui_click', { vol: 0.6 });
            return;
        }
        this._resetSell();
        // emits tower:sell -> hide()
        if (this.gate) this.gate.sell(tower.uid);
        else this.game.sellTower(tower);
    },

    _resetSell() {
        this._sellArmed = false;
        if (this._sellTimer) { clearTimeout(this._sellTimer); this._sellTimer = 0; }
        if (this._sellBtn && this._tower) {
            this._sellBtn.classList.remove('armed');
            this._sellBtn.textContent = 'SELL  $' + formatCash(this._tower.sellValue());
        }
    },
};
