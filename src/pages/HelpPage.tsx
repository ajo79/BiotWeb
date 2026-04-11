import { useState } from "react";

export default function HelpPage() {
  const [form, setForm] = useState({ name: "", phone: "", email: "", requirement: "" });
  const [message, setMessage] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setMessage("Thank you. Your enquiry has been submitted.");
    setForm({ name: "", phone: "", email: "", requirement: "" });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-400">Help Center</p>
          <h2 className="text-2xl font-semibold">Contact Details</h2>
        </div>
      </div>

      <div className="grid md:grid-cols-[1fr,1.1fr] gap-6 items-start">
        <div className="glass rounded-2xl p-5 border border-white/5 shadow-ambient space-y-3 text-sm text-slate-600">
          <p className="text-base font-semibold text-slate-900">BlackStar Products Pvt. Ltd.</p>
          <p><span className="font-semibold text-slate-700">GST Num:</span> 27AANCB7687C1Z9</p>
          <p>
            <span className="font-semibold text-slate-700">Address:</span>{" "}
            1102, 11th floor, Makhija Royale, Plot number 753, SV Rd, Khar West, Mumbai, Maharashtra 400052
          </p>
          <p><span className="font-semibold text-slate-700">Mobile:</span> +91 9920977098</p>
          <p><span className="font-semibold text-slate-700">Mail:</span> info@blackstarproducts.com</p>
          <p><span className="font-semibold text-slate-700">Web:</span> www.blackstarproducts.com</p>
        </div>

        <div className="glass rounded-2xl p-5 border border-white/5 shadow-ambient">
          <h3 className="text-lg font-semibold mb-1">Contact Us</h3>
          <p className="text-sm text-slate-500 mb-4">Tell us about your requirement for the best quote.</p>
          <form className="space-y-3" onSubmit={submit}>
            <label className="block text-sm text-slate-500">
              Full name
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="mt-1 w-full glass rounded-lg px-3 py-2 border border-white/5 bg-panel"
                placeholder="Your name"
                required
              />
            </label>
            <label className="block text-sm text-slate-500">
              Phone
              <input
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                className="mt-1 w-full glass rounded-lg px-3 py-2 border border-white/5 bg-panel"
                placeholder="Phone number"
                required
              />
            </label>
            <label className="block text-sm text-slate-500">
              Email
              <input
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                className="mt-1 w-full glass rounded-lg px-3 py-2 border border-white/5 bg-panel"
                placeholder="name@company.com"
                required
              />
            </label>
            <label className="block text-sm text-slate-500">
              Requirement
              <textarea
                value={form.requirement}
                onChange={(e) => setForm((f) => ({ ...f, requirement: e.target.value }))}
                className="mt-1 w-full glass rounded-lg px-3 py-2 border border-white/5 bg-panel min-h-[120px]"
                placeholder="Tell us about your requirement"
                required
              />
            </label>
            {message && <p className="text-sm text-emerald-600">{message}</p>}
            <button type="submit" className="px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold">
              Submit enquiry
            </button>
          </form>
        </div>
      </div>

      <div className="glass rounded-2xl p-5 border border-white/5 shadow-ambient space-y-3">
        <h2 className="text-xl font-semibold">Helpful tips</h2>
        <ul className="list-disc list-inside text-slate-200 space-y-2">
          <li>Data refresh every 5s (Realtime Monitor). If empty, device may be offline.</li>
          <li>History queries use IoTReadings dataset; pick date range in Graph/Export.</li>
          <li>Factory login: CEAT / 1234 (demo).</li>
        </ul>
      </div>
    </div>
  );
}

