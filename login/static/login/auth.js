(() => {
  const form = document.getElementById('auth-form');

  if (!form) return;

  const errorBox = document.getElementById('auth-error');
  const submitButton = form.querySelector('button[type="submit"]');

  const fieldLabels = {
    email: 'メールアドレス',
    username: 'ユーザー名',
    password1: 'パスワード',
    password2: '確認用パスワード',
  };

  let submitting = false;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    // 連続クリックによる二重送信を防ぐ
    if (submitting) return;

    submitting = true;
    submitButton.disabled = true;
    errorBox.textContent = '';

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

      await LoginApi.request(endpoint, {
        method: 'POST',
        data,
      });

      // パスワードをフォームに残さない
      form.querySelectorAll('input[type="password"]').forEach(
        (input) => {
          input.value = '';
        }
      );

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

      errorBox.textContent =
        messages.join('\n') || error.message || '処理に失敗しました。';
    } finally {
      submitting = false;
      submitButton.disabled = false;
      submitButton.textContent = originalLabel;
    }
  });
})();
