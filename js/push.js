/**
 * NOTIFICAÇÕES NO APARELHO (Configurações > Notificações > "No aparelho")
 *
 * Para quem não usa o Telegram: liga o Web Push neste aparelho e grava a
 * inscrição em push_inscricoes. O servidor (supabase/functions/_shared/
 * webpush.ts) avisa por aqui as contas que chegam por e-mail e as
 * movimentações novas do banco (Pluggy); a conta fica no grupo "A confirmar"
 * e as do banco na revisão do Open Finance. Com o Telegram vinculado, os
 * avisos continuam lá.
 *
 * O service worker (scripts/sw.template.js) só existe no site publicado.
 */

/** Chave pública VAPID (a privada fica no banco, em app_cron_segredo 'vapid_jwk'). */
const VAPID_PUBLICA = 'BH76LMJfJBG6EeAISt-GQ7GXCHbW9znxZkBVmTL6CCSTsCscWnZj3JHU3w3jXEeHEUkgX3tseKcbFwCEatI_PIA';

function _pushBytes(b64url) {
    const b = atob(b64url.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64url.length + 3) % 4));
    return Uint8Array.from(b, c => c.charCodeAt(0));
}

function _pushSuportado() {
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function _pushNomeAparelho() {
    const ua = navigator.userAgent;
    const so = /iPhone|iPad/.test(ua) ? 'iPhone/iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'Mac' : 'Outro';
    const nav = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : '';
    return `${so}${nav ? ' · ' + nav : ''}`;
}

async function iniciarPush() {
    const box = document.getElementById('pushBox');
    if (!box) return;
    const intro = '<p class="menu-hint">Para quem não usa o Telegram: as contas que chegam por e-mail e as movimentações novas do banco avisam com uma notificação neste aparelho; a conta fica no grupo "A confirmar" e as do banco em Open Finance, para você confirmar.</p>';
    if (!_pushSuportado()) {
        box.innerHTML = intro + '<p class="menu-hint">Este navegador não recebe notificações. No iPhone, adicione o app à Tela de Início (Compartilhar &rarr; Adicionar à Tela de Início) e ative por lá.</p>';
        return;
    }
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) {
        box.innerHTML = intro + '<p class="menu-hint">As notificações funcionam no app publicado (não neste ambiente de teste).</p>';
        return;
    }
    const inscricao = await reg.pushManager.getSubscription();
    if (inscricao) {
        box.innerHTML = `${intro}
            <div class="pluggy-telegram-status">
                <p class="item-descricao">✅ Ligadas neste aparelho (${escaparHtml(_pushNomeAparelho())})</p>
                <button type="button" class="mini-btn" id="btnPushDesligar">Desligar</button>
            </div>`;
        box.querySelector('#btnPushDesligar').onclick = async () => {
            await sb.from('push_inscricoes').delete().eq('endpoint', inscricao.endpoint);
            await inscricao.unsubscribe().catch(() => {});
            mostrarNotificacao('Notificações desligadas neste aparelho');
            iniciarPush();
        };
        return;
    }
    const negado = Notification.permission === 'denied';
    box.innerHTML = intro + (negado
        ? '<p class="menu-hint">As notificações deste site estão bloqueadas no navegador: libere nas permissões do site e volte aqui.</p>'
        : '<button type="button" class="btn-submit" id="btnPushLigar">🔔 Ativar notificações neste aparelho</button>');
    const btn = box.querySelector('#btnPushLigar');
    if (btn) btn.onclick = () => ativarPush(reg, btn);
}

async function ativarPush(reg, btn) {
    btn.disabled = true;
    try {
        if (await Notification.requestPermission() !== 'granted') {
            mostrarNotificacao('Permissão de notificação negada', 'info');
            return iniciarPush();
        }
        const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: _pushBytes(VAPID_PUBLICA) });
        const j = sub.toJSON();
        const { error } = await sb.from('push_inscricoes').upsert(
            { endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, aparelho: _pushNomeAparelho() }, { onConflict: 'endpoint' });
        if (error) throw error;
        mostrarNotificacao('Notificações ativadas neste aparelho');
    } catch (e) {
        console.error(e);
        mostrarNotificacao('Não consegui ativar as notificações', 'erro');
    }
    iniciarPush();
}
