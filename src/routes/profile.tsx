import { createFileRoute, Link } from "@tanstack/react-router";
import { User, ArrowRight, LogIn, Settings, HelpCircle, FileText, ShieldCheck } from "lucide-react";
import { Header, WhatsAppFloat } from "@/routes/index";

export const Route = createFileRoute("/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  // Placeholder — no auth connected yet
  const isLoggedIn = false;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="max-w-md mx-auto px-4 py-8">
        {isLoggedIn ? <LoggedInView /> : <LoggedOutView />}
      </main>
      <WhatsAppFloat />
    </div>
  );
}

function LoggedOutView() {
  return (
    <div className="text-center space-y-6">
      <div className="w-24 h-24 rounded-full bg-brand-soft flex items-center justify-center mx-auto">
        <User size={44} className="text-brand" />
      </div>
      <div>
        <h1 className="text-2xl font-bold text-foreground">अपना खाता देखें</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Login करें और अपनी सभी सेवाएँ एवं Proof एक ही जगह देखें।
        </p>
      </div>

      {/* Placeholder login buttons */}
      <div className="space-y-3">
        <button className="w-full flex items-center justify-center gap-2 bg-brand text-white font-bold py-3.5 rounded-full hover:bg-brand-deep transition-colors">
          <LogIn size={18} /> Login with WhatsApp
        </button>
        <button className="w-full flex items-center justify-center gap-2 bg-secondary text-foreground font-semibold py-3.5 rounded-full hover:bg-muted transition-colors border border-black/5">
          Login with Google
        </button>
      </div>

      <p className="text-[11px] text-muted-foreground italic">
        * Auth not connected yet — placeholder UI.
      </p>

      {/* Quick links */}
      <div className="card-soft mt-8 divide-y divide-black/5">
        {[
          { icon: HelpCircle, label: "Help / Support", href: "#" },
          { icon: FileText, label: "Terms & Privacy", href: "#" },
        ].map(({ icon: Icon, label, href }) => (
          <a key={label} href={href} className="flex items-center gap-3 px-4 py-4 hover:bg-secondary/50 transition-colors">
            <Icon size={20} className="text-muted-foreground" />
            <span className="font-semibold text-foreground flex-1">{label}</span>
            <ArrowRight size={16} className="text-muted-foreground" />
          </a>
        ))}
      </div>
    </div>
  );
}

function LoggedInView() {
  // Static placeholder profile
  const user = { name: "Rajesh Sharma", whatsapp: "+91 9876543210", plan: "Premium ₹399/Monthly" };
  return (
    <div className="space-y-6">
      <div className="card-soft p-5 flex items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-brand to-[#F5A742] text-white flex items-center justify-center font-bold text-2xl">
          {user.name.split(" ").map((w) => w[0]).join("").slice(0, 2)}
        </div>
        <div className="min-w-0">
          <div className="font-bold text-lg text-foreground truncate">{user.name}</div>
          <div className="text-sm text-muted-foreground truncate">{user.whatsapp}</div>
          <div className="mt-1 inline-flex items-center gap-1 bg-success/10 text-success text-xs font-bold px-2 py-1 rounded-full">
            <ShieldCheck size={12} /> Active
          </div>
        </div>
      </div>

      <div className="card-soft divide-y divide-black/5">
        <div className="px-4 py-4">
          <div className="text-xs text-muted-foreground">Active Plan</div>
          <div className="font-bold text-foreground mt-0.5">{user.plan}</div>
        </div>
        <div className="px-4 py-4">
          <div className="text-xs text-muted-foreground">Next Seva</div>
          <div className="font-bold text-foreground mt-0.5">2nd Tuesday of next month</div>
        </div>
      </div>

      <div className="card-soft divide-y divide-black/5">
        {[
          { icon: FileText, label: "My Seva History" },
          { icon: Settings, label: "Account Settings" },
          { icon: HelpCircle, label: "Help / Support" },
        ].map(({ icon: Icon, label }) => (
          <button key={label} className="w-full flex items-center gap-3 px-4 py-4 hover:bg-secondary/50 transition-colors">
            <Icon size={20} className="text-muted-foreground" />
            <span className="font-semibold text-foreground flex-1 text-left">{label}</span>
            <ArrowRight size={16} className="text-muted-foreground" />
          </button>
        ))}
      </div>

      <button className="w-full text-center text-sm text-destructive font-semibold py-3">
        Log out
      </button>
    </div>
  );
}
