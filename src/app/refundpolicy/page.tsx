import type { Metadata } from "next";
import { FULL_POLICY, POLICY_VERSION, PAYMENT_VERIFICATION_RULE, YOUR_RIGHTS } from "../../policy/content";

export const metadata: Metadata = { title: "Refund & Cancellation Policy | ROCK UC FOODS" };

export default function RefundPolicyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="font-heading text-3xl text-gold-light">{FULL_POLICY.title}</h1>
      {FULL_POLICY.intro.map((p) => (
        <p key={p} className="mt-3">{p}</p>
      ))}
      {FULL_POLICY.sections.map((s) => (
        <section key={s.heading} className="mt-10">
          <h2 className="font-heading text-xl text-gold">{s.heading}</h2>
          {s.paragraphs?.map((p) => (
            <p key={p} className="mt-3">{p}</p>
          ))}
          {s.bullets && (
            <ul className="mt-3 list-disc space-y-1 pl-6">
              {s.bullets.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          )}
          {s.table && (
            <table className="mt-4 w-full border-collapse text-left">
              <thead>
                <tr>
                  {s.table.columns.map((c) => (
                    <th key={c} className="border border-gold/40 p-2 text-gold">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {s.table.rows.map((r) => (
                  <tr key={r[0]}>
                    <td className="border border-gold/40 p-2">{r[0]}</td>
                    <td className="border border-gold/40 p-2">{r[1]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {s.note && <p className="mt-3 text-cream/80">{s.note}</p>}
        </section>
      ))}
      <section className="mt-10">
        <h2 className="font-heading text-xl text-gold">{PAYMENT_VERIFICATION_RULE.title}</h2>
        <p className="mt-3">{PAYMENT_VERIFICATION_RULE.body}</p>
      </section>
      <section className="mt-10">
        <h2 className="font-heading text-xl text-gold">{YOUR_RIGHTS.title}</h2>
        <p className="mt-3">{YOUR_RIGHTS.body}</p>
        <p className="mt-3">{YOUR_RIGHTS.signoff}</p>
      </section>
      <p className="mt-10 text-sm text-cream/60">Policy version {POLICY_VERSION}</p>
    </main>
  );
}
