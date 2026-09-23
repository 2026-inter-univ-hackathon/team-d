(() => {
  const form = document.getElementById('auth-form');

  if (!form) return;

  const errorBox = document.getElementById('auth-error');
  const infoBox = document.getElementById('auth-info');
  const submitButton = form.querySelector('button[type="submit"]');
  const resetButton = document.getElementById('password-reset');

  const fieldLabels = {
    email: 'メールアドレス',
    username: 'ユーザー名',
    password1: 'パスワード',
    password2: '確認用パスワード',
  };

  let submitting = false;

  function notify(box, text) {
    if (!box) return;
    box.textContent = text;
    if (!text) {
      box.classList?.remove?.('active');
      return;
    }
    if (typeof ui === 'function') {
      ui(box);
    } else {
      box.classList?.add?.('active');
      if (typeof setTimeout === 'function') {
        setTimeout(() => box.classList?.remove?.('active'), 5000);
      }
    }
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    // 連続クリックによる二重送信を防ぐ
    if (submitting) return;

    submitting = true;
    submitButton.disabled = true;
    notify(errorBox, '');
    notify(infoBox, '');

    const originalLabel = submitButton.textContent;
    submitButton.textContent = '処理しています…';

    try {
      const inputs = new FormData(form);
      const isSignup = form.dataset.mode === 'signup';

      const data = {
        email: String(inputs.get('email') || '').trim(),
      };

      if (isSignup) {
        data.username = String(inputs.get('username') || '').trim();
        data.password1 = String(inputs.get('password1') || '');
        data.password2 = String(inputs.get('password2') || '');
      } else {
        data.password = String(inputs.get('password') || '');
      }

      const endpoint = isSignup
        ? '/api/auth/signup/'
        : '/api/auth/login/';

      const result = await LoginApi.request(endpoint, {
        method: 'POST',
        data,
      });

      // パスワードをフォームに残さない
      form.querySelectorAll('input[type="password"]').forEach(
        (input) => {
          input.value = '';
        }
      );

      if (isSignup && result.verificationSent) {
        notify(infoBox, '確認メールを送信しました。メール内のリンクを開いてからログインしてください。');
        return;
      }

      // 公開時にはPagesのカレンダーURLをHTML側で指定する
      window.location.assign(form.dataset.successUrl || '/');
    } catch (error) {
      const messages = [];
      const fields = error.details?.fields;

      if (fields) {
        for (const [name, errors] of Object.entries(fields)) {
          const label = fieldLabels[name];

          for (const item of errors) {
            messages.push(
              label ? `${label}：${item.message}` : item.message
            );
          }
        }
      }

      notify(errorBox, messages.join('\n') || error.message || '処理に失敗しました。');
    } finally {
      submitting = false;
      submitButton.disabled = false;
      submitButton.textContent = originalLabel;
    }
  });

  if (resetButton) {
    resetButton.addEventListener('click', async () => {
      if (submitting) return;
      submitting = true;
      submitButton.disabled = true;
      resetButton.disabled = true;
      notify(errorBox, '');
      notify(infoBox, '');
      const originalLabel = resetButton.textContent;
      resetButton.textContent = '送信しています…';

      try {
        const inputs = new FormData(form);
        await LoginApi.request('/api/auth/password-reset/', {
          method: 'POST',
          data: { email: String(inputs.get('email') || '').trim() },
        });
        notify(infoBox, '登録状況にかかわらず、再設定可能な場合はメールを送信しました。');
      } catch (error) {
        notify(errorBox, error.message || '処理に失敗しました。');
      } finally {
        submitting = false;
        submitButton.disabled = false;
        resetButton.disabled = false;
        resetButton.textContent = originalLabel;
      }
    });
  }
})();
