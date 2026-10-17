import Link from "next/link";
import { BUSINESS } from "../policy/content";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-6 px-6 text-center">
      <p className="text-sm uppercase tracking-[0.3em] text-gold">Authentic Nigerian Cuisine Redefined</p>
      <h1 className="font-heading text-5xl text-gold-light">Taste the Luxury</h1>
      <p className="max-w-xl text-lg">Premium Nigerian dishes, crafted with tradition, served with class.</p>
      <p className="text-sm text-cream/80">
        Online ordering is being built. To order now, call or WhatsApp{" "}
        <a className="text-gold underline" href={`tel:${BUSINESS.phone}`}>
          {BUSINESS.phone}
        </a>
        .
      </p>
      <Link className="text-gold underline" href="/refund-policy">
        Refund &amp; Cancellation Policy
      </Link>
    </main>
  );
}
