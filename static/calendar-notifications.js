// ============================================================
// メール通知システム（予定のリマインダー・予定の開始時刻の通知）
// 1. 予定の開始時刻になった際の通知（開始時刻メール通知）
// 2. 放置された未確定予定のリマインダー通知
// ============================================================
const REMINDER_DAYS = 3;
let currentUserEmail = '';
let notificationTimerId = null;

function setUserEmail(email) {
  currentUserEmail = email || '';
  updateEmailNotificationUI();
}

function updateEmailNotificationUI() {
  const targetEl = document.getElementById('notify-email-target');
  const sendBtn = document.getElementById('send-reminder-email-btn');
  const testBtn = document.getElementById('send-test-email-btn');

  if (targetEl) {
    if (currentUserEmail) {
      targetEl.textContent = `送信先: ${currentUserEmail}`;
      targetEl.style.color = 'var(--on-surface-variant)';
    } else {
      targetEl.textContent = 'ログイン中のアドレス宛に送信（未ログイン）';
      targetEl.style.color = 'var(--error, #ba1a1a)';
    }
  }

  if (sendBtn) {
    sendBtn.disabled = !currentUserEmail;
  }
  if (testBtn) {
    testBtn.disabled = !currentUserEmail;
  }
}

/**
 * 予定の開始ミリ秒タイムスタンプを取得
 */
function getEventStartTimestamp(ev) {
  if (!ev || !ev.date || !ev.time) return null;
  const dateParts = ev.date.split('-').map(Number);
  const timeParts = ev.time.split(':').map(Number);
  if (dateParts.length !== 3 || timeParts.length < 2) return null;
  const [y, m, d] = dateParts;
  const [hh, mm] = timeParts;
  if (isNaN(y) || isNaN(m) || isNaN(d) || isNaN(hh) || isNaN(mm)) return null;
  return new Date(y, m - 1, d, hh, mm, 0, 0).getTime();
}

/**
 * EmailJS の設定を取得
 */
function getEmailJsConfig() {
  const cfg = (typeof window.EMAILJS_CONFIG !== 'undefined' && window.EMAILJS_CONFIG)
    ? window.EMAILJS_CONFIG
    : (typeof window.APP_CONFIG !== 'undefined' ? window.APP_CONFIG : null);

  if (!cfg || !cfg.serviceId) return null;

  if (cfg.templateId === 'your_template_id') {
    throw new Error('EmailJSの templateId を設定してください（app-config.js）');
  }

  return {
    serviceId: cfg.serviceId,
    templateId: cfg.templateId,
    publicKey: cfg.publicKey,
  };
}

/**
 * 低レイヤーメール送信処理
 * EmailJS / Firestore / Webhook をサポート（EmailJS 設定があれば最優先で使用）
 */
async function sendEmail({ subject, text, html }) {
  if (!currentUserEmail) {
    throw new Error('通知先のメールアドレスが確認できません。再度ログインしてください。');
  }

  // 1. EmailJS 設定がある場合は最優先で EmailJS を使用
  const emailJsConfig = getEmailJsConfig();
  if (emailJsConfig && emailJsConfig.serviceId && emailJsConfig.templateId) {
    if (!window.emailjs) {
      throw new Error('EmailJS SDKが読み込まれていません。ネットワーク接続を確認してください。');
    }
    if (emailJsConfig.publicKey && typeof window.emailjs.init === 'function') {
      window.emailjs.init(emailJsConfig.publicKey);
    }
    await window.emailjs.send(
      emailJsConfig.serviceId,
      emailJsConfig.templateId,
      {
        to_email: currentUserEmail,
        email: currentUserEmail,
        to_name: currentUserEmail,
        subject: subject,
        message: text,
        html_message: html,
      },
      emailJsConfig.publicKey
    );
    console.log(`[EmailJS] Sent email to ${currentUserEmail}:\nSubject: ${subject}`);
    return;
  }

  // 2. Firebase Firestore の mail コレクション（Trigger Email / Cloud Functions）
  if (window.firebase && typeof window.firebase.firestore === 'function') {
    const db = window.firebase.firestore();
    await db.collection('mail').add({
      to: currentUserEmail,
      message: {
        subject: subject,
        text: text,
        html: html,
      },
      createdAt: (window.firebase.firestore.FieldValue && typeof window.firebase.firestore.FieldValue.serverTimestamp === 'function')
        ? window.firebase.firestore.FieldValue.serverTimestamp()
        : new Date(),
    });
    console.log(`[Firebase Email] Enqueued email in /mail for ${currentUserEmail}`);
    return;
  }

  // 3. Webhook 連携
  if (window.EMAIL_WEBHOOK_URL) {
    const res = await fetch(window.EMAIL_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: currentUserEmail, subject, text, html })
    });
    if (!res.ok) throw new Error(`Webhook送信エラー: ${res.status}`);
    return;
  }

  throw new Error('メール送信プロバイダ（EmailJS / Firestore / Webhook）が設定されていません');
}

/**
 * 予定の開始時刻到達通知メールを送信
 * @param {Array} dueEvents 開始時刻を迎えた予定のリスト
 * @param {boolean} isManual 手動送信かどうか
 */
async function sendStartTimeEmail(dueEvents, isManual = false) {
  if (!currentUserEmail || !dueEvents || dueEvents.length === 0) return false;

  const appUrl = window.location.origin + window.location.pathname;
  const isSingle = dueEvents.length === 1;
  const firstEv = dueEvents[0];

  const subject = isSingle
    ? `【助じゅ～る】予定の開始時刻になりました: ${firstEv.title || '(無題)'}`
    : `【助じゅ～る】予定の開始時刻になりました（${dueEvents.length}件）`;

  const escapeFn = (typeof escapeHtml === 'function') ? escapeHtml : str => String(str).replace(/[&<>"']/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s]));

  // テキスト本文
  const textLines = [
    `助じゅ～るをご利用のアカウント（${currentUserEmail}）へのお知らせです。`,
    '',
    isSingle
      ? `「${firstEv.title || '(無題)'}」の開始時刻（${firstEv.time}）になりました！`
      : `以下の予定の開始時刻になりました：`,
    '',
    '■ 予定内容',
  ];

  dueEvents.forEach((ev, i) => {
    const endTimeStr = (typeof calcEndTime === 'function') ? calcEndTime(ev.time, ev.duration || 1) : '';
    const timeRange = endTimeStr ? `${ev.time}〜${endTimeStr}` : `${ev.time}〜`;
    const statusStr = ev.status === 'CONFIRMED' ? '確定' : '未確定';
    textLines.push(`${i + 1}. 【${statusStr}】${ev.title || '(無題)'}`);
    textLines.push(`   日時: ${ev.date} ${timeRange} (${ev.duration || 1}時間)`);
    if (ev.memo) textLines.push(`   メモ: ${ev.memo}`);
    textLines.push('');
  });

  textLines.push('▼ 助じゅ～るを開いて確認する');
  textLines.push(appUrl);
  const textBody = textLines.join('\n');

  // HTML本文
  const eventCardsHtml = dueEvents.map(ev => {
    const endTimeStr = (typeof calcEndTime === 'function') ? calcEndTime(ev.time, ev.duration || 1) : '';
    const timeRange = endTimeStr ? `${ev.time}〜${endTimeStr}` : `${ev.time}〜`;
    const isConfirmed = ev.status === 'CONFIRMED';
    const statusBadge = isConfirmed
      ? '<span style="background:#2e7d32;color:#fff;font-size:0.75rem;padding:2px 8px;border-radius:4px;margin-left:8px;">確定</span>'
      : '<span style="background:#e65100;color:#fff;font-size:0.75rem;padding:2px 8px;border-radius:4px;margin-left:8px;">未確定</span>';
    const memoHtml = ev.memo ? `<div style="margin-top:6px;font-size:0.9rem;color:#4b5563;background:#f3f4f6;padding:8px 12px;border-radius:4px;">${escapeFn(ev.memo)}</div>` : '';

    return `
      <div style="background:#fff;border-left:5px solid #2563eb;padding:14px 18px;margin-bottom:12px;border-radius:6px;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <div style="font-size:1.1rem;font-weight:bold;color:#1e3a8a;">
          ⏰ ${escapeFn(timeRange)} <span style="font-size:0.85rem;color:#6b7280;">(${ev.duration || 1}時間)</span>
          ${statusBadge}
        </div>
        <div style="font-size:1.05rem;font-weight:600;color:#111827;margin-top:4px;">
          ${escapeFn(ev.title || '(無題)')}
        </div>
        ${memoHtml}
      </div>
    `;
  }).join('');

  const htmlBody = `
    <div style="font-family:sans-serif;max-width:600px;line-height:1.6;color:#1f2937;background:#f8fafc;padding:24px;border-radius:12px;border:1px solid #e2e8f0;">
      <div style="background:#dbeafe;border:1px solid #bfdbfe;padding:12px 16px;border-radius:8px;margin-bottom:20px;">
        <h2 style="color:#1d4ed8;margin:0;font-size:1.2rem;">⏰ 予定の開始時刻になりました！</h2>
        <p style="margin:4px 0 0 0;font-size:0.9rem;color:#1e40af;">予定のスケジュールをご確認ください。</p>
      </div>
      <p style="font-size:0.95rem;color:#4b5563;margin-top:0;">
        助じゅ～るをご利用のアカウント（<strong>${escapeFn(currentUserEmail)}</strong>）へのお知らせです。
      </p>
      ${eventCardsHtml}
      <div style="margin-top:28px;text-align:center;">
        <a href="${appUrl}" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 28px;text-decoration:none;border-radius:6px;font-weight:bold;font-size:0.95rem;box-shadow:0 2px 4px rgba(37,99,235,0.2);">助じゅ～るを開く</a>
      </div>
    </div>
  `;

  try {
    await sendEmail({ subject, text: textBody, html: htmlBody });

    // 重複送信防止フラグの記録
    const allEvents = typeof loadEvents === 'function' ? loadEvents() : [];
    const dueIds = new Set(dueEvents.map(e => e.id));
    let changed = false;

    allEvents.forEach(ev => {
      if (dueIds.has(ev.id)) {
        ev.startNotifiedKey = `${ev.date}_${ev.time}`;
        changed = true;
      }
    });

    if (changed && typeof saveEvents === 'function') {
      await saveEvents(allEvents);
    }

    const toastMsg = isSingle
      ? `「${firstEv.title || '(無題)'}」の開始時刻通知メールを送信しました ⏰`
      : `${dueEvents.length}件の開始時刻通知メールを送信しました ⏰`;

    if (typeof showFeedback === 'function') {
      showFeedback(toastMsg);
    }
    return true;
  } catch (error) {
    console.error('[Email Notification Error]', error);
    if (typeof showFeedback === 'function') {
      showFeedback(`開始時刻通知の送信に失敗しました: ${error.message}`, true);
    }
    return false;
  }
}

/**
 * 未確定予定のリマインダーメールを送信
 * @param {Array} tentativeEvents 送信対象の未確定予定リスト
 * @param {boolean} isManual 手動送信かどうか
 */
async function sendReminderEmail(tentativeEvents, isManual = false) {
  if (!currentUserEmail) {
    if (isManual && typeof showFeedback === 'function') {
      showFeedback('通知先のメールアドレスが確認できません。再度ログインしてください。', true);
    }
    return false;
  }

  if (!tentativeEvents || tentativeEvents.length === 0) {
    if (isManual && typeof showFeedback === 'function') {
      showFeedback('未確定の予定はありません 👍');
    }
    return false;
  }

  const subject = `【助じゅ～る】未確定の予定があります（${tentativeEvents.length}件）`;
  const escapeFn = (typeof escapeHtml === 'function') ? escapeHtml : str => String(str).replace(/[&<>"']/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s]));
  const appUrl = window.location.origin + window.location.pathname;

  const eventListText = tentativeEvents.map((ev, i) => {
    const createdDate = ev.createdAt ? new Date(ev.createdAt).toLocaleDateString('ja-JP') : '日時不明';
    return `${i + 1}. ${ev.title || '(無題)'} (登録日: ${createdDate})${ev.memo ? ' - ' + ev.memo : ''}`;
  }).join('\n');

  const body = [
    `助じゅ～るをご利用のアカウント（${currentUserEmail}）へのお知らせです。`,
    '',
    `以下の予定が未確定トレイに残っています。`,
    `日程の確認・確定をお願いいたします：`,
    '',
    eventListText,
    '',
    `▼ 助じゅ～るを開く`,
    appUrl,
  ].join('\n');

  const htmlList = tentativeEvents.map(ev => {
    const createdDate = ev.createdAt ? new Date(ev.createdAt).toLocaleDateString('ja-JP') : '日時不明';
    const escTitle = escapeFn(ev.title || '(無題)');
    const escMemo = ev.memo ? escapeFn(ev.memo) : '';
    return `
      <li style="margin-bottom:10px;">
        <strong>${escTitle}</strong> <span style="color:#6b7280;font-size:0.85rem;">(登録日: ${createdDate})</span>
        ${escMemo ? '<div style="color:#4b5563;font-size:0.9rem;margin-top:2px;">' + escMemo + '</div>' : ''}
      </li>
    `;
  }).join('');

  const htmlBody = `
    <div style="font-family:sans-serif;max-width:600px;line-height:1.6;color:#1f2937;background:#f8fafc;padding:24px;border-radius:12px;border:1px solid #e2e8f0;">
      <h2 style="color:#d97706;margin-top:0;">📌 【助じゅ～る】未確定の予定のリマインダー</h2>
      <p style="color:#4b5563;font-size:0.95rem;">助じゅ～るをご利用のアカウント（<strong>${escapeFn(currentUserEmail)}</strong>）へのお知らせです。</p>
      <div style="background:#fffbeb;border-left:4px solid #f59e0b;padding:12px 16px;border-radius:4px;margin:16px 0;">
        <p style="margin:0;font-size:0.95rem;color:#92400e;">以下の予定が未確定トレイに残っています。日程の確定をお願いいたします：</p>
      </div>
      <ul style="background:#fff;padding:16px 24px;border-radius:8px;border:1px solid #e5e7eb;">
        ${htmlList}
      </ul>
      <p style="margin-top:24px;text-align:center;">
        <a href="${appUrl}" style="display:inline-block;background:#d97706;color:#fff;padding:10px 24px;text-decoration:none;border-radius:4px;font-weight:bold;">助じゅ～るを開いて確認する</a>
      </p>
    </div>
  `;

  try {
    await sendEmail({ subject, text: body, html: htmlBody });

    // 重複送信防止のため、対象予定の remindedOn を更新
    const today = typeof todayStr === 'function' ? todayStr() : new Date().toISOString().slice(0, 10);
    const allEvents = typeof loadEvents === 'function' ? loadEvents() : [];
    const targetIds = new Set(tentativeEvents.map(e => e.id));
    let changed = false;

    allEvents.forEach(ev => {
      if (targetIds.has(ev.id)) {
        ev.remindedOn = today;
        changed = true;
      }
    });

    if (changed && typeof saveEvents === 'function') {
      await saveEvents(allEvents);
    }

    if (typeof showFeedback === 'function') {
      showFeedback(`「${currentUserEmail}」宛に未確定リマインドメールを送信しました ✉️`);
    }
    return true;
  } catch (error) {
    console.error('[Email Notification Error]', error);
    if (typeof showFeedback === 'function') {
      showFeedback(`リマインドメール送信に失敗しました: ${error.message}`, true);
    }
    return false;
  }
}

/**
 * 予定の開始時刻に合わせた通知チェック（リアルタイム監視用）
 * 現在時刻と開始時刻を比較し、開始時刻を迎えた予定を検知してメール送信
 */
async function checkStartTimeNotifications() {
  if (!currentUserEmail) return;
  if (typeof store === 'undefined' || !store.ready || store.busy || (typeof loading !== 'undefined' && loading)) return;
  if (typeof loadEvents !== 'function') return;

  const events = loadEvents();
  const now = Date.now();
  const dueEvents = [];

  events.forEach(ev => {
    if (ev.status === 'COMPLETED') return;
    const startMs = getEventStartTimestamp(ev);
    if (!startMs) return;

    const notifiedKey = `${ev.date}_${ev.time}`;
    if (ev.startNotifiedKey === notifiedKey) return;

    // 開始時刻を迎えている（now >= startMs）かつ、開始から30分以内
    // （過去数日前の予定などが一斉に送られるのを防ぐため、30分以内の直近のみ対象）
    const elapsedMs = now - startMs;
    if (elapsedMs >= 0 && elapsedMs <= 30 * 60 * 1000) {
      dueEvents.push(ev);
    }
  });

  if (dueEvents.length > 0) {
    console.log(`[Start Time Notification] ${dueEvents.length} event(s) reached start time, sending email...`);
    await sendStartTimeEmail(dueEvents, false);
  }
}

/**
 * 放置された未確定予定の自動メールリマインドチェック
 */
async function checkEmailReminders() {
  if (!currentUserEmail) return;
  if (typeof store === 'undefined' || !store.ready || store.busy || (typeof loading !== 'undefined' && loading)) return;
  if (typeof loadEvents !== 'function') return;

  // まず開始時刻の通知をチェック
  await checkStartTimeNotifications();

  // 次に未確定予定のリマインドをチェック
  const events = loadEvents();
  const now = Date.now();
  const dueMs = REMINDER_DAYS * 24 * 60 * 60 * 1000;
  const today = typeof todayStr === 'function' ? todayStr() : new Date().toISOString().slice(0, 10);

  const dueTentativeEvents = events.filter(ev => {
    if (ev.status !== 'TENTATIVE') return false;
    if (now - (ev.createdAt || 0) < dueMs) return false;
    if (ev.remindedOn === today) return false;
    return true;
  });

  if (dueTentativeEvents.length > 0) {
    await sendReminderEmail(dueTentativeEvents, false);
  }
}

/**
 * 登録メールアドレス宛にテストメールを送信
 */
async function sendTestEmail() {
  if (!currentUserEmail) {
    if (typeof showFeedback === 'function') {
      showFeedback('通知先のメールアドレスが確認できません。再度ログインしてください。', true);
    }
    return false;
  }

  const subject = '【助じゅ～る】テストメール通知（予定リマインダー・開始時刻通知）';
  const nowStr = new Date().toLocaleString('ja-JP');
  const appUrl = window.location.origin + window.location.pathname;

  const body = [
    `助じゅ～るをご利用のアカウント（${currentUserEmail}）へのお知らせです。`,
    '',
    'これは【予定のリマインダー・予定の開始時刻通知システム】のテスト送信です。',
    'このメールが届いている場合、メール通知システムは正常に稼働しています。',
    '',
    '▼ メール通知システムの役割',
    '1. 予定の開始時刻の通知: 登録された予定の開始時刻になると、自動的に開始をお知らせします。',
    '2. 予定のリマインダー: トレイに残った未確定の予定の確認・確定をリマインドします。',
    '',
    `送信日時: ${nowStr}`,
    '',
    '▼ 助じゅ～るを開く',
    appUrl,
  ].join('\n');

  const htmlBody = `
    <div style="font-family:sans-serif;max-width:600px;line-height:1.6;color:#1f2937;background:#f8fafc;padding:24px;border-radius:12px;border:1px solid #e2e8f0;">
      <h2 style="color:#2563eb;margin-top:0;">【助じゅ～る】テストメール通知</h2>
      <p>助じゅ～るをご利用のアカウント（<strong>${currentUserEmail}</strong>）へのお知らせです。</p>
      <div style="background:#eff6ff;border-left:4px solid #3b82f6;padding:12px 16px;margin:16px 0;border-radius:4px;">
        <p style="margin:0;font-weight:bold;color:#1e40af;">✓ メール通知機能は正常に稼働しています</p>
        <p style="margin:4px 0 0 0;font-size:0.9em;color:#6b7280;">送信日時: ${nowStr}</p>
      </div>
      <div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-top:16px;">
        <h4 style="margin:0 0 8px 0;color:#111827;">💡 メール通知システムの機能</h4>
        <ul style="margin:0;padding-left:20px;font-size:0.95rem;color:#4b5563;">
          <li style="margin-bottom:6px;"><strong>⏰ 予定の開始時刻の通知:</strong> 予定の開始時刻になると、自動で開始のお知らせメールが届きます。</li>
          <li><strong>📌 予定のリマインダー:</strong> 未確定トレイに残った予定の確定をリマインドします。</li>
        </ul>
      </div>
      <p style="margin-top:24px;text-align:center;">
        <a href="${appUrl}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 24px;text-decoration:none;border-radius:4px;font-weight:bold;">助じゅ～るを開く</a>
      </p>
    </div>
  `;

  try {
    await sendEmail({ subject, text: body, html: htmlBody });
    console.log(`[Email Notification] Sent test email to ${currentUserEmail}`);

    if (typeof showFeedback === 'function') {
      showFeedback(`「${currentUserEmail}」宛にテストメールを送信しました ✉️`);
    }
    return true;
  } catch (error) {
    console.error('[Email Notification Error]', error);
    if (typeof showFeedback === 'function') {
      showFeedback(`テストメール送信に失敗しました: ${error.message}`, true);
    }
    return false;
  }
}

function initEmailNotifications() {
  const sendBtn = document.getElementById('send-reminder-email-btn');
  if (sendBtn) {
    sendBtn.addEventListener('click', async () => {
      sendBtn.disabled = true;
      try {
        const events = typeof loadEvents === 'function' ? loadEvents() : [];
        const now = Date.now();

        // 1. 直近で開始時刻を迎えている（または本日これから迎える）予定があるかチェック
        const dueStartTimeEvents = events.filter(ev => {
          if (ev.status === 'COMPLETED') return false;
          const startMs = getEventStartTimestamp(ev);
          if (!startMs) return false;
          const elapsedMs = now - startMs;
          // 開始時刻から1時間以内またはこれから30分以内に開始
          return (elapsedMs >= 0 && elapsedMs <= 60 * 60 * 1000) || (startMs > now && startMs - now <= 30 * 60 * 1000);
        });

        // 2. 未確定の予定
        const tentativeEvents = events.filter(ev => ev.status === 'TENTATIVE');

        if (dueStartTimeEvents.length > 0) {
          await sendStartTimeEmail(dueStartTimeEvents, true);
        } else if (tentativeEvents.length > 0) {
          await sendReminderEmail(tentativeEvents, true);
        } else {
          if (typeof showFeedback === 'function') {
            showFeedback('開始時刻を迎えた直近の予定や、未確定の予定はありません 👍');
          }
        }
      } finally {
        sendBtn.disabled = !currentUserEmail;
      }
    });
  }

  const testBtn = document.getElementById('send-test-email-btn');
  if (testBtn) {
    testBtn.addEventListener('click', async () => {
      testBtn.disabled = true;
      try {
        await sendTestEmail();
      } finally {
        testBtn.disabled = !currentUserEmail;
      }
    });
  }

  // 30秒ごとに予定の開始時刻到達を定期監視
  if (notificationTimerId) {
    clearInterval(notificationTimerId);
  }
  notificationTimerId = setInterval(() => {
    checkStartTimeNotifications();
  }, 30 * 1000);

  // タブがアクティブになった際にも即座にチェック
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !window.selectedEventId) {
      if (typeof refreshEvents === 'function') {
        refreshEvents().then(checkEmailReminders);
      } else {
        checkEmailReminders();
      }
    }
  });

  updateEmailNotificationUI();
}

document.addEventListener('DOMContentLoaded', () => {
  initEmailNotifications();
});
