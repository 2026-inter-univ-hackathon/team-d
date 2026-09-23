/* Server-backed state. Keep rendering synchronous; commit changes only after API success. */
class CalendarStore {
  constructor(request) {
    this.request = request;
    this.events = [];
    this.busy = false;
    this.ready = false;
  }
  load() { return structuredClone(this.events); }
  async refresh() {
    const result = await this.request('/api/events/');
    if (!Array.isArray(result.events)) throw new Error('予定データを読み込めませんでした。');
    this.events = result.events;
    this.ready = true;
  }
  async save(next) {
    if (this.busy || !this.ready) throw new Error('読み込み・保存が終わってから操作してください。');
    this.busy = true;
    const fields = ['title', 'memo', 'status', 'date', 'time', 'duration', 'remindedOn'];
    try {
      const previous = this.load();
      for (const before of previous) {
        if (!next.some(event => event.id === before.id)) {
          await this.request(`/api/events/${before.id}/`, 'DELETE', { version: before.version });
          this.events = this.events.filter(event => event.id !== before.id);
        }
      }
      for (const event of next) {
        const before = previous.find(item => item.id === event.id);
        const changes = Object.fromEntries(fields.filter(key => !before || event[key] !== before[key]).map(key => [key, event[key]]));
        if (!Object.keys(changes).length) continue;
        const result = before
          ? await this.request(`/api/events/${event.id}/`, 'PATCH', { ...changes, version: before.version })
          : await this.request('/api/events/', 'POST', changes);
        if (before) this.events = this.events.map(item => item.id === before.id ? result.event : item);
        else this.events.push(result.event);
      }
    } catch (error) {
      // A lost response may still have committed. Reconcile before allowing another edit.
      this.ready = false;
      try { await this.refresh(); } catch { /* Retry explicitly after the connection recovers. */ }
      throw error;
    } finally {
      this.busy = false;
    }
  }
}
if (typeof module !== 'undefined') module.exports = CalendarStore;
