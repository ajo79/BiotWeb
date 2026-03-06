export default function NotificationsPage() {
  const stored = JSON.parse(localStorage.getItem("biot_notifications") || "[]");
  return (
    <div className="glass rounded-2xl p-5 border border-white/5 shadow-ambient">
      <h2 className="text-2xl font-semibold mb-3">Notifications</h2>
      <p className="text-sm text-slate-400 mb-3">Demo inbox. Hook to alarms or backend when available.</p>
      <div className="space-y-2">
        {stored.length === 0 && <p className="text-slate-400 text-sm">No notifications yet.</p>}
        {stored.map((n: any, idx: number) => (
          <div key={idx} className="glass rounded-xl p-3 border border-white/5">
            <p className="font-semibold">{n.title}</p>
            <p className="text-sm text-slate-400">{n.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
