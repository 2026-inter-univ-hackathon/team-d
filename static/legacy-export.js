// Run at the original file URL so browsers that isolate file localStorage can find it.
if (window.location.protocol === 'file:') {
  document.addEventListener('DOMContentLoaded', () => {
    const main = document.createElement('main');
    main.innerHTML = `
      <h1>助じゅ～る — 以前の予定を書き出す</h1>
      <p>現在のアプリはFirebase版のローカルサーバーから開きます。以前このファイルで使っていた予定は、ここから書き出せます。</p>
      <p>以前と同じブラウザ・プロファイル・ファイルの場所で開いてください。</p>
      <button id="export-legacy" type="button">予定をJSONに書き出す</button>
      <p id="export-result" role="status"></p>
      <p>書き出したら <a href="http://127.0.0.1:8080/login.html">アプリを開く</a> → ログイン →「以前の予定を取り込む」でJSONを選んでください。</p>`;
    document.body.replaceChildren(main);
    document.title = '以前の予定を書き出す | 助じゅ～る';
    document.getElementById('export-legacy').addEventListener('click', () => {
      const result = document.getElementById('export-result');
      try {
        const events = JSON.parse(localStorage.getItem('tentative_calendar_events') || '[]');
        if (!Array.isArray(events)) throw new Error('保存データの形式が正しくありません。');
        if (!events.length) { result.textContent = 'このブラウザ・ファイルの場所には予定がありません。'; return; }
        const url = URL.createObjectURL(new Blob([JSON.stringify(events, null, 2)], { type: 'application/json' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = 'sukejuru-events.json';
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        result.textContent = `${events.length}件を書き出しました。元のデータはそのまま残しています。`;
      } catch (error) { result.textContent = error.message; }
    });
  });
}
