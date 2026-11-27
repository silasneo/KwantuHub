import type { ReactNode } from "react";
import { Link } from "wouter";
import { SiteHeader, SiteFooter } from "@/components/SiteChrome";
import { mediaUrl } from "@/lib/storage";

export const authField = "mt-1.5 w-full rounded-xl border border-[#cfc5b8] bg-white px-4 py-3 text-base font-normal transition focus:border-[#d71466] focus:outline-none focus:ring-2 focus:ring-[#d71466]/20 disabled:bg-[#f5f1eb]";
export const authLabel = "block text-sm font-semibold text-[#0a0a0a]";
export const authLink = "font-semibold text-[#0a0a0a] underline underline-offset-4 hover:text-[#d71466] disabled:opacity-50";
export const authPrimary = "brand-button w-full !rounded-full !py-4 !text-sm";
export const authSecondary = "w-full rounded-full border border-[#0a0a0a] bg-white py-3.5 text-sm font-semibold text-[#0a0a0a] transition hover:bg-[#0a0a0a] hover:text-white disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white disabled:hover:text-[#0a0a0a]";
export const authPanel = "space-y-4 rounded-2xl border border-[#e4dcd0] bg-[#faf6f0] p-5";
export const authNote = "text-sm text-[#4b4843]";
export const authStatus = "rounded-xl bg-[#eef6ee] px-4 py-3 text-sm";
export const authError = "form-error !mt-0 rounded-xl bg-[#fdecec] px-4 py-3 text-sm";
export const authStep = "text-xs font-bold uppercase tracking-widest text-[#d71466]";

export function AuthCard({ title, subtitle, children, wide = false, footer = true }: {
  title: ReactNode; subtitle?: ReactNode; children: ReactNode; wide?: boolean; footer?: boolean;
}) {
  return <div className="min-h-screen bg-[#f0e8dc] flex flex-col">
    <SiteHeader />
    <main className="flex-1 flex items-center justify-center px-4 py-12 sm:py-16">
      <section className={`w-full ${wide ? "max-w-xl" : "max-w-md"} rounded-[28px] bg-white px-6 py-10 shadow-[0_24px_60px_-28px_rgba(10,10,10,0.35)] ring-1 ring-[#0a0a0a]/5 sm:px-10`}>
        <div className="text-center">
          <img src={mediaUrl("public/Kwantu-identity_fc192da7.svg")} alt="KwantuHub" className="mx-auto mb-5 h-12" />
          <h1 className="font-serif text-3xl font-bold leading-tight sm:text-4xl">{title}</h1>
          {subtitle && <div className="mt-3 text-[15px] text-[#4b4843]">{subtitle}</div>}
        </div>
        {children}
        {footer && <>
          <div className="mt-8 h-px bg-[#e4dcd0]" aria-hidden="true" />
          <p className="mt-4 text-center text-xs leading-relaxed text-[#4b4843]">By continuing, you agree to our <Link href="/terms" className="underline underline-offset-2">Terms of Use</Link> and <Link href="/privacy" className="underline underline-offset-2">Privacy Policy</Link>.</p>
        </>}
      </section>
    </main>
    <SiteFooter />
  </div>;
}
