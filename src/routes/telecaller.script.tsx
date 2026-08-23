import { createFileRoute } from "@tanstack/react-router";
import { MessageSquareText, ShieldAlert, IndianRupee, FileCheck2 } from "lucide-react";

export const Route = createFileRoute("/telecaller/script")({
  component: ScriptPage,
});

// Static talking points + objection handling (§7.6). No DB, no API —
// free onboarding for the next hire. Hinglish, matching the product
// voice. Update by editing this file; nothing else to sync.

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-2xs p-5">
      <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
        <Icon className="w-4 h-4 text-indigo-700" />
        {title}
      </h2>
      <div className="mt-3 space-y-2 text-sm text-slate-700 leading-relaxed">{children}</div>
    </div>
  );
}

function ScriptPage() {
  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Call Script &amp; Objections</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Bolne ke points — ratta nahi, samajh. Customer ki bhasha mein baat karein.
        </p>
      </div>

      <Section icon={MessageSquareText} title="Call kaise shuru karein">
        <p>
          <b>1.</b> "Namaste 🙏, main [naam] Punyata se bol rahi hoon. Aapko thoda time milega?"
        </p>
        <p>
          <b>2.</b> Wajah bataayein ek line mein — queue ka banner padh kar: "Aapka sankalp adhoora
          hai, parivaar ke naam abhi nahi bhare hain."
        </p>
        <p>
          <b>3.</b> Ek kaam nikalein: naam + gotra, ya address, ya payment link. Ek call = ek
          outcome.
        </p>
        <p>
          <b>4.</b> Call khatam — log karna ZAROORI hai. Bina log kiye call invisible hai.
        </p>
      </Section>

      <Section icon={IndianRupee} title='"Bahut mehenga hai"'>
        <p>"Sir, mahine ke ₹251 se shuruaat hoti hai — roz ke ek chai se kam."</p>
        <p>"Isme har maah Sundarkand, Gau Seva, Vanar Seva aapke parivaar ke naam par hoti hai."</p>
        <p>"Proof WhatsApp par milta hai — video dekh kar aap khud dekh sakte hain kya hua."</p>
      </Section>

      <Section icon={FileCheck2} title='"Paisa jaata kahan hai"'>
        <p>
          "Pushkar mein Tirth Guru Pushkarraj ki seva hoti hai — gau shaala, vanar seva, saadhu
          bhojan. Har seva ka video proof aapko milta hai."
        </p>
        <p>"Poora hisaab aapke saath rehta hai — naamein Pandit ji list mein padhte hain."</p>
      </Section>

      <Section icon={ShieldAlert} title='"Sach ho raha hai kya / proof do"'>
        <p>
          "Ji, har batch ka recording video hota hai — aapke naam ke saath. WhatsApp par bhejte
          hain." (Agar proof nahi mila to card par "Proof nahi mila" button dabayein.)
        </p>
        <p>Kabhi jhooti date/proof na banayein — escalate karein, Chirayu dekh lengi.</p>
      </Section>

      <Section icon={MessageSquareText} title="Roz ke situations">
        <p>
          <b>Cancel karna chahte hain:</b> wajah notes mein likhein, escalate tick karein —
          pause/cancel aapke haath mein NAHI hai, aur yeh jaan-boojh kar aisa hai.
        </p>
        <p>
          <b>Payment fail:</b> method poochein (UPI/card), payment link bhejein — link par customer
          khud pay karta hai. Amount kabhi apne hisaab se na bolein, plans page dikhayein.
        </p>
        <p>
          <b>Gussa/krodh:</b> shant raho, notes likho, escalate karo. Behas mat kijiye.
        </p>
        <p>
          <b>OTP maange:</b> 🚨 KABHI nahi. "Code bol dijiye" = fraud ka signal. Turant escalate
          karein.
        </p>
      </Section>
    </div>
  );
}
